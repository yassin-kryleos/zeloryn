import express from 'express';
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import helmet from 'helmet';
import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { exec, execSync, execFile, execFileSync } from 'child_process';
import { WorkspaceSandbox, type ReviewStatus, classifyCommand } from './tools';
import { DeepSeekClient, type Message } from './deepseek';
import { GeminiClient } from './gemini';
import { OpenAIClient } from './openai';
import { AnthropicClient } from './anthropic';
import { OpenRouterClient } from './openrouter';
import { OllamaClient } from './ollama';
import { GoogleClient } from './google';
import { AgentOrchestrator, type ChatClient, type ResponseMode } from './agents';
import { ChatDatabase, type ChatSession, type ProjectTask } from './db';
import { generateWorkspaceGraph } from './graph';
import { threeWayMerge } from './diff3';
import { getPublicKey } from './security';
import { PlanningV2Service } from './planningV2';
import { CostGuard, estimateTokens, estimateCost, getProviderForModel } from './costGuard';
import { scanSecrets } from './secretScanner';
import { companionHub, type ForgeRunner } from './companionHub';
import { claudeCodeRun, findClaudeCodeBinary, cliAgentRegistry } from './cliAgentRunner';
import { toolApiGateway } from './toolApiGateway';
import { mcpClientManager } from './mcpClient';
import {
  initDeviationStore,
  takeSnapshot,
  computeDeviations,
  getDeviations,
  updateDeviationStatus,
} from './ccDeviationService';
import { generateFounderWorkflow } from './founderWorkflows';
import { generateAgencyWorkflow } from './agencyWorkflows';
import { unresolvedBlockers } from '../shared/dependencies';
import * as crypto from 'crypto';
import { SlidingWindowLimiter } from './slidingWindowLimiter';
import { TerminalManager } from './terminalManager';
import { AuditTrailService } from './auditTrail';
import { handoffRegistry, executeHandoff } from './handoff';
import { runPostExecutionReview } from './postExecutionReviewer';
import { loadDecisions, recordDecision } from './decisionMemory';

dotenv.config();

const LOCAL_SESSION_SECRET = process.env.KRYLEOS_LOCAL_SESSION_SECRET?.trim() || '';
const LOCAL_AUTH_REQUIRED = process.env.NODE_ENV !== 'test' || process.env.KRYLEOS_ENFORCE_LOCAL_AUTH === 'true';
if (LOCAL_AUTH_REQUIRED && LOCAL_SESSION_SECRET.length < 32) {
  throw new Error('FATAL: KRYLEOS_LOCAL_SESSION_SECRET must be set to at least 32 characters.');
}

const COMPANION_AUTH_TOKEN = process.env.KRYLEOS_COMPANION_AUTH_TOKEN?.trim() || '';

export function isValidCompanionAuthToken(candidate: unknown): boolean {
  if (!COMPANION_AUTH_TOKEN) return true; // optional — no constraint when unset
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  const expected = Buffer.from(COMPANION_AUTH_TOKEN);
  const provided = Buffer.from(candidate);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

export function isValidLocalSessionSecret(candidate: unknown): boolean {
  if (!LOCAL_AUTH_REQUIRED) return true;
  if (typeof candidate !== 'string') return false;
  const expected = Buffer.from(LOCAL_SESSION_SECRET);
  const provided = Buffer.from(candidate);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

let globalZeroEgressMode = false;
let globalPrivacyMode = false;

function getResponseModeInstructions(responseMode: ResponseMode): string {
  switch (responseMode) {
    case 'concise':
      return 'RESPONSE MODE: Concise. Give a direct answer, avoid filler, avoid restating context, and keep output as short as practical.';
    case 'critical':
      return 'RESPONSE MODE: Critical Reviewer. Be direct and skeptical. Call out mistakes, risky assumptions, and missing evidence clearly.';
    case 'brutal_audit':
      return 'RESPONSE MODE: Brutal Audit. Be blunt and terse. Lead with defects, risks, and contradictions. Do not flatter.';
    case 'minimal_context':
      return 'RESPONSE MODE: Minimal Context. Prioritize brevity and speed. Exclude non-essential details and focus strictly on the immediate query.';
    case 'docs_heavy':
      return 'RESPONSE MODE: Docs-Heavy. Focus heavily on detailed inline documentation, docstrings, codebase explanation files, and user documentation.';
    case 'code_only':
      return 'RESPONSE MODE: Code-Only. Output strictly raw code blocks and files with minimal conversational wrapper text.';
    default:
      return 'RESPONSE MODE: Balanced. Be clear, useful, and appropriately concise.';
  }
}

function optimizePromptForMode(text: string, responseMode: ResponseMode): string {
  if (responseMode === 'concise') {
    const maxChars = 6000;
    if (text.length <= maxChars) return text;
    return `${text.slice(0, 4500)}\n\n[CONCISE MODE TRUNCATION: Middle content omitted to reduce unnecessary token usage.]\n\n${text.slice(-1200)}`;
  }
  if (responseMode === 'minimal_context') {
    const maxChars = 3000;
    if (text.length <= maxChars) return text;
    return `${text.slice(0, 2000)}\n\n[MINIMAL CONTEXT MODE TRUNCATION: Context aggressively trimmed to minimize tokens.]\n\n${text.slice(-800)}`;
  }
  return text;
}

async function resolveQueryMentions(text: string, sandbox: WorkspaceSandbox): Promise<string> {
  const mentionRegex = /(?:^|\s)@([a-zA-Z0-9_\-\.\/\\~\*]+)/g;
  const matches = [...text.matchAll(mentionRegex)];
  if (matches.length === 0) return text;

  const contextBlocks: string[] = [];
  const processedPaths = new Set<string>();
  const ignoredKeywords = new Set([
    'architect', 'keymaker', 'oracle', 'sentinel', 'assistant',
    'system', 'user', 'developer', 'researcher', 'coordinator'
  ]);

  for (const match of matches) {
    const rawPath = match[1];
    if (ignoredKeywords.has(rawPath.toLowerCase())) continue;
    if (processedPaths.has(rawPath)) continue;
    processedPaths.add(rawPath);

    // Expand wildcard matches (e.g. @src/components/* or @src/components/*.ts)
    if (rawPath.includes('*')) {
      try {
        const starIndex = rawPath.indexOf('*');
        const dirPart = rawPath.substring(0, starIndex);
        const cleanDirPart = dirPart.endsWith('/') ? dirPart.slice(0, -1) : dirPart;
        const extPart = rawPath.substring(starIndex + 1);

        const targetDir = cleanDirPart || '.';
        const entries = await sandbox.listDir(targetDir);

        for (const file of entries) {
          if (file.isDirectory) continue;
          if (extPart && !file.name.endsWith(extPart)) continue;

          const relativeFilePath = targetDir === '.' ? file.name : `${targetDir}/${file.name}`;
          if (processedPaths.has(relativeFilePath)) continue;
          processedPaths.add(relativeFilePath);

          try {
            const fileContent = await sandbox.readFile(relativeFilePath);
            contextBlocks.push(`\n[REFERENCED FILE PATH: ${relativeFilePath}]\n\`\`\`\n${fileContent}\n\`\`\``);
          } catch {
            // Ignore individual file read errors
          }
        }
      } catch (err: any) {
        contextBlocks.push(`\n[WARNING: Could not expand wildcard mention "${rawPath}"]`);
        console.warn('Wildcard mention expansion failed:', err.message);
      }
      continue;
    }

    try {
      const fileContent = await sandbox.readFile(rawPath);
      contextBlocks.push(`\n[REFERENCED FILE PATH: ${rawPath}]\n\`\`\`\n${fileContent}\n\`\`\``);

      // Scan for relative imports: e.g. import { X } from './utils';
      const importRegex = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
      const importMatches = [...fileContent.matchAll(importRegex)];
      
      const fileDir = path.dirname(rawPath);

      for (const impMatch of importMatches) {
        const relativeImportPath = impMatch[1];
        const resolvedImportBase = path.join(fileDir, relativeImportPath).replace(/\\/g, '/');
        
        // Potential extensions to try resolving
        const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
        let resolvedContent = '';
        let foundPath = '';

        for (const ext of extensions) {
          const testPath = resolvedImportBase + ext;
          if (processedPaths.has(testPath)) continue;
          try {
            resolvedContent = await sandbox.readFile(testPath);
            foundPath = testPath;
            break;
          } catch {
            // Extension didn't match, keep checking
          }
        }

        if (foundPath && resolvedContent) {
          processedPaths.add(foundPath);
          contextBlocks.push(`\n[IMPORTED DEPENDENCY OF ${rawPath} -> PATH: ${foundPath}]\n\`\`\`\n${resolvedContent}\n\`\`\``);
        }
      }
    } catch (err: any) {
      contextBlocks.push(`\n[WARNING: Could not reference file "${rawPath}"]`);
      console.warn('File reference failed:', err.message);
    }
  }

  return `${text}\n\n=== REFERENCE CONTEXT ===\n${contextBlocks.join('\n')}`;
}

const app = express();
const trustedHttpOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
]);

// SEC-M4: security headers. CSP and cross-origin resource policy are disabled
// here because this is a local API behind a custom CORS layer (below) and the
// HTML is served separately by Vite; helmet still adds X-Content-Type-Options,
// X-Frame-Options, Referrer-Policy, etc.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
}));

// SEC-M4: rate limiter for sensitive auth/pairing routes to blunt brute force.
// Uses native internal SlidingWindowLimiter.
const _sensitiveLimiter = new SlidingWindowLimiter(30, 15 * 60 * 1000);
const sensitiveLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!_sensitiveLimiter.consume(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
};

app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Exempt telemetry and companion websockets from origin restriction checks
  const isExempt = req.path === '/api/telemetry' ||
                   req.path === '/api/companion/ws';
  
  if (origin) {
    const isLocal = trustedHttpOrigins.has(origin) || /^vscode-webview:\/\/[a-z0-9-]+$/i.test(origin);
                    
    if (!isLocal && !isExempt) {
      console.warn(`[Security Alert] Blocked request to ${req.path} from untrusted origin: ${origin}`);
      return res.status(403).json({ error: 'Access Denied: Request origin is untrusted.' });
    }
    
    // Configure CORS headers dynamically
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Kryleos-Session');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    // If no origin is provided, fallback to allow-all or specific localhost for cross-origin compliance
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// SEC: true if this request arrived over the loopback interface, regardless
// of which interface the server is bound to (see SEC-B5 — companion-over-LAN
// users set KRYLEOS_BIND_HOST=0.0.0.0).
function isLoopbackRequest(req: express.Request): boolean {
  const addr = req.socket.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

// SEC: the pairing code/secret are displayed as a QR code by the desktop UI
// for the user to scan with their phone — they must never be served to a
// network caller. Without this guard, a device on the same LAN/Tailnet as a
// companion-enabled instance (KRYLEOS_BIND_HOST=0.0.0.0) could fetch the
// pairing secret directly and self-register via PAIR_DEVICE, bypassing the
// pairing code entirely.
function requireLoopback(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isLoopbackRequest(req)) {
    return res.status(403).json({ error: 'This endpoint is only available to the local desktop app.' });
  }
  next();
}

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  if (!LOCAL_AUTH_REQUIRED) return next();
  if (req.method === 'OPTIONS') return next();
  if (!isValidLocalSessionSecret(req.headers['x-kryleos-session'])) {
    console.warn(`[Security] Local session auth failed: ${req.method} ${req.path} from ${req.socket.remoteAddress}`);
    return res.status(401).json({ error: 'Unauthorized local client.' });
  }
  next();
});

const server = http.createServer(app);
let totalBytesSent = 0;
let totalBytesReceived = 0;

const wss = new WebSocketServer({ 
  noServer: true,
  maxPayload: 1024 * 1024,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    concurrencyLimit: 10
  }
});

const companionServer = http.createServer((_req, res) => {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});
const companionWss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
const companionIpLimiter = new SlidingWindowLimiter(30, 60 * 1000);
const terminalOpLimiter = new SlidingWindowLimiter(30, 5 * 1000);

const trustedRendererOrigins = new Set([
  ...trustedHttpOrigins,
  'file://',
]);

export function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function isTrustedLocalWebSocketRequest(req: Pick<http.IncomingMessage, 'headers' | 'socket'>): boolean {
  const origin = req.headers.origin;
  return (typeof origin === 'string' && trustedRendererOrigins.has(origin)) ||
    (!origin && isLoopbackAddress(req.socket.remoteAddress));
}

export function isAuthenticatedLocalWebSocketRequest(req: Pick<http.IncomingMessage, 'headers' | 'socket' | 'url'>): boolean {
  if (!isTrustedLocalWebSocketRequest(req)) return false;
  const url = new URL(req.url || '/', 'http://localhost');
  return isValidLocalSessionSecret(url.searchParams.get('session')) ||
    isValidLocalSessionSecret(req.headers?.['x-kryleos-session']);
}

function rejectUpgrade(socket: import('node:stream').Duplex, status = '403 Forbidden') {
  console.warn(`[Security] WebSocket upgrade rejected: ${status}`);
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname !== '/') return rejectUpgrade(socket, '404 Not Found');

  if (!isAuthenticatedLocalWebSocketRequest(req)) return rejectUpgrade(socket);

  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

companionServer.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname !== '/api/companion/ws') return rejectUpgrade(socket, '404 Not Found');
  const remoteAddress = req.socket.remoteAddress || 'unknown';
  if (!companionIpLimiter.consume(remoteAddress)) return rejectUpgrade(socket, '429 Too Many Requests');
  if (!isValidCompanionAuthToken(new URL(req.url || '/', 'http://localhost').searchParams.get('auth'))) {
    console.warn(`[Security] Companion WS upgrade rejected: invalid/missing auth token from ${remoteAddress}`);
    return rejectUpgrade(socket, '403 Forbidden');
  }
  companionWss.handleUpgrade(req, socket, head, ws => companionWss.emit('connection', ws, req));
});

companionWss.on('connection', (ws, req) => companionHub.handleConnection(ws, req));

const chatDb = new ChatDatabase();
// Active project id (set via POST /api/projects/active). The planning layer
// must read the same FLOW board the renderer writes: project-scoped
// `flow_board_<projectId>` when a project is active, global `flow_board` otherwise.
let activeProjectId: string | null = null;
const activeFlowSessionId = () => (activeProjectId ? `flow_board_${activeProjectId}` : 'flow_board');
const planningV2 = () => new PlanningV2Service(chatDb, sandbox.getWorkspaceRoot(), activeFlowSessionId());

// Server-side blockedBy enforcement: locate the plan item across saved FLOW
// boards (`flow_board` and project-scoped `flow_board_*` sessions) and return
// its unresolved blocker ids. A blocked item must never reach FORGE even if a
// client (UI, VS Code extension, or raw WebSocket caller) skips the UI gate.
async function findUnresolvedBlockers(planItemId: string): Promise<string[]> {
  const sessions = await chatDb.listSessions('project');
  for (const meta of sessions) {
    const session = await chatDb.getSession(meta.id);
    const tasks = session?.tasks || [];
    if (tasks.some(task => task.id === planItemId)) {
      return unresolvedBlockers(tasks, planItemId);
    }
  }
  return [];
}

// Phase 5.4: resolves a remote START_FORGE_RUN's planItemId to its
// ProjectTask, the same way findUnresolvedBlockers locates it across saved
// FLOW boards (`flow_board` and project-scoped `flow_board_*` sessions).
async function findTaskById(planItemId: string): Promise<ProjectTask | null> {
  const sessions = await chatDb.listSessions('project');
  for (const meta of sessions) {
    const session = await chatDb.getSession(meta.id);
    const task = (session?.tasks || []).find(t => t.id === planItemId);
    if (task) return task;
  }
  return null;
}

// Phase 5.6: records FORGE-run initiations to `.kryleos/command_initiations.json`,
// mirroring the {source, deviceId} audit fields agents.ts now writes to
// command_approvals.json for approve/reject/abort.
export async function logCommandInitiation(workspaceRoot: string, entry: { planItemId: string; deviceId?: string; source: 'local' | 'remote' }): Promise<void> {
  try {
    const dir = path.join(workspaceRoot, '.kryleos');
    const filePath = path.join(dir, 'command_initiations.json');
    await fs.promises.mkdir(dir, { recursive: true });
    let logs = [];
    try {
      const existing = await fs.promises.readFile(filePath, 'utf8');
      logs = JSON.parse(existing);
    } catch {}
    logs.push({
      timestamp: new Date().toISOString(),
      planItemId: entry.planItemId,
      deviceId: entry.deviceId ?? null,
      source: entry.source
    });
    await fs.promises.writeFile(filePath, JSON.stringify(logs, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to log command initiation:', err);
  }
}

async function checkSpendCapBlocked(workspaceRoot: string): Promise<string | null> {
  const capCheck = await new CostGuard(workspaceRoot).checkSpendCap();
  return capCheck.allowed ? null : `Execution blocked by CostGuard spend enforcement: ${capCheck.reason}`;
}

// Phase 5.4: the FORGE-run launch body shared by the local `case 'query'`
// handler and a remote companion's START_FORGE_RUN. `send` decouples it from
// a specific WebSocket so a remote run can broadcast to all paired companions
// instead of replying to one `ws`.
async function startForgeRun(opts: {
  orchestrator: AgentOrchestrator;
  queryText: string;
  originalText: string;
  sessionId?: string;
  space: 'code' | 'cowork' | 'project';
  planItemId?: string;
  zeroEgressMode: boolean;
  modelProxy: ChatClient;
  send: (payload: any) => void;
  deviceId?: string;
  source?: 'local' | 'remote';
}): Promise<void> {
  const { orchestrator, queryText, originalText, sessionId, space, planItemId, zeroEgressMode, modelProxy, send, deviceId, source } = opts;

  // 7e: Spend cap enforcement check
  const spendBlocked = await checkSpendCapBlocked(sandbox.getWorkspaceRoot());
  if (spendBlocked) {
    send({ type: 'error', message: spendBlocked });
    orchestrator.addLog('SYSTEM', 'user', `[SPEND CAP BLOCKED] ${spendBlocked}`, 'error');
    return;
  }

  if (planItemId) {
    await logCommandInitiation(sandbox.getWorkspaceRoot(), { planItemId, deviceId, source: source || 'local' });
    const markerDir = path.join(sandbox.getWorkspaceRoot(), '.kryleos');
    fs.mkdirSync(markerDir, { recursive: true });
    const markerPath = path.join(markerDir, 'run-in-progress.json');
    const markerTemp = `${markerPath}.${process.pid}.tmp`;
    fs.writeFileSync(markerTemp, JSON.stringify({ planItemId, startedAt: new Date().toISOString() }, null, 2), 'utf-8');
    fs.renameSync(markerTemp, markerPath);
  }
  send({ type: 'status', message: 'Orchestrating agents...' });
  if (zeroEgressMode) {
    orchestrator.addLog('SYSTEM', 'user', 'All model calls are local — no data sent to external providers', 'info');
  }
  await orchestrator.handleUserQuery(queryText, sessionId, space, originalText);
  if (planItemId) {
    try {
      const runState = orchestrator.getRunState();
      const trace = await planningV2().saveTrace({
        planItemId,
        logs: orchestrator.getLogs(),
        client: runState.incomplete ? undefined : modelProxy,
        suggestedStatus: runState.incomplete ? 'in_progress' : undefined,
        incompleteReason: runState.reason,
        summary: runState.incomplete ? `INCOMPLETE RUN: ${runState.reason}. Review evidence and rerun before marking complete.` : undefined
      });
      const markerPath = path.join(sandbox.getWorkspaceRoot(), '.kryleos', 'run-in-progress.json');
      if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
      send({ type: 'execution_trace', trace, message: `Execution trace saved for plan item ${planItemId}.` });
      companionHub.broadcastSessionUpdate({ latestTrace: trace });

      // 7a: Post-execution CREW reviewer triggered at FORGE completion
      try {
        const { task } = await planningV2().getCriteria(planItemId);
        if (task) {
          send({ type: 'status', message: 'Running Post-Execution CREW reviewer...' });
          const review = await runPostExecutionReview(sandbox.getWorkspaceRoot(), task, modelProxy);
          await planningV2().savePostExecutionReview(planItemId, review);
          send({ type: 'post_execution_review', planItemId, review });
          companionHub.broadcastSessionUpdate({ postExecutionReview: { planItemId, review } });
          orchestrator.addLog(
            'post_execution_reviewer',
            'coordinator',
            `[POST-EXECUTION REVIEW] Verdict: ${review.verdict}\nFindings: ${review.findings}`,
            review.status === 'passed' ? 'result' : 'error'
          );
        }
      } catch (revErr: any) {
        console.warn('Post-execution review non-critical error:', revErr.message);
      }
    } catch (traceErr: any) {
      send({ type: 'error', message: `Trace capture failed: ${traceErr.message}` });
    }
  }
}

// Set default workspace root to the directory this application is running in
const defaultWorkspace = path.resolve(process.cwd());

const sandbox = new WorkspaceSandbox(defaultWorkspace);
companionHub.setWorkspaceRoot(defaultWorkspace);
initDeviationStore(path.join(defaultWorkspace, '.kryleos', 'cc-deviations.json'));
const pendingTerminalApprovals = new Map<string, (approved: boolean) => void>();

// Terminal approval callback — looks up the session's ws via terminalManager
// so it works at module scope where no bare `ws` variable exists.
const terminalOnCommand = async (sessionId: string, command: string, classification: import('./tools').CommandClassification): Promise<boolean> => {
  const session = terminalManager.getSession(sessionId);
  if (!session) return false;
  const approvalPromise = new Promise<boolean>((resolve) => {
    pendingTerminalApprovals.set(sessionId, resolve);
  });
  try {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({
        type: 'terminal_approval_required',
        sessionId,
        command,
        destructive: classification.destructive,
        reason: classification.reason || 'Destructive command requires approval',
      }));
    }
  } catch { /* ws may have disconnected */ }
  const result = await approvalPromise;
  pendingTerminalApprovals.delete(sessionId);
  return result;
};

let terminalManager = new TerminalManager({
  workspaceRoot: defaultWorkspace,
  onCommand: terminalOnCommand,
  onTerminalOutput: (sessionId: string, data: string) => companionHub.broadcastTerminalOutput(sessionId, data),
});
const deepseekClient = new DeepSeekClient({
  apiKey: '',
  model: 'deepseek-chat'
});
const geminiClient = new GeminiClient({
  apiKey: '',
  model: 'gemini-2.5-flash',
  useSearch: false
});
const openaiClient = new OpenAIClient({
  apiKey: '',
  model: 'gpt-4o-mini'
});
const anthropicClient = new AnthropicClient({
  apiKey: '',
  model: 'claude-3-5-sonnet-latest'
});
const openrouterClient = new OpenRouterClient({
  apiKey: '',
  model: 'meta-llama/llama-3.3-70b-instruct'
});
const ollamaClient = new OllamaClient({
  model: 'llama3'
});

function isOllamaModel(model: string): boolean {
  return model.startsWith('ollama:') || model === 'llama3' || model === 'qwen2.5-coder';
}

function normalizeOllamaModel(model: string): string {
  return model.startsWith('ollama:') ? model.slice('ollama:'.length) : model;
}

// Last model selected by any connection. Lets REST routes (e.g. plan drift) reach
// the configured provider outside the per-connection WebSocket scope. Falls back
// gracefully: if no key is configured the call errors and callers no-op.
let activeModel = 'ollama:qwen2.5-coder';
const getModelClient = (overridePrivacy?: boolean): ChatClient => ({
  async chatStream(messages, callbacks) {
    if ((globalZeroEgressMode || globalPrivacyMode) && !isOllamaModel(activeModel)) {
      if (globalPrivacyMode && overridePrivacy) {
        // Allowed manual override
      } else {
        const modeName = globalPrivacyMode ? 'Privacy Mode' : 'Zero Egress Mode';
        const err = new Error(`${modeName} is active. External API calls to hosted models are blocked at the server layer.`);
        callbacks.onError?.(err);
        return;
      }
    }
    if (activeModel.startsWith('gemini')) {
      return geminiClient.chatStream(messages, callbacks);
    }
    const adapted = {
      onContentChunk: callbacks.onContentChunk,
      onComplete: (content: string) => callbacks.onComplete?.(content, ''),
      onError: callbacks.onError
    };
    if (activeModel.startsWith('gpt')) return openaiClient.chatStream(messages, adapted);
    if (activeModel.startsWith('claude')) return anthropicClient.chatStream(messages, adapted);
    if (isOllamaModel(activeModel)) {
      ollamaClient.setModel(normalizeOllamaModel(activeModel));
      return ollamaClient.chatStream(messages, adapted);
    }
    if (activeModel.includes('/') || activeModel.startsWith('meta-') || activeModel.startsWith('qwen/')) {
      return openrouterClient.chatStream(messages, adapted);
    }
    return deepseekClient.chatStream(messages, adapted);
  }
});

const secretsRoot = process.env.KRYLEOS_DATA_DIR?.trim()
  ? path.resolve(process.env.KRYLEOS_DATA_DIR)
  : (process.env.USERPROFILE || process.env.HOME || defaultWorkspace);
const secretsFilePath = path.join(secretsRoot, '.kryleos_forge_secrets.json');
const dataFilePath = (name: string) => process.env.KRYLEOS_DATA_DIR?.trim()
  ? path.resolve(process.env.KRYLEOS_DATA_DIR, name)
  : path.resolve(process.cwd(), name);
let credentialsWriteQueue: Promise<void> = Promise.resolve();

async function readCredentialsFile(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.promises.readFile(secretsFilePath, 'utf-8'));
  } catch (err: any) {
    if (err?.code === 'ENOENT') return {};
    throw err;
  }
}

function updateCredentialsFile(update: (current: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
  const write = credentialsWriteQueue.then(async () => {
    const current = await readCredentialsFile();
    const next = update(current);
    await fs.promises.mkdir(path.dirname(secretsFilePath), { recursive: true });
    const tempPath = `${secretsFilePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.promises.writeFile(tempPath, JSON.stringify(next, null, 2), 'utf-8');
    await fs.promises.rename(tempPath, secretsFilePath);
  });
  credentialsWriteQueue = write.catch(() => undefined);
  return write;
}

function deleteCredentialsFile(): Promise<void> {
  const deletion = credentialsWriteQueue.then(async () => {
    try {
      await fs.promises.unlink(secretsFilePath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }
  });
  credentialsWriteQueue = deletion.catch(() => undefined);
  return deletion;
}

const googleClient = new GoogleClient({
  clientId: process.env.GOOGLE_CLIENT_ID || '1048684784400-mockclientid.apps.googleusercontent.com',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'mock_secret_foo_bar_123'
});

if (fs.existsSync(secretsFilePath)) {
  try {
    const content = fs.readFileSync(secretsFilePath, 'utf-8').trim();
    const parsed = JSON.parse(content);
    if (parsed.googleTokens) {
      googleClient.setTokens(parsed.googleTokens);
    }
  } catch (err) {
    console.warn('Corrupted secrets file — resetting:', err instanceof Error ? err.message : err);
    try { fs.unlinkSync(secretsFilePath); } catch (_) { /* ignore */ }
  }
}

app.get('/api/sessions', async (req, res) => {
  try {
    const list = await chatDb.listSessions(req.query.space as any);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const session = await chatDb.getSession(req.params.id);
    if (!session) {
      if (req.params.id === 'flow_board' || req.params.id.startsWith('flow_board_')) {
        return res.json({
          id: req.params.id,
          title: 'FLOW Board',
          createdAt: new Date().toISOString(),
          logs: [],
          checklist: [],
          space: 'project',
          tasks: []
        });
      }
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await chatDb.deleteSession(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

// Strip HTML tags from a string to prevent stored XSS (SEC-7).
function stripHtml(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(/<[^>]*>/g, '');
}

function sanitizeTask(task: unknown): unknown {
  if (!task || typeof task !== 'object') return task;
  const t = task as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(t).map(([k, v]) => [k, stripHtml(v)])
  );
}

// REST fallback for board persistence so task saves survive a closed
// WebSocket. Mirrors the WS `save_tasks` path.
app.put('/api/sessions/:id/tasks', async (req, res) => {
  const tasks = req.body?.tasks;
  if (!Array.isArray(tasks)) {
    return res.status(400).json({ success: false, error: 'tasks array is required' });
  }
  try {
    const existing = await chatDb.getSession(req.params.id);
    const session: ChatSession = existing || {
      id: req.params.id,
      title: req.params.id === 'flow_board' ? 'FLOW Board' : 'Project Tasks',
      createdAt: new Date().toISOString(),
      logs: [],
      checklist: [],
      space: 'project' as const,
      tasks: []
    };
    session.tasks = tasks.map(sanitizeTask) as ProjectTask[];
    await chatDb.saveSession(session);
    res.json({ success: true, tasks: session.tasks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.get('/api/workspace', (_req, res) => {
  res.json({
    workspaceRoot: sandbox.getWorkspaceRoot(),
    defaultWorkspace
  });
});

app.post('/api/workspace', (req, res) => {
  const { path: newPath } = req.body;
  if (!newPath) {
    return res.status(400).json({ error: 'path is required' });
  }
  try {
    sandbox.setWorkspaceRoot(newPath);
    companionHub.setWorkspaceRoot(newPath);
    terminalManager = new TerminalManager({ workspaceRoot: newPath, onCommand: terminalOnCommand, onTerminalOutput: (s: string, d: string) => companionHub.broadcastTerminalOutput(s, d) });
    res.json({ success: true, workspaceRoot: sandbox.getWorkspaceRoot() });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/projects', (req, res) => {
  try {
    const projectsPath = dataFilePath('projects.json');
    let projects = [];
    if (fs.existsSync(projectsPath)) {
      const content = fs.readFileSync(projectsPath, 'utf-8');
      projects = JSON.parse(content || '[]');
    }
    res.json({ success: true, projects });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/projects/create', async (req, res) => {
  const { name, folderPath, gitUrl, description } = req.body;
  if (!name || !folderPath) {
    return res.status(400).json({ error: 'name and folderPath are required' });
  }

  try {
    const resolvedPath = path.resolve(folderPath);
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }

    const projectsPath = dataFilePath('projects.json');
    let projects: any[] = [];
    if (fs.existsSync(projectsPath)) {
      const content = fs.readFileSync(projectsPath, 'utf-8');
      projects = JSON.parse(content || '[]');
    }

    const newProject = {
      id: `project_${Date.now()}`,
      name,
      workspaceFolder: resolvedPath,
      gitUrl: gitUrl || '',
      description: description || ''
    };

    const finalizeProject = () => {
      // Avoid duplicate folder paths
      const filtered = projects.filter((p: any) => p.workspaceFolder !== resolvedPath);
      filtered.push(newProject);
      fs.writeFileSync(projectsPath, JSON.stringify(filtered, null, 2), 'utf-8');
      sandbox.setWorkspaceRoot(resolvedPath);
      activeProjectId = newProject.id;
      res.json({ success: true, project: newProject, workspaceRoot: resolvedPath });
    };

    if (gitUrl && gitUrl.trim()) {
      if (!fs.existsSync(path.join(resolvedPath, '.git'))) {
        execFile('git', ['clone', gitUrl, '.'], { cwd: resolvedPath }, (err, stdout, stderr) => {
          if (err) {
            console.error('Git clone failed:', stderr || err.message);
            newProject.description = `${newProject.description} (Git clone failed — see server log for details)`.trim();
            console.error('Git clone details:', err.message);
          }
          finalizeProject();
        });
        return;
      }
    }

    finalizeProject();
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/projects/active', (req, res) => {
  const { id } = req.body;
  try {
    const projectsPath = dataFilePath('projects.json');
    let projects = [];
    if (fs.existsSync(projectsPath)) {
      const content = fs.readFileSync(projectsPath, 'utf-8');
      projects = JSON.parse(content || '[]');
    }
    const project = projects.find((p: any) => p.id === id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    sandbox.setWorkspaceRoot(project.workspaceFolder);
    activeProjectId = project.id;
    planningV2().recoverInterruptedRun().catch(err => console.error('Interrupted trace recovery failed:', err));
    res.json({ success: true, project, workspaceRoot: project.workspaceFolder });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/demo/start', async (_req, res) => {
  try {
    const home = process.env.USERPROFILE || process.env.HOME || defaultWorkspace;
    const demoRoot = process.env.KRYLEOS_DATA_DIR
      ? path.join(process.env.KRYLEOS_DATA_DIR, 'Kryleos Forge Demo')
      : path.join(home, 'Documents', 'Kryleos Forge Demo');
    const sourceDir = path.join(demoRoot, 'src');
    const sourcePath = path.join(sourceDir, 'hello.js');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(sourcePath, "console.log('Kryleos demo trace: PASS');\n", 'utf-8');
    fs.writeFileSync(
      path.join(demoRoot, 'README.md'),
      '# Kryleos Forge Demo\n\nThis bundled project produces a deterministic demo trace without an AI provider.\n',
      'utf-8'
    );

    const output = execFileSync(process.execPath, ['src/hello.js'], {
      cwd: demoRoot,
      encoding: 'utf-8',
      timeout: 10_000
    }).trim();

    const project = {
      id: 'project_demo',
      name: 'Kryleos Trace Demo',
      workspaceFolder: demoRoot,
      gitUrl: '',
      description: 'Deterministic no-key demo. No AI model is called.'
    };
    const projectsPath = dataFilePath('projects.json');
    let projects: any[] = [];
    if (fs.existsSync(projectsPath)) projects = JSON.parse(fs.readFileSync(projectsPath, 'utf-8') || '[]');
    projects = projects.filter((entry: any) => entry.id !== project.id && entry.workspaceFolder !== demoRoot);
    projects.push(project);
    fs.writeFileSync(projectsPath, JSON.stringify(projects, null, 2), 'utf-8');

    sandbox.setWorkspaceRoot(demoRoot);
    companionHub.setWorkspaceRoot(demoRoot);
    activeProjectId = project.id;

    const task: ProjectTask = {
      id: 'demo_green_trace',
      title: 'Produce a verified hello-world trace',
      status: 'in_progress',
      assignee: 'Demo Runner',
      category: 'testing',
      source: 'Bundled deterministic demo',
      acceptanceCriteria: [{
        id: 'demo-file-exists',
        type: 'file_exists',
        description: 'The demo output file exists.',
        target: 'src/hello.js',
        phase: 'phase1'
      }],
      lastModified: new Date().toISOString()
    };
    const sessionId = `flow_board_${project.id}`;
    const demoPlanning = new PlanningV2Service(chatDb, demoRoot, sessionId);
    await chatDb.saveSession({
      id: sessionId,
      title: 'Kryleos Trace Demo',
      createdAt: new Date().toISOString(),
      logs: [],
      checklist: [],
      space: 'project',
      tasks: [task]
    });
    const trace = await demoPlanning.saveTrace({
      planItemId: task.id,
      mode: 'demo',
      summary: 'DEMO REPLAY: created and executed a local hello-world file. No model or API key was used.',
      filesChanged: ['src/hello.js', 'README.md'],
      commandsRun: [`${process.execPath} src/hello.js`],
      outcomes: [output],
      suggestedStatus: 'done'
    });

    res.json({ success: true, project, task, trace, replayed: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.delete('/api/projects/:id', (req, res) => {
  try {
    const projectsPath = dataFilePath('projects.json');
    let projects = [];
    if (fs.existsSync(projectsPath)) {
      const content = fs.readFileSync(projectsPath, 'utf-8');
      projects = JSON.parse(content || '[]');
    }
    const updated = projects.filter((p: any) => p.id !== req.params.id);
    fs.writeFileSync(projectsPath, JSON.stringify(updated, null, 2), 'utf-8');
    if (activeProjectId === req.params.id) activeProjectId = null;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/workspace/revert', async (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }
  try {
    const success = await sandbox.revertFile(filePath);
    res.json({ success, message: success ? `Reverted ${path.basename(filePath)} to snapshot state` : 'No snapshot available for this file' });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/git/status', async (_req, res) => {
  try {
    const status = await sandbox.gitStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/git/stage', async (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }
  try {
    const success = await sandbox.gitStage(filePath);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/review/current', async (_req, res) => {
  try {
    const state = await sandbox.gitReviewCurrent();
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/review/status', async (req, res) => {
  const { path: filePath, status } = req.body as { path?: string; status?: ReviewStatus };
  const validStatuses: ReviewStatus[] = ['pending', 'accepted', 'rejected', 'reverted', 'staged'];
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'valid status is required' });
  }
  try {
    const result = await sandbox.setReviewStatus(filePath, status);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/review/stage', async (req, res) => {
  const { path: filePath, staged } = req.body as { path?: string; staged?: boolean };
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }
  try {
    const result = await sandbox.gitReviewStage(filePath, staged !== false);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/review/revert', async (req, res) => {
  const { path: filePath } = req.body as { path?: string };
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }
  try {
    const result = await sandbox.gitReviewRevert(filePath);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

// ── CC Deviation API ─────────────────────────────────────────────────────────
app.get('/api/cc-deviations', async (_req, res) => {
  try {
    const records = getDeviations();
    res.json({ success: true, records });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/cc-deviations/status', async (req, res) => {
  const { id, status } = req.body as { id?: string; status?: string };
  if (!id) return res.status(400).json({ error: 'id is required' });
  if (!['pending', 'accepted', 'rejected'].includes(status || '')) {
    return res.status(400).json({ error: 'status must be pending, accepted, or rejected' });
  }
  try {
    const record = updateDeviationStatus(id, status as 'pending' | 'accepted' | 'rejected');
    if (!record) return res.status(404).json({ error: 'Deviation record not found' });
    res.json({ success: true, record });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

// ── Tool API Gateway Endpoints ──────────────────────────────────────────────
app.get('/api/tools', (_req, res) => {
  try {
    const tools = toolApiGateway.listTools();
    res.json({ success: true, tools });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tools/invoke', async (req, res) => {
  const { toolId, args, planItemId, sessionId } = req.body;
  if (!toolId) return res.status(400).json({ error: 'toolId is required' });
  try {
    const result = await toolApiGateway.invokeTool(
      toolId,
      args || {},
      {
        workspaceRoot: sandbox.getWorkspaceRoot(),
        sandbox,
        sessionId: sessionId || 'api_session',
        planItemId,
        zeroEgressMode: globalZeroEgressMode,
      }
    );
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── MCP Server Management Endpoints ─────────────────────────────────────────
app.get('/api/mcp/servers', (_req, res) => {
  try {
    const servers = mcpClientManager.listServers();
    res.json({ success: true, servers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/mcp/servers', (req, res) => {
  const config = req.body;
  if (!config || !config.id || !config.name || !config.transport) {
    return res.status(400).json({ error: 'id, name, and transport are required' });
  }
  try {
    mcpClientManager.addServer({
      id: config.id,
      name: config.name,
      transport: config.transport,
      command: config.command,
      args: config.args,
      url: config.url,
      authTokenRef: config.authTokenRef,
      enabled: config.enabled ?? false,
      discoveryStatus: config.discoveryStatus ?? 'not_started',
      workspaceTrust: config.workspaceTrust ?? 'untrusted',
      featureStatus: config.featureStatus ?? 'preview',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      allowedTools: config.allowedTools,
      deniedTools: config.deniedTools,
    });
    res.json({ success: true, server: mcpClientManager.getServer(config.id) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/mcp/servers/:id/discover', async (req, res) => {
  const { id } = req.params;
  try {
    const tools = await mcpClientManager.discoverTools(id, toolApiGateway);
    res.json({ success: true, count: tools.length, tools });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/mcp/servers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await mcpClientManager.removeServer(id, toolApiGateway);
    res.json({ success: deleted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/git/commit', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }
  try {
    const result = await sandbox.gitCommit(message);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/git/remote', async (req, res) => {
  const { url, token } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    const result = await sandbox.gitSetRemote(url, token);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/git/push', async (req, res) => {
  const { branch } = req.body;
  try {
    const result = await sandbox.gitPush(branch || 'main');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/git/pull', async (req, res) => {
  const { branch } = req.body;
  try {
    const result = await sandbox.gitPull(branch || 'main');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/files', async (req, res) => {
  const dirPath = (req.query.path as string) || '.';
  try {
    const list = await sandbox.listDir(dirPath);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/workspace/graph', async (req, res) => {
  try {
    const rootPath = sandbox.resolvePath('.');
    const graphData = await generateWorkspaceGraph(rootPath);
    res.json(graphData);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/files/content', async (req, res) => {
  const filePath = (req.query.path as string);
  if (!filePath) {
    return res.status(400).json({ error: 'path query parameter is required' });
  }
  try {
    const content = await sandbox.readFile(filePath);
    const resolvedPath = sandbox.resolvePath(filePath);
    let lastModified = '';
    if (fs.existsSync(resolvedPath)) {
      const stats = fs.statSync(resolvedPath);
      lastModified = stats.mtime.toISOString();
    }
    res.json({ content, lastModified });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/files/create', async (req, res) => {
  const { path: filePath, isDirectory, content } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }
  try {
    const resolved = sandbox.resolvePath(filePath);
    if (isDirectory) {
      await fs.promises.mkdir(resolved, { recursive: true });
    } else {
      await sandbox.writeFile(filePath, content || '');
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/files/save', async (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }
  try {
    await sandbox.writeFile(filePath, content || '');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.delete('/api/files', async (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) {
    return res.status(400).json({ error: 'path query parameter is required' });
  }
  try {
    const resolved = sandbox.resolvePath(filePath as string);
    await fs.promises.unlink(resolved);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});



app.get('/api/credentials', async (_req, res) => {
  try {
    res.json(await readCredentialsFile());
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/credentials', async (req, res) => {
  try {
    await updateCredentialsFile(existing => ({ ...existing, ...req.body }));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.delete('/api/credentials', async (_req, res) => {
  try {
    await deleteCredentialsFile();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.delete('/api/local-data', async (_req, res) => {
  try {
    await deleteCredentialsFile();
    const candidates = [
      dataFilePath('projects.json'),
      dataFilePath('chat_history.json'),
      path.resolve(process.cwd(), 'cost_history.json'),
      path.resolve(process.cwd(), 'command_approvals.json')
    ];
    for (const candidate of candidates) {
      try { if (fs.existsSync(candidate)) await fs.promises.unlink(candidate); } catch {}
    }
    res.json({
      success: true,
      workspaceDataPreserved: true,
      note: 'Workspace files and each repository .kryleos directory were preserved. Delete those folders manually when uninstalling if desired.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/security/scan', (req, res) => {
  try {
    const { text } = req.body;
    const secrets = scanSecrets(text || '');
    res.json({ success: true, secrets });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/companion/pairing-code', requireLoopback, sensitiveLimiter, (req, res) => {
  try {
    const code = companionHub.generatePairingCode();
    res.json({ success: true, code });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/companion/status', requireLoopback, (req, res) => {
  try {
    const code = companionHub.getPairingCode();
    const pairingSecret = companionHub.getPairingSecret();
    const pairingExpiresAt = companionHub.getPairingExpiry();
    const connectedCount = companionHub.getConnectedCount();
    res.json({ success: true, code, pairingSecret, pairingExpiresAt, connectedCount, companionAuthToken: COMPANION_AUTH_TOKEN || null, claudeCodeAvailable: !!findClaudeCodeBinary() });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/companion/devices', (req, res) => {
  try {
    const devices = companionHub.listDevices();
    res.json({ success: true, devices });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.delete('/api/companion/devices/:deviceId', (req, res) => {
  try {
    const revoked = companionHub.revokeDevice(req.params.deviceId);
    if (!revoked) {
      res.status(404).json({ success: false, error: 'Device not found.' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

const collabRooms = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  console.log('Client connected to Kryleos Forge WS server');

  // Hook ws.send to track bytes sent
  const originalSend = ws.send;
  ws.send = function(data: any, ...args: any[]) {
    try {
      const dataSize = typeof data === 'string' ? data.length : (data instanceof Buffer ? data.length : JSON.stringify(data).length);
      totalBytesSent += dataSize;
    } catch (e) {}
    return (originalSend as any).apply(this, [data, ...args]);
  };
  let currentModel = 'ollama:qwen2.5-coder';
  let customInstructions = '';
  let responseMode: ResponseMode = 'balanced';
  let chatAbortRequested = false;
  let projectName = '';
  let zeroEgressMode = false;
  let privacyMode = false;
  let overrideHostedActive = false;
  let currentSessionId = 'global_session';

  const modelProxy: ChatClient = {
    async chatStream(messages, callbacks) {
      if ((zeroEgressMode || privacyMode) && !isOllamaModel(currentModel)) {
        if (privacyMode && overrideHostedActive) {
          // Allow manually overridden hosted model calls
        } else {
          const modeName = privacyMode ? 'Privacy Mode' : 'Zero Egress Mode';
          const err = new Error(`${modeName} is active. External API calls to hosted models are blocked at the server layer.`);
          callbacks.onError?.(err);
          return;
        }
      }

      // Pre-calculate input tokens and cost estimation
      const inputText = messages.map(m => m.content).join('\n');
      const inputTokens = estimateTokens(inputText);
      const inputCost = estimateCost(inputText, currentModel, false);
      let tokenSavings = 0;
      if (responseMode === 'concise' || responseMode === 'minimal_context') {
        const savingRate = responseMode === 'minimal_context' ? 0.5 : 0.2;
        tokenSavings = Math.ceil(inputTokens * savingRate);
      }

      const adaptedCallbacks = {
        onContentChunk: callbacks.onContentChunk,
        onComplete: async (content: string, reasoning?: string) => {
          const outputTokens = estimateTokens(content);
          const outputCost = estimateCost(content, currentModel, true);
          const totalCost = inputCost + outputCost;

          // Save cost record to CostGuard
          try {
            const costGuard = new CostGuard(sandbox.getWorkspaceRoot());
            await costGuard.addRecord({
              sessionId: currentSessionId,
              model: currentModel,
              provider: getProviderForModel(currentModel),
              inputTokens,
              outputTokens,
              cost: totalCost,
              tokenSavings
            });
          } catch (err) {
            console.error('Failed to log cost record in chatStream completion:', err);
          }

          // Send cost_update update message to client
          try {
            ws.send(JSON.stringify({
              type: 'cost_update',
              cost: totalCost,
              inputTokens,
              outputTokens,
              model: currentModel,
              provider: getProviderForModel(currentModel),
              tokenSavings
            }));
          } catch (e) {}

          callbacks.onComplete?.(content, reasoning || '');
        },
        onError: callbacks.onError
      };

      if (currentModel.startsWith('gemini')) {
        return geminiClient.chatStream(messages, adaptedCallbacks);
      }
      if (currentModel.startsWith('gpt')) {
        return openaiClient.chatStream(messages, adaptedCallbacks);
      } else if (currentModel.startsWith('claude')) {
        return anthropicClient.chatStream(messages, adaptedCallbacks);
      } else if (isOllamaModel(currentModel)) {
        ollamaClient.setModel(normalizeOllamaModel(currentModel));
        return ollamaClient.chatStream(messages, adaptedCallbacks);
      } else if (currentModel.includes('/') || currentModel.startsWith('meta-') || currentModel.startsWith('qwen/')) {
        return openrouterClient.chatStream(messages, adaptedCallbacks);
      } else {
        return deepseekClient.chatStream(messages, adaptedCallbacks);
      }
    }
  };

  let currentFastModel: string = '';

  const fastModelProxy: ChatClient = {
    chatStream: async (messages, callbacks) => {
      const targetModel = currentFastModel || currentModel;
      const adaptedCallbacks = {
        onReasoningChunk: callbacks.onReasoningChunk,
        onContentChunk: callbacks.onContentChunk,
        onComplete: async (content: string, reasoning?: string) => {
          let inputTokens = 0;
          for (const msg of messages) {
            inputTokens += estimateTokens(msg.content);
          }
          const outputTokens = estimateTokens(content);
          const inputCost = estimateCost(messages.map(m => m.content).join(' '), targetModel, false);
          const outputCost = estimateCost(content, targetModel, true);
          const totalCost = inputCost + outputCost;

          try {
            const costGuard = new CostGuard(sandbox.getWorkspaceRoot());
            await costGuard.addRecord({
              sessionId: currentSessionId,
              model: targetModel,
              provider: getProviderForModel(targetModel),
              inputTokens,
              outputTokens,
              cost: totalCost,
              tokenSavings: 0
            });
          } catch {}

          try {
            ws.send(JSON.stringify({
              type: 'cost_update',
              cost: totalCost,
              inputTokens,
              outputTokens,
              model: targetModel,
              provider: getProviderForModel(targetModel),
              isFastRoute: true
            }));
          } catch (e) {}
          callbacks.onComplete?.(content, reasoning || '');
        },
        onError: callbacks.onError
      };

      if (targetModel.startsWith('gemini')) {
        return geminiClient.chatStream(messages, adaptedCallbacks);
      } else if (targetModel.startsWith('gpt')) {
        return openaiClient.chatStream(messages, adaptedCallbacks);
      } else if (targetModel.startsWith('claude')) {
        return anthropicClient.chatStream(messages, adaptedCallbacks);
      } else if (isOllamaModel(targetModel)) {
        ollamaClient.setModel(normalizeOllamaModel(targetModel));
        return ollamaClient.chatStream(messages, adaptedCallbacks);
      } else if (targetModel.includes('/') || targetModel.startsWith('meta-') || targetModel.startsWith('qwen/')) {
        return openrouterClient.chatStream(messages, adaptedCallbacks);
      } else {
        return deepseekClient.chatStream(messages, adaptedCallbacks);
      }
    }
  };

  let orchestrator = new AgentOrchestrator(
    sandbox,
    modelProxy,
    (update) => {
      ws.send(JSON.stringify({
        type: 'update',
        ...update
      }));
      try {
        companionHub.broadcastToCompanions({
          type: 'update',
          ...update
        });
      } catch (e) {}
    },
    currentFastModel ? fastModelProxy : undefined
  );
  companionHub.registerOrchestrator(currentSessionId, orchestrator);

  // Phase 5.4: lets a paired companion launch a FORGE run for a plan item via
  // START_FORGE_RUN, reusing this connection's orchestrator/modelProxy/mode
  // closures. Re-registered under the new sessionId wherever currentSessionId
  // changes (case 'query', case 'load_session'), mirroring registerOrchestrator.
  const remoteForgeRunner = async (planItemId: string, send: (payload: any) => void, deviceId?: string) => {
    const task = await findTaskById(planItemId);
    if (!task) {
      send({ type: 'error', code: 'plan_item_not_found', message: `Plan item ${planItemId} not found.` });
      return;
    }
    const blockers = await findUnresolvedBlockers(planItemId);
    if (blockers.length > 0) {
      send({
        type: 'error',
        code: 'blocked',
        message: `BLOCKED PLAN ITEM REJECTED: plan item ${planItemId} has unresolved blockers (${blockers.join(', ')}). Complete its dependencies before sending it to FORGE.`
      });
      return;
    }
    const queryText = optimizePromptForMode(await resolveQueryMentions(task.title, sandbox), responseMode);
    await startForgeRun({
      orchestrator,
      queryText,
      originalText: task.title,
      sessionId: currentSessionId,
      space: 'code',
      planItemId,
      zeroEgressMode,
      modelProxy,
      send,
      deviceId,
      source: 'remote'
    });
  };
  companionHub.registerForgeRunner(currentSessionId, remoteForgeRunner);

  // Phase 6 / CC-2: Companion-channel Claude Code runner — same interface
  // as remoteForgeRunner but delegates to the `claude` CLI subprocess
  // instead of the built-in orchestrator.
  const remoteClaudeCodeRunner: ForgeRunner = async (planItemId, send) => {
    const task = await findTaskById(planItemId);
    if (!task) {
      send({ type: 'error', code: 'plan_item_not_found', message: `Plan item ${planItemId} not found.` });
      return;
    }
    const blockers = await findUnresolvedBlockers(planItemId);
    if (blockers.length > 0) {
      send({
        type: 'error',
        code: 'blocked',
        message: `BLOCKED PLAN ITEM REJECTED: plan item ${planItemId} has unresolved blockers (${blockers.join(', ')}).`
      });
      return;
    }
    const runner = cliAgentRegistry.getDefault();
    const runnerBin = runner.findBinary();
    if (!runnerBin) {
      send({ type: 'error', code: 'claude_code_not_found', message: `${runner.name} CLI not found.` });
      return;
    }
    let snapshotId: string | undefined;
    try {
      const snapshot = await takeSnapshot({
        workspaceRoot: sandbox.getWorkspaceRoot(),
        planItemId,
        queryText: task.title,
      });
      snapshotId = snapshot.id;

      const runOpts = {
        queryText: task.title,
        workspaceRoot: sandbox.getWorkspaceRoot(),
        planItemId,
        onOutput: (chunk: string) => {
          send({ type: 'claude_code_output', output: chunk, isStderr: false });
        },
      };
      const result = runner.runPty
        ? await runner.runPty(runOpts, terminalManager)
        : await runner.run(runOpts);
      send({ type: 'status', message: `${runner.name} execution complete.`, durationMs: result.durationMs });
      send({ type: 'claude_code_output', output: result.stdout, isStderr: false });
      if (result.stderr) send({ type: 'claude_code_output', output: result.stderr, isStderr: true });

      // Compute deviations (fire-and-forget — if it fails, snapshot is still available for manual review)
      computeDeviations(snapshotId, result.stdout).catch((err) => {
        send({ type: 'status', message: 'Deviation analysis failed.' });
        console.error('Deviation analysis error:', err.message);
      });
    } catch (err: any) {
      send({ type: 'error', code: 'claude_code_error', message: `${runner.name} execution failed.` });
      console.error(`${runner.name} error:`, err.message);
    }
  };
  companionHub.registerForgeRunner(currentSessionId + '_claude', remoteClaudeCodeRunner);

  orchestrator.onCommandApprovalRequired = (tool, command) => {
    const commandId = `cmd_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    orchestrator.pendingCommandId = commandId;
    orchestrator.pendingCommandText = command;

    ws.send(JSON.stringify({
      type: 'command_approval_required',
      tool,
      command,
      commandId
    }));
    
    companionHub.broadcastCommandApprovalRequired(currentSessionId, commandId, tool, command, classifyCommand(command).destructive);
  };

  ws.on('message', async (message: any) => {
    try {
      const messageStr = typeof message === 'string' ? message : message.toString();
      totalBytesReceived += messageStr.length;
      const data = JSON.parse(messageStr);
      
      switch (data.type) {
        case 'config':
          if (data.projectName !== undefined) {
            projectName = data.projectName;
          }
          if (data.customInstructions !== undefined) {
            customInstructions = data.customInstructions;
            orchestrator.setCustomInstructions(data.customInstructions);
          }
          if (data.responseMode !== undefined) {
            responseMode = data.responseMode;
            orchestrator.setResponseMode(responseMode);
          }
          if (data.apiKey) {
            deepseekClient.setApiKey(data.apiKey);
          }
          if (data.geminiApiKey) {
            geminiClient.setApiKey(data.geminiApiKey);
          }
          if (data.openaiApiKey) {
            openaiClient.setApiKey(data.openaiApiKey);
          }
          if (data.anthropicApiKey) {
            anthropicClient.setApiKey(data.anthropicApiKey);
          }
          if (data.openrouterApiKey) {
            openrouterClient.setApiKey(data.openrouterApiKey);
          }
          if (data.ollamaUrl) {
            ollamaClient.setBaseUrl(data.ollamaUrl);
          }
          if (data.useSearch !== undefined) {
            geminiClient.setUseSearch(data.useSearch);
          }
          if (data.model) {
            currentModel = data.model;
            activeModel = data.model;
            if (currentModel.startsWith('gemini')) {
              geminiClient.setModel(currentModel as any);
            } else if (currentModel.startsWith('gpt')) {
              openaiClient.setModel(currentModel as any);
            } else if (currentModel.startsWith('claude')) {
              anthropicClient.setModel(currentModel as any);
            } else if (isOllamaModel(currentModel)) {
              ollamaClient.setModel(normalizeOllamaModel(currentModel));
            } else if (currentModel.includes('/') || currentModel.startsWith('meta-') || currentModel.startsWith('qwen/')) {
              openrouterClient.setModel(currentModel as any);
            } else {
              deepseekClient.setModel(currentModel as any);
            }
            orchestrator.setLocalModel(isOllamaModel(currentModel));
          }
          if (data.fastModel !== undefined) {
            currentFastModel = data.fastModel;
            orchestrator.setFastClient(currentFastModel ? fastModelProxy : undefined);
          }
          if (data.thinkingCapability) {
            openaiClient.setThinkingCapability(data.thinkingCapability);
            deepseekClient.setThinkingCapability(data.thinkingCapability);
            // We could also set it on the orchestrator if needed for system prompt verbosity
            // orchestrator.setThinkingCapability(data.thinkingCapability);
          }
          if (data.workspaceRoot !== undefined) {
            ws.send(JSON.stringify({
              type: 'error',
              code: 'workspace_change_requires_local_api',
              message: 'Workspace changes must use the local workspace or project API.'
            }));
          }
          if (data.zeroEgressMode !== undefined) {
            zeroEgressMode = data.zeroEgressMode;
            globalZeroEgressMode = data.zeroEgressMode;
          }
          if (data.privacyMode !== undefined) {
            privacyMode = data.privacyMode;
            globalPrivacyMode = data.privacyMode;
            if (data.privacyMode) {
              zeroEgressMode = true;
              globalZeroEgressMode = true;
            }
          }
          if (data.overrideHostedActive !== undefined) {
            overrideHostedActive = data.overrideHostedActive;
          }
          ws.send(JSON.stringify({
            type: 'status',
            message: 'Configuration updated successfully',
            workspaceRoot: sandbox.getWorkspaceRoot()
          }));
          break;

        case 'query':
          if (!data.text) {
            ws.send(JSON.stringify({ type: 'error', message: 'Query text is required' }));
            break;
          }
          if (data.sessionId) {
            currentSessionId = data.sessionId;
            companionHub.registerOrchestrator(currentSessionId, orchestrator);
            companionHub.registerForgeRunner(currentSessionId, remoteForgeRunner);
          }
          chatAbortRequested = false;
          try {
            if (data.planItemId) {
              const blockers = await findUnresolvedBlockers(String(data.planItemId));
              if (blockers.length > 0) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: `BLOCKED PLAN ITEM REJECTED: plan item ${data.planItemId} has unresolved blockers (${blockers.join(', ')}). Complete its dependencies before sending it to FORGE.`
                }));
                break;
              }
            }
            const queryText = optimizePromptForMode(await resolveQueryMentions(data.text, sandbox), responseMode);
            if (data.space === 'chat') {
              ws.send(JSON.stringify({ type: 'status', message: `Connecting to ${currentModel}...` }));
              const activeId = data.sessionId || `session_${Date.now()}`;
              let existing = await chatDb.getSession(activeId);

              let workspaceInstructions = '';
              const ruleFiles = ['.kryleosrc.json', '.matrixcode.json', 'CLAUDE.md', '.clauderc', 'INSTRUCTIONS.md'];
              for (const file of ruleFiles) {
                try {
                  const content = await sandbox.readFile(file);
                  if (content && content.trim()) {
                    workspaceInstructions += `\n[INSTRUCTIONS FROM LOCAL WORKSPACE FILE ${file}]:\n${content}\n`;
                  }
                } catch {
                  // ignore
                }
              }

              // PLAN Scratchbook sessions get ideation discipline: the
              // Scratchbook is for scoping, not implementation — code is
              // written later in FORGE. Without this, models dump full
              // component implementations during brainstorming.
              const isScratchbook = typeof data.sessionId === 'string' &&
                (data.sessionId.startsWith('session_plan_') || data.sessionId === 'planning_session');
              const scratchbookGuidance = isScratchbook ? `
You are the PLAN Scratchbook ideation partner. Your job is to help the user scope
features and requirements — NOT to implement them. Rules:
- Discuss goals, scope, trade-offs, edge cases, and acceptance criteria.
- Do NOT write implementation code. At most, name the files/components/symbols involved.
- Keep replies short and conversational. End by checking whether the idea is
  ready to stage ("Ready to summarize this into a plan item?") when it sounds settled.
- Execution happens later in FORGE; criteria are drafted in FLOW.
` : '';

              const systemContent = `You are a helpful assistant in the Kryleos Forge workspace environment.
Current Project: ${projectName || 'Unnamed Project'}
Workspace Root: ${sandbox.getWorkspaceRoot()}
${scratchbookGuidance}${customInstructions ? `\nUSER SPECIFIC CUSTOM INSTRUCTIONS:\n${customInstructions}\n` : ''}
${workspaceInstructions ? `\nWORKSPACE SPECIFIC INSTRUCTIONS:\n${workspaceInstructions}\n` : ''}
${getResponseModeInstructions(responseMode)}`;

              let chatHistory = existing?.messages || [
                { role: 'system', content: systemContent }
              ];
              
              const userLog = {
                timestamp: new Date().toLocaleTimeString(),
                sender: 'user',
                recipient: 'assistant',
                message: data.text,
                type: 'info' as const
              };
              
              const currentLogs = existing ? [...existing.logs, userLog] : [userLog];
              if (zeroEgressMode) {
                currentLogs.push({
                  timestamp: new Date().toLocaleTimeString(),
                  sender: 'system',
                  recipient: 'user',
                  message: 'All model calls are local — no data sent to external providers',
                  type: 'info' as const
                });
              }
              chatHistory.push({ role: 'user', content: queryText });
              
              ws.send(JSON.stringify({
                type: 'update',
                logs: currentLogs,
                checklist: [],
                activeAgent: 'system',
                isStreaming: true,
                streamingContent: ''
              }));
              
              let replyContent = '';
              await modelProxy.chatStream(chatHistory, {
                onContentChunk: (chunk) => {
                  if (chatAbortRequested) return;
                  replyContent += chunk;
                  ws.send(JSON.stringify({
                    type: 'update',
                    logs: currentLogs,
                    checklist: [],
                    activeAgent: 'system',
                    isStreaming: true,
                    streamingContent: replyContent
                  }));
                },
                onComplete: async (content) => {
                  if (chatAbortRequested) {
                    ws.send(JSON.stringify({
                      type: 'update',
                      logs: [
                        ...currentLogs,
                        {
                          timestamp: new Date().toLocaleTimeString(),
                          sender: 'system',
                          recipient: 'user',
                          message: 'Chat response stopped by user.',
                          type: 'info' as const
                        }
                      ],
                      checklist: [],
                      activeAgent: 'system',
                      isStreaming: false
                    }));
                    return;
                  }
                  chatHistory.push({ role: 'assistant', content });
                  const assistantLog = {
                    timestamp: new Date().toLocaleTimeString(),
                    sender: 'assistant',
                    recipient: 'user',
                    message: content,
                    type: 'info' as const
                  };
                  const finalLogs = [...currentLogs, assistantLog];
                  
                  await chatDb.saveSession({
                    id: activeId,
                    title: data.text.slice(0, 50),
                    createdAt: new Date().toISOString(),
                    logs: finalLogs,
                    checklist: [],
                    messages: chatHistory,
                    space: 'chat'
                  });
                  
                  ws.send(JSON.stringify({
                    type: 'update',
                    logs: finalLogs,
                    checklist: [],
                    activeAgent: 'system',
                    isStreaming: false
                  }));
                },
                onError: (err) => {
                  if (chatAbortRequested) return;
                  ws.send(JSON.stringify({ type: 'error', message: 'Chat execution failed.' }));
                  console.error('Chat Error:', err.message);
                }
              });
            } else if (data.runner === 'claude-code' || (data.runner && cliAgentRegistry.has(data.runner)) || data.useClaudeCode) {
              const runnerId = data.runner || 'claude-code';
              const runner = cliAgentRegistry.get(runnerId) || cliAgentRegistry.getDefault();
              ws.send(JSON.stringify({ type: 'status', message: `Launching ${runner.name} CLI, please wait...` }));
              try {
                const runnerBin = runner.findBinary();
                if (!runnerBin) {
                  ws.send(JSON.stringify({ type: 'error', message: `${runner.name} CLI not found. Install it or set the binary path.` }));
                  break;
                }

                let deviationSnapshotId: string | undefined;
                try {
                  const snap = await takeSnapshot({
                    workspaceRoot: sandbox.getWorkspaceRoot(),
                    planItemId: data.planItemId,
                    queryText,
                  });
                  deviationSnapshotId = snap.id;
                } catch { /* snapshot is optional; proceed anyway */ }

                // 7e: Spend cap check for Tier 1 runners
                const spendBlocked = await checkSpendCapBlocked(sandbox.getWorkspaceRoot());
                if (spendBlocked) {
                  ws.send(JSON.stringify({ type: 'error', message: spendBlocked }));
                  return;
                }

                let streamedContent = '';
                ws.send(JSON.stringify({
                  type: 'update',
                  logs: [{
                    timestamp: new Date().toLocaleTimeString(),
                    sender: runner.id,
                    recipient: 'user',
                    message: `Starting ${runner.name}...`,
                    type: 'info',
                  }],
                  streamingContent: '',
                  isStreaming: true,
                }));

                const ptyOpts = {
                  queryText,
                  workspaceRoot: sandbox.getWorkspaceRoot(),
                  planItemId: data.planItemId,
                  onOutput: (chunk: string) => {
                    streamedContent += chunk;
                    try {
                      ws.send(JSON.stringify({
                        type: 'update',
                        streamingContent: streamedContent,
                        isStreaming: true,
                      }));
                    } catch { /* ws closed */ }
                  },
                  onToolUse: (toolUse: any) => {
                    try {
                      ws.send(JSON.stringify({
                        type: 'agent_tool_use',
                        runner: runner.id,
                        toolUse,
                      }));
                    } catch { /* ignore */ }
                  },
                };
                const ccResult = runner.runPty
                  ? await runner.runPty(ptyOpts, terminalManager, ws)
                  : await runner.run(ptyOpts);

                ws.send(JSON.stringify({
                  type: 'update',
                  logs: [{
                    timestamp: new Date().toLocaleTimeString(),
                    sender: runner.id,
                    recipient: 'user',
                    message: ccResult.stdout + (ccResult.stderr ? `\n--- stderr ---\n${ccResult.stderr}` : ''),
                    type: 'info',
                  }],
                  streamingContent: '',
                  isStreaming: false,
                }));

                // Fire-and-forget deviation analysis
                if (deviationSnapshotId) {
                  computeDeviations(deviationSnapshotId, ccResult.stdout).catch(() => { /* non-critical */ });
                }

                // 7a: Post-execution review after runner completes if planItemId is present
                if (data.planItemId) {
                  try {
                    const { task } = await planningV2().getCriteria(data.planItemId);
                    if (task) {
                      const review = await runPostExecutionReview(sandbox.getWorkspaceRoot(), task, modelProxy);
                      await planningV2().savePostExecutionReview(data.planItemId, review);
                      ws.send(JSON.stringify({ type: 'post_execution_review', planItemId: data.planItemId, review }));
                      companionHub.broadcastSessionUpdate({ postExecutionReview: { planItemId: data.planItemId, review } });
                    }
                  } catch (revErr: any) {
                    console.warn('Post-execution review warning:', revErr.message);
                  }
                }
              } catch (ccErr: any) {
                ws.send(JSON.stringify({
                  type: 'update',
                  streamingContent: '',
                  isStreaming: false,
                }));
                ws.send(JSON.stringify({ type: 'error', message: `${runner.name} CLI error: ${ccErr.message}` }));
              }
            } else {
              await startForgeRun({
                orchestrator,
                queryText,
                originalText: data.text,
                sessionId: data.sessionId,
                space: data.space || 'code',
                planItemId: data.planItemId,
                zeroEgressMode,
                modelProxy,
                send: (payload) => ws.send(JSON.stringify(payload))
              });
            }
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'error', message: 'Execution failed.' }));
            console.error('Execution Error:', err.message);
          }
          break;

        case 'load_session':
          if (!data.sessionId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session ID is required' }));
            break;
          }
          currentSessionId = data.sessionId;
          companionHub.registerOrchestrator(currentSessionId, orchestrator);
          companionHub.registerForgeRunner(currentSessionId, remoteForgeRunner);
          try {
            const session = await chatDb.getSession(data.sessionId);
            if (session) {
              if (session.customAgents) {
                orchestrator.setCustomAgents(session.customAgents);
              } else {
                orchestrator.setCustomAgents([]);
              }
              ws.send(JSON.stringify({
                type: 'update',
                logs: session.logs,
                checklist: session.checklist,
                tasks: session.tasks || [],
                customAgents: session.customAgents || [],
                activeAgent: 'system',
                isStreaming: false
              }));
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
            }
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to load session.' }));
            console.error('Load Session Error:', err.message);
          }
          break;

        case 'save_tasks':
          if (!data.sessionId || !data.tasks) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session ID and tasks are required' }));
            break;
          }
          try {
            const existingSession = await chatDb.getSession(data.sessionId);
            const session: ChatSession = existingSession || {
              id: data.sessionId,
              title: data.sessionId === 'flow_board' ? 'FLOW Board' : 'Project Tasks',
              createdAt: new Date().toISOString(),
              logs: [],
              checklist: [],
              space: 'project' as const,
              tasks: []
            };
            session.tasks = data.tasks;
            await chatDb.saveSession(session);
            ws.send(JSON.stringify({
              type: 'update',
              logs: session.logs,
              checklist: session.checklist,
              tasks: session.tasks,
              customAgents: session.customAgents || [],
              activeAgent: 'system',
              isStreaming: false
            }));
            companionHub.broadcastSessionUpdate({ tasks: session.tasks });
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to save tasks.' }));
            console.error('Save Tasks Error:', err.message);
          }
          break;

        case 'save_agents':
          if (!data.sessionId || !data.customAgents) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session ID and custom agents are required' }));
            break;
          }
          try {
            const session = await chatDb.getSession(data.sessionId);
            if (session) {
              session.customAgents = data.customAgents;
              await chatDb.saveSession(session);
              orchestrator.setCustomAgents(session.customAgents || []);
              ws.send(JSON.stringify({
                type: 'update',
                logs: session.logs,
                checklist: session.checklist,
                tasks: session.tasks || [],
                customAgents: session.customAgents,
                activeAgent: 'system',
                isStreaming: false
              }));
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
            }
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to save agents.' }));
            console.error('Save Agents Error:', err.message);
          }
          break;

        case 'approve_command':
          if (orchestrator.commandPendingApproval) {
            orchestrator.pendingApprovalSource = { source: 'local' };
            if (data.approved) {
              const pendingId = orchestrator.pendingCommandId;
              if (!data.commandId || data.commandId !== pendingId) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'STALE COMMAND APPROVAL BLOCKED: approval did not match the active command.'
                }));
                orchestrator.commandPendingApproval.resolve('stale');
              } else {
                ws.send(JSON.stringify({
                  type: 'status',
                  message: `COMMAND APPROVED: ${orchestrator.pendingCommandText || 'pending command'}`
                }));
                orchestrator.commandPendingApproval.resolve('approved');
              }
            } else {
              ws.send(JSON.stringify({
                type: 'status',
                message: `COMMAND REJECTED BY USER: ${orchestrator.pendingCommandText || 'pending command'}`
              }));
              orchestrator.commandPendingApproval.resolve('rejected');
            }
            orchestrator.pendingCommandId = null;
            orchestrator.pendingCommandText = null;
          } else {
            ws.send(JSON.stringify({
              type: 'status',
              message: 'No pending command approval is active.'
            }));
          }
          break;

        case 'smoke_command': {
          if (process.env.NODE_ENV !== 'test' && process.env.KRYLEOS_ENABLE_SMOKE_COMMAND !== 'true') {
            ws.send(JSON.stringify({ type: 'error', message: 'Smoke command is unavailable outside test mode.' }));
            break;
          }
          // Deterministic approval-modal QA: drives the real approval + exec flow
          // for a fixed command, no model/agent. Approve via the normal approve_command.
          const smokeCommand = (data.command && String(data.command)) || 'node -v';
          ws.send(JSON.stringify({ type: 'status', message: `SMOKE: requesting approval for "${smokeCommand}"` }));
          try {
            const output = await orchestrator.runCommandWithApproval(smokeCommand);
            ws.send(JSON.stringify({ type: 'smoke_result', command: smokeCommand, output }));
          } catch (smokeErr: any) {
            ws.send(JSON.stringify({ type: 'error', message: `Smoke command failed: ${smokeErr.message}` }));
          }
          break;
        }

        case 'join_collab_room':
          if (!data.token) {
            ws.send(JSON.stringify({ type: 'error', message: 'Token is required to join collaboration room' }));
            break;
          }
          const roomToken = data.token;
          if (!collabRooms.has(roomToken)) {
            collabRooms.set(roomToken, new Set());
          }
          collabRooms.get(roomToken)!.add(ws);
          (ws as any).collabRoomToken = roomToken;
          
          for (const socket of collabRooms.get(roomToken)!) {
            if (socket !== ws && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'collab_peer_joined', message: 'A pair programmer joined the session' }));
            }
          }
          ws.send(JSON.stringify({ type: 'collab_room_joined', message: 'Successfully joined co-coding WebRTC room' }));
          break;

        case 'leave_collab_room':
          const rToken = (ws as any).collabRoomToken;
          if (rToken && collabRooms.has(rToken)) {
            collabRooms.get(rToken)!.delete(ws);
            delete (ws as any).collabRoomToken;
            if (collabRooms.get(rToken)!.size === 0) {
              collabRooms.delete(rToken);
            } else {
              for (const socket of collabRooms.get(rToken)!) {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({ type: 'collab_peer_left', message: 'Pair programmer left the session' }));
                }
              }
            }
          }
          ws.send(JSON.stringify({ type: 'collab_room_left', message: 'Successfully left co-coding WebRTC room' }));
          break;

        case 'collab_signal':
          const senderRoomToken = (ws as any).collabRoomToken;
          if (!senderRoomToken || !collabRooms.has(senderRoomToken)) {
            ws.send(JSON.stringify({ type: 'error', message: 'You are not in a collaboration room' }));
            break;
          }
          for (const socket of collabRooms.get(senderRoomToken)!) {
            if (socket !== ws && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({
                type: 'collab_signal',
                signal: data.signal,
                sender: data.sender || 'peer'
              }));
            }
          }
          break;

        case 'abort_execution':
          chatAbortRequested = true;
          orchestrator.pendingApprovalSource = { source: 'local' };
          const killedProcessCount = orchestrator.abortExecution();
          orchestrator.pendingCommandId = null;
          orchestrator.pendingCommandText = null;
          ws.send(JSON.stringify({
            type: 'status',
            message: killedProcessCount > 0
              ? `WORKFLOW ABORTED BY USER: terminated ${killedProcessCount} active command process(es).`
              : 'WORKFLOW ABORTED BY USER: no active command process was running.'
          }));
          break;

        case 'terminal_create':
          try {
            const createKey = (ws as any)._socket?.remoteAddress || 'local';
            if (!terminalOpLimiter.consume(createKey)) {
              ws.send(JSON.stringify({ type: 'error', code: 'rate_limited', message: 'Terminal rate limit exceeded. Wait a few seconds.' }));
              break;
            }
            terminalManager.createSession(ws, data.cwd);
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'error', code: 'terminal_create_failed', message: 'Failed to create terminal session.' }));
            console.error('Terminal create failed:', err.message);
          }
          break;

        case 'terminal_input':
          try {
            const inputKey = (ws as any)._socket?.remoteAddress || 'local';
            if (!terminalOpLimiter.consume(inputKey)) {
              ws.send(JSON.stringify({ type: 'error', code: 'rate_limited', message: 'Terminal rate limit exceeded. Wait a few seconds.' }));
              break;
            }
            const tSession = terminalManager.getSession(data.sessionId);
            if (!tSession || tSession.ws !== ws) {
              ws.send(JSON.stringify({ type: 'error', code: 'forbidden', message: 'Not authorized for this session' }));
              break;
            }
            terminalManager.writeInput(data.sessionId, data.data);
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'error', code: 'terminal_write_failed', message: 'Failed to write to terminal.' }));
            console.error('Terminal write failed:', err.message);
          }
          break;

        case 'terminal_resize':
          try {
            const resizeKey = (ws as any)._socket?.remoteAddress || 'local';
            if (!terminalOpLimiter.consume(resizeKey)) {
              ws.send(JSON.stringify({ type: 'error', code: 'rate_limited', message: 'Terminal rate limit exceeded. Wait a few seconds.' }));
              break;
            }
            const rSession = terminalManager.getSession(data.sessionId);
            if (!rSession || rSession.ws !== ws) {
              ws.send(JSON.stringify({ type: 'error', code: 'forbidden', message: 'Not authorized for this session' }));
              break;
            }
            terminalManager.resize(data.sessionId, data.cols, data.rows);
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'error', code: 'terminal_resize_failed', message: 'Failed to resize terminal.' }));
            console.error('Terminal resize failed:', err.message);
          }
          break;

        case 'terminal_approval':
          try {
            const aSession = terminalManager.getSession(data.sessionId);
            if (!aSession || aSession.ws !== ws) {
              ws.send(JSON.stringify({ type: 'error', code: 'forbidden', message: 'Not authorized for this session' }));
              break;
            }
            const resolve = pendingTerminalApprovals.get(data.sessionId);
            if (resolve) {
              resolve(data.approved === true);
            }
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'error', code: 'terminal_approval_failed', message: 'Failed to process approval.' }));
            console.error('Terminal approval failed:', err.message);
          }
          break;

        case 'terminal_close':
          try {
            const cSession = terminalManager.getSession(data.sessionId);
            if (!cSession || cSession.ws !== ws) {
              ws.send(JSON.stringify({ type: 'error', code: 'forbidden', message: 'Not authorized for this session' }));
              break;
            }
            terminalManager.closeSession(data.sessionId);
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'error', code: 'terminal_close_failed', message: 'Failed to close terminal.' }));
            console.error('Terminal close failed:', err.message);
          }
          break;

        default:
          ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${data.type}` }));
      }
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to parse message.' }));
      console.error('Message Parse Error:', err.message);
    }
  });

  ws.on('close', () => {
    companionHub.unregisterOrchestrator(currentSessionId);
    companionHub.unregisterForgeRunner(currentSessionId);
    // Collect session IDs before closing so we can clean up pending approvals
    const sessionIds = terminalManager.getSessionIdsByWs(ws);
    terminalManager.closeSessionByWs(ws);
    // Reject any pending terminal approvals for this connection
    for (const id of sessionIds) {
      const resolve = pendingTerminalApprovals.get(id);
      if (resolve) {
        resolve(false);
        pendingTerminalApprovals.delete(id);
      }
    }
    console.log('Client disconnected');
    const roomToken = (ws as any).collabRoomToken;
    if (roomToken && collabRooms.has(roomToken)) {
      collabRooms.get(roomToken)!.delete(ws);
      if (collabRooms.get(roomToken)!.size === 0) {
        collabRooms.delete(roomToken);
      } else {
        for (const socket of collabRooms.get(roomToken)!) {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'collab_peer_left', message: 'Pair programmer left the session' }));
          }
        }
      }
    }
  });
});

app.get('/api/google/auth-url', (req, res) => {
  const redirectUri = `http://localhost:${PORT}/api/google/callback`;
  const url = googleClient.getAuthUrl(redirectUri);
  res.json({ url });
});

app.get('/api/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Authorization code is missing');
  }
  try {
    const redirectUri = `http://localhost:${PORT}/api/google/callback`;
    const tokens = await googleClient.exchangeCodeForTokens(code as string, redirectUri);
    
    await updateCredentialsFile(credentials => ({ ...credentials, googleTokens: tokens }));
    
    res.send(`
      <html>
        <body style="font-family: monospace; background: #000; color: #0f0; display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column;">
          <h2>LINK ESTABLISHED SUCCESSFULLY</h2>
          <p>Google Apps authentication complete. You can close this window now.</p>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('Authentication failed:', err.message);
    res.status(500).send('Authentication failed. See server logs for details.');
  }
});

app.get('/api/google/status', (req, res) => {
  res.json({ linked: googleClient.hasAuth() });
});

app.post('/api/google/sync', async (req, res) => {
  if (globalPrivacyMode) {
    return res.status(400).json({ error: 'Google Sync is disabled when Privacy Mode is active.' });
  }
  if (!googleClient.hasAuth()) {
    return res.status(401).json({ error: 'Google account is not linked' });
  }
  try {
    const root = sandbox.getWorkspaceRoot();
    const folderId = await googleClient.getOrCreateFolder('Kryleos-Forge-Workspace');
    
    // 1. Sync Agents Cards (Export customAgents from the session database as custom_agents.json)
    const activeSessions = await chatDb.listSessions('code');
    const customAgentsSet = new Map<string, any>();
    for (const sessionSummary of activeSessions) {
      const fullSession = await chatDb.getSession(sessionSummary.id);
      if (fullSession && fullSession.customAgents) {
        for (const agent of fullSession.customAgents) {
          customAgentsSet.set(agent.role, agent);
        }
      }
    }
    
    if (customAgentsSet.size > 0) {
      const agentsList = Array.from(customAgentsSet.values());
      const agentsPath = path.join(root, 'kryleos_specialists.json');
      fs.writeFileSync(agentsPath, JSON.stringify(agentsList, null, 2), 'utf-8');
      await googleClient.uploadOrUpdateFile(agentsPath, folderId);
    }

    // 2. Sync all files in workspace directory
    const entries = await sandbox.listDir('.');
    for (const file of entries) {
      if (file.isDirectory) continue;
      if (file.name === 'package-lock.json' || file.name.startsWith('.kryleos') || file.name.startsWith('.matrix') || file.name.startsWith('.env')) continue;
      
      const filePath = path.join(root, file.name);
      await googleClient.uploadOrUpdateFile(filePath, folderId);
    }

    res.json({ success: true, message: 'Google Apps Sync Complete!' });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/google/import-folder', async (req, res) => {
  if (!googleClient.hasAuth()) {
    return res.status(401).json({ error: 'Google account is not linked' });
  }
  try {
    const root = sandbox.getWorkspaceRoot();
    const folderId = await googleClient.getOrCreateFolder('Kryleos-Forge-Workspace');
    const files = await googleClient.listFiles(folderId);
    
    for (const file of files) {
      let ext = '';
      if (file.mimeType.includes('vnd.google-apps.document')) ext = '.md';
      else if (file.mimeType.includes('vnd.google-apps.spreadsheet')) ext = '.csv';

      const fileName = file.name.endsWith(ext) ? file.name : (file.name + ext);
      const content = await googleClient.downloadFile(file.id, file.mimeType);
      
      await sandbox.writeFile(fileName, content);
    }
    
    res.json({ success: true, message: `Successfully imported ${files.length} files from Google Drive` });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/artifacts', (req, res) => {
  try {
    const root = sandbox.getWorkspaceRoot();
    const allowedExt = new Set(['.md', '.txt', '.html', '.htm', '.json', '.csv']);
    // Artifacts are GENERATED outputs, not the whole repo. Sources:
    //   1. .kryleos/ (traces, reviews, generated docs, plan workspace)
    //   2. Conventional output dirs (artifacts/, docs/, reports/, exports/)
    //   3. Root-level generated docs (README excluded — it's source, not output)
    // Lockfiles, configs, and app-internal state files are noise, not artifacts.
    const sourceDirs = ['.kryleos', 'artifacts', 'docs', 'reports', 'exports'];
    const ignoredNames = new Set([
      'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.app.json',
      'tsconfig.node.json', 'projects.json', 'chat_history.json',
      'chat_history.test.json', 'chat_history.performance.json',
      'cost_history.json', 'command_approvals.json'
    ]);
    const artifacts: Array<{ path: string; name: string; type: string; size: number }> = [];

    const pushFile = (abs: string, name: string) => {
      const ext = path.extname(name).toLowerCase();
      if (!allowedExt.has(ext) || ignoredNames.has(name)) return;
      const stats = fs.statSync(abs);
      if (stats.size > 1024 * 1024) return;
      artifacts.push({
        path: path.relative(root, abs).replace(/\\/g, '/'),
        name,
        type: ext.replace('.', '') || 'text',
        size: stats.size
      });
    };

    const walk = (dir: string, depth: number) => {
      if (depth > 4 || artifacts.length >= 80 || !fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(abs, depth + 1);
          continue;
        }
        pushFile(abs, entry.name);
      }
    };

    for (const sub of sourceDirs) walk(path.join(root, sub), 0);
    res.json({ success: true, artifacts });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/artifacts/content', async (req, res) => {
  const filePath = req.query.path;
  if (typeof filePath !== 'string') return res.status(400).json({ error: 'path query parameter is required' });
  try {
    const content = await sandbox.readFile(filePath);
    res.json({ success: true, content });
  } catch (err: any) {
    res.status(403).json({ error: 'Operation failed.' });
  }
});

app.post('/api/artifacts/publish', async (req, res) => {
  const { path: filePath, bypassSecrets } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  try {
    const content = await sandbox.readFile(filePath);
    
    if (!bypassSecrets) {
      const foundSecrets = scanSecrets(content);
      if (foundSecrets.length > 0) {
        return res.status(400).json({
          error: 'Secrets detected in the file content. Publishing public gists with secrets is blocked.',
          secrets: foundSecrets,
          requiresBypass: true
        });
      }
    }

    const fileName = path.basename(filePath);
    
    const response = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Kryleos-Forge'
      },
      body: JSON.stringify({
        description: `Shared via Kryleos Forge`,
        public: true,
        files: {
          [fileName]: { content }
        }
      })
    });
    
    if (response.ok) {
      const data = await response.json() as any;
      res.json({ success: true, url: data.html_url });
    } else {
      const errText = await response.text();
      res.status(500).json({ error: `Gist API failed: ${errText}` });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.post('/api/artifacts/deploy', async (req, res) => {
  const { provider } = req.body;
  try {
    const root = sandbox.getWorkspaceRoot();
    const command = provider === 'netlify' ? 'npx netlify deploy --dir=.' : 'npx vercel --confirm --yes';
    
    exec(command, { cwd: root }, (error, stdout, stderr) => {
      if (error) {
        return res.json({ success: false, log: stderr || error.message });
      }
      const urlMatch = stdout.match(/https:\/\/[a-zA-Z0-9-_\.]+\.(?:vercel\.app|netlify\.app)/);
      const url = urlMatch ? urlMatch[0] : 'Deployment completed successfully';
      res.json({ success: true, url, log: stdout });
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

// --- COMPLIANCE AUDIT TRAIL API (Phase 5) ---
const getAuditTrailService = () => new AuditTrailService(sandbox.getWorkspaceRoot());

app.get('/api/audit/report', async (_req, res) => {
  try {
    const service = getAuditTrailService();
    const data = await service.generateReportData();
    const markdown = service.toMarkdownReport(data);
    res.json({ success: true, data, markdown });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to generate audit report' });
  }
});

app.post('/api/audit/export', async (req, res) => {
  try {
    const service = getAuditTrailService();
    const result = await service.exportAuditPackage(req.body?.targetDir);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to export audit package' });
  }
});

// --- WORKTREE ISOLATION API (Phase 5) ---
app.get('/api/worktrees', async (_req, res) => {
  try {
    const worktrees = await sandbox.listCardWorktrees();
    res.json({ success: true, worktrees });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/worktrees/card/:taskId', async (req, res) => {
  try {
    const result = await sandbox.createCardWorktree(req.params.taskId, req.body?.branch);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/worktrees/merge/:taskId', async (req, res) => {
  try {
    let cardData = req.body?.cardData;
    if (!cardData) {
      const task = await findTaskById(req.params.taskId);
      if (task) {
        cardData = {
          title: task.title,
          category: task.category,
          description: (task as any).description || task.title,
          acceptanceCriteria: task.acceptanceCriteria,
          postExecutionReview: task.postExecutionReview
        };
      }
    }
    const result = await sandbox.mergeCardWorktree(req.params.taskId, req.body?.targetBranch, cardData);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/worktrees/:taskId', async (req, res) => {
  try {
    const result = await sandbox.removeCardWorktree(req.params.taskId, req.query?.force === 'true');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/worktrees/revert/:taskId', async (req, res) => {
  try {
    const result = await sandbox.revertCardWorktree(req.params.taskId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- CROSS-CARD DECISION MEMORY API (Phase 9a) ---
app.get('/api/decisions', async (_req, res) => {
  try {
    const decisions = await loadDecisions(sandbox.getWorkspaceRoot());
    res.json({ success: true, decisions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/decisions', async (req, res) => {
  try {
    const { taskId, taskTitle, decision, rationale, category } = req.body || {};
    if (!decision) {
      return res.status(400).json({ success: false, error: 'decision text is required' });
    }
    await recordDecision(sandbox.getWorkspaceRoot(), {
      taskId,
      taskTitle,
      decision,
      rationale,
      category
    });
    res.json({ success: true, message: 'Decision recorded successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- TIER 1 RUNNERS & TIER 2 HANDOFF API (Phase 6) ---
app.get('/api/runners', (_req, res) => {
  try {
    const runners = cliAgentRegistry.list().map(runner => ({
      id: runner.id,
      name: runner.name,
      binaryName: runner.binaryName,
      available: !!runner.findBinary(),
      tier: 1 as const,
    }));
    res.json({ success: true, runners, defaultRunner: cliAgentRegistry.getDefault().id });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/handoff/targets', (_req, res) => {
  try {
    const targets = handoffRegistry.list();
    res.json({ success: true, targets });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/handoff/export', async (req, res) => {
  try {
    const { taskId, taskTitle, taskCategory, taskAssignee, taskStatus, description, acceptanceCriteria, workspaceRoot, targetAppId } = req.body || {};
    if (!taskId || !taskTitle) {
      return res.status(400).json({ success: false, error: 'taskId and taskTitle are required' });
    }
    const wsRoot = workspaceRoot || sandbox.getWorkspaceRoot() || process.cwd();
    const result = await executeHandoff({
      taskId,
      taskTitle,
      taskCategory,
      taskAssignee,
      taskStatus,
      description,
      acceptanceCriteria,
      workspaceRoot: wsRoot,
      targetAppId: targetAppId || 'clipboard',
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Handoff export failed' });
  }
});

app.get('/api/telemetry', (req, res) => {
  res.json({
    bytesSent: totalBytesSent,
    bytesReceived: totalBytesReceived,
    compressionSavingsRatio: 0.68,
    processRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024 * 10) / 10
  });
});

app.get('/api/ollama/models', async (req, res) => {
  try {
    const baseUrl = typeof req.query.baseUrl === 'string' && req.query.baseUrl.trim()
      ? req.query.baseUrl.trim()
      : undefined;
    const models = await ollamaClient.listModels(baseUrl);
    res.json({ success: true, models });
  } catch (err: any) {
    res.status(503).json({ success: false, error: 'Operation failed.', models: [] });
  }
});

app.get('/api/security/approval-pubkey', (req, res) => {
  res.json({ publicKey: getPublicKey() });
});

app.get('/api/workspace/semantic-cache', async (req, res) => {
  const { query } = req.query;
  if (typeof query !== 'string') return res.status(400).json({ error: 'query string parameter is required' });
  try {
    const results = await sandbox.querySemanticCache(query);
    res.json({ success: true, results });
  } catch (err: any) {
    res.status(403).json({ error: 'Operation failed.' });
  }
});

app.post('/api/workspace/semantic-cache/rebuild', async (req, res) => {
  try {
    const result = await sandbox.buildSemanticCache();
    res.json(result);
  } catch (err: any) {
    res.status(403).json({ error: 'Operation failed.' });
  }
});

app.post('/api/workspace/command-policy', (req, res) => {
  const { allowedPrefixes, blockedPrefixes, userRole } = req.body;
  try {
    if (userRole) {
      sandbox.setUserRole(userRole);
    }
    if (allowedPrefixes || blockedPrefixes) {
      sandbox.setCommandPolicies({ allowedPrefixes, blockedPrefixes });
    }
    res.json({ success: true, message: 'Sandbox command policies updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/plan/items/:id/criteria', async (req, res) => {
  try {
    const result = await planningV2().getCriteria(req.params.id);
    res.json({ success: true, task: result.task, criteria: result.criteria });
  } catch (err: any) {
    res.status(404).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/plan/items/:id/criteria', async (req, res) => {
  try {
    const task = await planningV2().saveCriteria(req.params.id, req.body.criteria);
    res.json({ success: true, task, criteria: task.acceptanceCriteria || [] });
  } catch (err: any) {
    res.status(404).json({ success: false, error: 'Operation failed.' });
  }
});

app.get('/api/plan/bootstrap', (_req, res) => {
  try {
    res.json({ success: true, fingerprint: planningV2().bootstrapFingerprint() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/plan/bootstrap/evaluate', async (_req, res) => {
  try {
    const result = await planningV2().bootstrapEvaluate(getModelClient());
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/plan/items/:id/criteria/generate', async (req, res) => {
  try {
    const result = await planningV2().generateCriteria(getModelClient(), req.params.id);
    res.json({ success: true, task: result.task, criteria: result.criteria, usedLlm: result.usedLlm });
  } catch (err: any) {
    res.status(404).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/plan/items/:id/criteria/enrich', async (req, res) => {
  try {
    const result = await planningV2().enrichCriteria(req.params.id);
    res.json({
      success: true,
      task: result.task,
      criteria: result.task.acceptanceCriteria || [],
      added: result.added,
      candidates: result.candidates
    });
  } catch (err: any) {
    res.status(404).json({ success: false, error: 'Operation failed.' });
  }
});

app.patch('/api/plan/items/:id/criteria', async (req, res) => {
  try {
    const task = await planningV2().patchCriteria(req.params.id, req.body.criteria || []);
    res.json({ success: true, task, criteria: task.acceptanceCriteria || [] });
  } catch (err: any) {
    res.status(404).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/plan/items/:id/review', async (req, res) => {
  try {
    const { task } = await planningV2().getCriteria(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    const review = await runPostExecutionReview(sandbox.getWorkspaceRoot(), task, getModelClient());
    const updatedTask = await planningV2().savePostExecutionReview(req.params.id, review);
    res.json({ success: true, task: updatedTask, review });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/plan/items/:id/review/override', async (req, res) => {
  try {
    const updatedTask = await planningV2().overridePostExecutionReview(req.params.id);
    res.json({ success: true, task: updatedTask });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/traces/:itemId', (req, res) => {
  try {
    res.json({ success: true, traces: planningV2().listTraces(req.params.itemId) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/traces', async (req, res) => {
  try {
    const trace = await planningV2().saveTrace(req.body);
    res.json({ success: true, trace });
  } catch (err: any) {
    res.status(400).json({ success: false, error: 'Operation failed.' });
  }
});

app.get('/api/plan/whats-left', async (req, res) => {
  try {
    const report = await planningV2().whatsLeft(getModelClient(), null);
    res.json({ success: true, report, exportAllowed: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.get('/api/plan/drift', async (_req, res) => {
  try {
    const report = await planningV2().checkDrift(getModelClient());
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.get('/api/plan/workspace', (req, res) => {
  try {
    res.json({ success: true, items: planningV2().getWorkspaceItems() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/plan/workspace', (req, res) => {
  try {
    planningV2().saveWorkspaceItems(req.body.items || []);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/plan/workspace/extract', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }
    const session = await chatDb.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    const items = await planningV2().extractWorkspaceItems(getModelClient(), session.messages || []);
    res.json({ success: true, items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/plan/workspace/feasibility', async (req, res) => {
  try {
    const { projectDescription, title, description, category } = req.body;
    if (!title || !description) {
      return res.status(400).json({ success: false, error: 'title and description are required' });
    }
    const result = await planningV2().checkFeasibility(
      getModelClient(),
      projectDescription || '',
      title,
      description,
      category || 'frontend'
    );
    res.json({ success: true, feasibility: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/crew/sync', async (req, res) => {
  if (globalPrivacyMode) {
    return res.status(400).json({ error: 'PLAN->CREW Sync is disabled when Privacy Mode is active.' });
  }
  const { items } = req.body;
  try {
    const service = planningV2();
    const currentItems = service.getWorkspaceItems();
    const pushedIds = new Set((items || []).map((it: any) => it.id));
    const updated = currentItems.map(item => {
      if (pushedIds.has(item.id)) {
        return { ...item, status: 'ready_for_crew' as const };
      }
      return item;
    });
    service.saveWorkspaceItems(updated);
    res.json({ success: true, message: 'Plan successfully synced to CREW context.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

// --- GitHub & Docs Autopilot Integrations ---
const templates = [
  { id: 'project_brief', name: 'Project Brief', description: 'High-level project goals, features, and non-goals.' },
  { id: 'user_guide', name: 'User Guide', description: 'Step-by-step user onboarding and workflow instructions.' },
  { id: 'architecture', name: 'System Architecture', description: 'Core components, data flow, and directory layout.' },
  { id: 'release_checklist', name: 'Release Checklist', description: 'Sanity checks, build steps, and verification commands.' },
  { id: 'api_integrations', name: 'API & Integrations', description: 'REST endpoints, payload models, and integration specs.' },
  { id: 'data_storage', name: 'Data & Storage', description: 'Database schema, caching layout, and persistency rules.' },
  { id: 'security_privacy', name: 'Security & Privacy', description: 'Threat modeling, access control, and credential handling.' },
  { id: 'test_plan', name: 'Test Plan', description: 'Unit/integration testing strategy and coverage targets.' },
  { id: 'prd', name: 'Product Requirements (PRD)', description: 'Product goals, user personas, roadmap, and edge cases.' },
  { id: 'technical_design', name: 'Technical Design Document', description: 'Detailed technical specs, algorithmic loops, and tradeoffs.' },
  { id: 'founder_summary', name: 'Founder Summary', description: 'Elevator pitch, MRR prospects, and investor readiness status.' },
  { id: 'project_brochure', name: 'Project Brochure', description: 'Sales copy, premium value proposition, and branding overview.' },
  { id: 'client_handoff', name: 'Client Handoff Pack', description: 'Branded deliverable details, system credentials, and maintenance guide.' }
];

function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  const cleanUrl = url.trim().replace(/\.git$/, '');
  const match = cleanUrl.match(/(?:github\.com[:\/])([^\/]+)\/([^\/]+)$/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

function localInferCategory(title: string): string {
  const lower = title.toLowerCase();
  if (/\b(test|spec|vitest|jest|qa|coverage)\b/.test(lower)) return 'testing';
  if (/\b(auth|security|permission|rbac|secret|sandbox)\b/.test(lower)) return 'security';
  if (/\b(doc|readme|guide|copy|brochure|changelog)\b/.test(lower)) return 'docs';
  if (/\b(docker|ci|deploy|infra|pipeline|release|build)\b/.test(lower)) return 'infra';
  if (/\b(api|server|backend|db|database|route|sync)\b/.test(lower)) return 'backend';
  return 'frontend';
}

app.post('/api/integrations/github/fetch-issues', async (req, res) => {
  const { token, repoUrl } = req.body;
  if (!repoUrl) return res.status(400).json({ success: false, error: 'Repository URL is required.' });
  
  const repoInfo = parseGithubRepo(repoUrl);
  if (!repoInfo) return res.status(400).json({ success: false, error: 'Invalid GitHub repository URL.' });

  const { owner, repo } = repoInfo;
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Kryleos-Forge'
    };
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`, { headers });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ success: false, error: `GitHub API error: ${errText || response.statusText}` });
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return res.json({ success: true, issues: [] });
    }

    const issues = data
      .filter((issue: any) => !issue.pull_request)
      .map((issue: any) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        html_url: issue.html_url
      }));

    res.json({ success: true, issues });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/integrations/github/import-issues', async (req, res) => {
  const { token, repoUrl, issues } = req.body;
  if (!repoUrl) return res.status(400).json({ success: false, error: 'Repository URL is required.' });
  if (!Array.isArray(issues) || issues.length === 0) return res.status(400).json({ success: false, error: 'No issues specified for import.' });

  const repoInfo = parseGithubRepo(repoUrl);
  if (!repoInfo) return res.status(400).json({ success: false, error: 'Invalid GitHub repository URL.' });

  const { owner, repo } = repoInfo;
  try {
    const service = planningV2();
    const currentItems = service.getWorkspaceItems();
    const client = getModelClient();

    const importedItems: any[] = [];

    for (const issue of issues) {
      const itemId = `git_issue_${owner}_${repo}_${issue.number}`;
      if (currentItems.some(item => item.id === itemId)) continue;

      const { criteria } = await service.generateCriteriaForIssue(client, issue.title, issue.body, itemId);

      const newItem = {
        id: itemId,
        title: issue.title,
        description: issue.body || 'No description provided.',
        category: localInferCategory(issue.title),
        status: 'draft',
        context: `Imported from GitHub Issue #${issue.number}`,
        githubIssueNumber: issue.number,
        githubRepo: `${owner}/${repo}`,
        htmlUrl: issue.html_url,
        acceptanceCriteria: criteria
      };
      importedItems.push(newItem);
    }

    if (importedItems.length > 0) {
      service.saveWorkspaceItems([...currentItems, ...importedItems]);
    }

    res.json({ success: true, count: importedItems.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.get('/api/docs/templates', (req, res) => {
  res.json({ success: true, templates });
});

app.post('/api/docs/generate', async (req, res) => {
  const { templateId } = req.body;
  if (!templateId) return res.status(400).json({ success: false, error: 'templateId is required' });

  const selectedTemplate = templates.find(t => t.id === templateId);
  if (!selectedTemplate) return res.status(404).json({ success: false, error: 'Template not found' });

  try {
    const root = sandbox.getWorkspaceRoot();
    const service = planningV2();
    const scan = service.scanDocsContext();
    const client = getModelClient();

    const userPrompt = [
      `You are Kryleos Docs Autopilot. Your task is to generate a professional, production-grade documentation document for this codebase.`,
      `The document to generate is a: **${selectedTemplate.name}**`,
      `Description: ${selectedTemplate.description}`,
      ``,
      `=== CODEBASE CONTEXT ===`,
      `Workspace Directory: ${root}`,
      scan.packageJson ? `Package Manifest: ${JSON.stringify(scan.packageJson, null, 2)}` : '',
      scan.readmeExcerpt ? `README Excerpt:\n${scan.readmeExcerpt}` : '',
      scan.sourceTree ? `Source Tree:\n${scan.sourceTree}` : '',
      `Test Files Found: ${scan.testFilesCount}`,
      scan.recentGitChanges ? `Recent Commits:\n${scan.recentGitChanges}` : '',
      scan.gitStatus ? `Git Status:\n${scan.gitStatus}` : '',
      ``,
      `Write a comprehensive, professional Markdown document for this ${selectedTemplate.name}. Make sure it is detailed, accurate to the codebase details, and complete. Avoid generic placeholders.`
    ].filter(Boolean).join('\n\n');

    const messages: Message[] = [
      { role: 'system', content: 'You generate high-quality technical documentation for codebases. Respond with ONLY the markdown content. Do not write chat intro or outro.' },
      { role: 'user', content: userPrompt }
    ];

    let generatedContent = '';
    await client.chatStream(messages, {
      onContentChunk: (chunk) => { generatedContent += chunk; },
      onComplete: (content) => { generatedContent = content; }
    });

    if (!generatedContent) {
      throw new Error('LLM generated empty response.');
    }

    const { bypassSecrets } = req.body;
    if (!bypassSecrets) {
      const foundSecrets = scanSecrets(generatedContent);
      if (foundSecrets.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Secrets detected in the generated documentation. Document generation blocked.',
          secrets: foundSecrets,
          requiresBypass: true,
          content: generatedContent
        });
      }
    }

    res.json({ success: true, content: generatedContent, defaultPath: `.kryleos/docs/${templateId}.md` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/docs/patch', async (req, res) => {
  const { docPath } = req.body;
  if (!docPath) return res.status(400).json({ success: false, error: 'docPath is required' });

  try {
    const root = sandbox.getWorkspaceRoot();
    const absPath = path.isAbsolute(docPath) ? docPath : path.resolve(root, docPath);
    if (!isPathInside(root, absPath)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Path is outside the workspace root.' });
    }
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ success: false, error: 'Documentation file not found.' });
    }

    const currentDocContent = fs.readFileSync(absPath, 'utf-8');

    let gitDiff = '';
    try {
      gitDiff = execSync('git diff HEAD~1 HEAD', { cwd: root, encoding: 'utf-8' }).trim();
    } catch {
      try {
        gitDiff = execSync('git diff', { cwd: root, encoding: 'utf-8' }).trim();
      } catch {}
    }

    if (!gitDiff) {
      return res.json({ success: true, content: currentDocContent, message: 'No modifications found in git history.' });
    }

    const client = getModelClient();

    const userPrompt = [
      `You are Kryleos Docs Autopilot. Your task is to update this existing technical document based on the recent code changes (git diff).`,
      ``,
      `=== EXISTING DOCUMENT ===`,
      currentDocContent,
      ``,
      `=== RECENT CHANGES (GIT DIFF) ===`,
      gitDiff,
      ``,
      `Review the changes and update the document content to accurately reflect them. Keep the formatting and structure. Return the FULL updated Markdown document. Do not include chat intros/outros.`
    ].join('\n\n');

    const messages: Message[] = [
      { role: 'system', content: 'You update technical documentation files based on git diffs. Return the complete updated markdown document only.' },
      { role: 'user', content: userPrompt }
    ];

    let updatedContent = '';
    await client.chatStream(messages, {
      onContentChunk: (chunk) => { updatedContent += chunk; },
      onComplete: (content) => { updatedContent = content; }
    });

    if (!updatedContent) {
      throw new Error('LLM generated empty response.');
    }

    res.json({ success: true, content: updatedContent });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/docs/write', async (req, res) => {
  const { docPath, content } = req.body;
  if (!docPath) return res.status(400).json({ success: false, error: 'docPath is required' });
  if (!content) return res.status(400).json({ success: false, error: 'content is required' });

  try {
    const root = sandbox.getWorkspaceRoot();
    const absPath = path.isAbsolute(docPath) ? docPath : path.resolve(root, docPath);
    if (!isPathInside(root, absPath)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Path is outside the workspace root.' });
    }

    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf-8');

    res.json({ success: true, path: path.relative(root, absPath).replace(/\\/g, '/') });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/workflows/founder/generate', async (req, res) => {
  const { workflowId, customPrompt, bypassSecrets } = req.body;
  if (!workflowId) return res.status(400).json({ success: false, error: 'workflowId is required' });

  try {
    const root = sandbox.getWorkspaceRoot();
    const service = planningV2();
    const scan = service.scanDocsContext();
    const client = getModelClient();

    const content = await generateFounderWorkflow(workflowId, { root, scan, customPrompt }, client);

    if (!bypassSecrets) {
      const foundSecrets = scanSecrets(content);
      if (foundSecrets.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Secrets detected in the generated document. Document generation blocked.',
          secrets: foundSecrets,
          requiresBypass: true,
          content
        });
      }
    }

    res.json({ success: true, content, defaultPath: `.kryleos/founder/${workflowId}.md` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/workflows/agency/export', async (req, res) => {
  const { workflowId, customPrompt, branding, bypassSecrets } = req.body;
  if (!workflowId) return res.status(400).json({ success: false, error: 'workflowId is required' });

  try {
    const root = sandbox.getWorkspaceRoot();
    const service = planningV2();
    const scan = service.scanDocsContext();
    const client = getModelClient();

    const content = await generateAgencyWorkflow(workflowId, { root, scan, customPrompt, branding }, client);

    if (!bypassSecrets) {
      const foundSecrets = scanSecrets(content);
      if (foundSecrets.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Secrets detected in the generated export. Export generation blocked.',
          secrets: foundSecrets,
          requiresBypass: true,
          content
        });
      }
    }

    const ext = workflowId === 'branded_doc' ? 'html' : 'md';
    res.json({ success: true, content, defaultPath: `.kryleos/agency/${workflowId}.${ext}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

app.post('/api/planning/import', async (req, res) => {
  const { plan, basePlan, baseLastModified, workspacePaths } = req.body;
  if (!plan) return res.status(400).json({ error: 'plan is required' });
  try {
    const root = sandbox.getWorkspaceRoot();
    const targets = Array.isArray(workspacePaths) && workspacePaths.length > 0 ? workspacePaths : [root];
    
    let finalPlan = plan;
    let conflictDetected = false;

    // 1. Process files and write plans
    for (const targetPath of targets) {
      const resolvedTarget = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(root, targetPath);
      if (!isPathInside(root, resolvedTarget)) {
        return res.status(403).json({ error: `Access Denied: Path "${targetPath}" is outside the active workspace root.` });
      }
      sandbox.whitelistDirectory(resolvedTarget);
      if (fs.existsSync(resolvedTarget)) {
        const planPath = path.join(resolvedTarget, 'implementation_plan.md');
        
        let shouldMerge = false;
        let currentDiskContent = '';
        
        if (fs.existsSync(planPath) && baseLastModified && basePlan !== undefined) {
          const stats = fs.statSync(planPath);
          const currentLastModified = stats.mtime.toISOString();
          if (currentLastModified !== baseLastModified) {
            shouldMerge = true;
            currentDiskContent = fs.readFileSync(planPath, 'utf-8');
          }
        }

        if (shouldMerge) {
          const mergeResult = threeWayMerge(basePlan, plan, currentDiskContent);
          finalPlan = mergeResult.merged;
          if (mergeResult.hasConflicts) {
            conflictDetected = true;
          }
        }

        fs.writeFileSync(planPath, finalPlan, 'utf-8');
      }
    }

    // Dependency reconciliation scan across package.json targets
    const pkgDataMap = new Map<string, any>();
    for (const targetPath of targets) {
      const resolvedTarget = path.isAbsolute(targetPath) ? targetPath : path.resolve(root, targetPath);
      const pkgPath = path.join(resolvedTarget, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const content = fs.readFileSync(pkgPath, 'utf-8');
          pkgDataMap.set(resolvedTarget, JSON.parse(content));
        } catch {}
      }
    }

    const depConflicts: Array<{ package: string; targetA: string; versionA: string; targetB: string; versionB: string }> = [];
    if (pkgDataMap.size > 1) {
      const workspaces = Array.from(pkgDataMap.keys());
      const allDeps = new Map<string, Map<string, string>>();

      for (const [targetPath, pkgJson] of pkgDataMap.entries()) {
        const combine = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
        for (const [name, version] of Object.entries(combine)) {
          if (!allDeps.has(name)) allDeps.set(name, new Map());
          allDeps.get(name)!.set(targetPath, version as string);
        }
      }

      for (const [name, versionMap] of allDeps.entries()) {
        if (versionMap.size > 1) {
          const versions = Array.from(versionMap.entries());
          const firstVal = versions[0][1];
          for (let i = 1; i < versions.length; i++) {
            if (versions[i][1] !== firstVal) {
              depConflicts.push({
                package: name,
                targetA: path.basename(versions[0][0]),
                versionA: firstVal,
                targetB: path.basename(versions[i][0]),
                versionB: versions[i][1]
              });
            }
          }
        }
      }

      if (depConflicts.length > 0) {
        let reportContent = '# Dependency Reconciliation Report\n\n';
        reportContent += 'The following dependency conflicts were detected across your target microservices/repositories:\n\n';
        reportContent += '| Package | Workspace A | Version A | Workspace B | Version B |\n';
        reportContent += '| :--- | :--- | :--- | :--- | :--- |\n';
        for (const conflict of depConflicts) {
          reportContent += `| \`${conflict.package}\` | \`${conflict.targetA}\` | \`${conflict.versionA}\` | \`${conflict.targetB}\` | \`${conflict.versionB}\` |\n`;
        }
        reportContent += '\n*Action Recommended: Resolve these mismatches to ensure library compatibility.*';

        for (const targetPath of targets) {
          const resolvedTarget = path.isAbsolute(targetPath) ? targetPath : path.resolve(root, targetPath);
          if (fs.existsSync(resolvedTarget)) {
            fs.writeFileSync(path.join(resolvedTarget, 'reconciliation_report.md'), reportContent, 'utf-8');
          }
        }
      }
    }

    // 2. Parse checklist items from the final plan
    const lines = finalPlan.split('\n');
    const tasks: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]') || trimmed.startsWith('- [/]')) {
        const cleanTask = trimmed.replace(/^-\s+\[[ x/]\]\s*/i, '').trim();
        if (cleanTask) tasks.push(cleanTask);
      }
    }
    
    let taskContent = '# Checklist: Imported Planning Tasks\n\n';
    if (tasks.length > 0) {
      taskContent += tasks.map(task => `- [ ] ${task}`).join('\n') + '\n';
    } else {
      taskContent += '- [ ] Complete imported plan implementation\n';
    }

    let newLastModified = '';
    for (const targetPath of targets) {
      const resolvedTarget = path.isAbsolute(targetPath) ? targetPath : path.resolve(root, targetPath);
      if (fs.existsSync(resolvedTarget)) {
        const taskPath = path.join(resolvedTarget, 'task.md');
        fs.writeFileSync(taskPath, taskContent, 'utf-8');

        const planPath = path.join(resolvedTarget, 'implementation_plan.md');
        if (fs.existsSync(planPath)) {
          const stats = fs.statSync(planPath);
          newLastModified = stats.mtime.toISOString();
        }
      }
    }
    
    res.json({ 
      success: true, 
      conflict: conflictDetected,
      depConflicts: depConflicts.length > 0 ? depConflicts : null,
      tasks,
      plan: finalPlan,
      lastModified: newLastModified,
      message: conflictDetected
        ? 'Sync conflict detected! Merge conflict markers have been injected into the plan.'
        : `Plan imported successfully. Files updated in ${targets.length} workspace(s).` 
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/cost/history', async (req, res) => {
  try {
    const costGuard = new CostGuard(sandbox.getWorkspaceRoot());
    const history = await costGuard.getHistory();
    res.json({ success: true, history, restricted: false });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

app.get('/api/cost/spend-cap', async (_req, res) => {
  try {
    const costGuard = new CostGuard(sandbox.getWorkspaceRoot());
    const status = await costGuard.checkSpendCap();
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cost/spend-cap', async (req, res) => {
  try {
    const costGuard = new CostGuard(sandbox.getWorkspaceRoot());
    const updated = await costGuard.setSpendCap(req.body);
    const status = await costGuard.checkSpendCap();
    res.json({ success: true, ...status, cap: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cost/estimate', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    const activeM = model || activeModel;
    const inputTokens = estimateTokens(prompt);
    const inputCost = estimateCost(prompt, activeM, false);
    res.json({
      success: true,
      inputTokens,
      inputCost,
      model: activeM,
      provider: getProviderForModel(activeM)
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

app.get('/api/providers/detect', async (req, res) => {
  try {
    const baseUrl = String(req.query.baseUrl || 'http://localhost:11434');
    const client = new OllamaClient({ model: 'llama3', baseUrl });
    const models = await client.listModels(baseUrl).catch(() => null);
    res.json({
      success: true,
      ollamaAvailable: models !== null,
      models: models || []
    });
  } catch (err: any) {
    res.json({ success: true, ollamaAvailable: false, models: [], error: 'Operation failed.' });
  }
});

app.post('/api/providers/health-check', async (req, res) => {
  try {
    const { provider, apiKey, model, baseUrl } = req.body;
    if (!provider) return res.status(400).json({ error: 'Provider is required' });
    
    let client: ChatClient | null = null;
    const testMessages: Message[] = [{ role: 'user', content: 'Say OK' }];
    
    if (provider === 'openai') {
      client = new OpenAIClient({ apiKey, model: model || 'gpt-4o-mini' });
    } else if (provider === 'gemini') {
      client = new GeminiClient({ apiKey, model: model || 'gemini-2.5-flash', useSearch: false });
    } else if (provider === 'anthropic') {
      client = new AnthropicClient({ apiKey, model: model || 'claude-3-5-haiku-latest' });
    } else if (provider === 'deepseek') {
      client = new DeepSeekClient({ apiKey, model: model || 'deepseek-chat' });
    } else if (provider === 'openrouter') {
      client = new OpenRouterClient({ apiKey, model: model || 'meta-llama/llama-3.3-70b-instruct' });
    } else if (provider === 'ollama') {
      client = new OllamaClient({ model: model || 'llama3', baseUrl: baseUrl || 'http://localhost:11434' });
    }

    if (!client) {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    }

    let chunkCount = 0;
    await client.chatStream(testMessages, {
      onContentChunk: () => { chunkCount++; },
      onComplete: () => {},
      onError: (err) => { throw err; }
    });

    res.json({ success: true });
  } catch (err: any) {
    res.json({ success: false, error: 'Operation failed.' });
  }
});

app.post('/api/providers/test', async (req, res) => {
  try {
    const { provider, apiKey, model, message, baseUrl } = req.body;
    if (!provider) return res.status(400).json({ error: 'Provider is required' });
    const prompt = message || 'Hello, are you online? Respond in under 10 words.';
    const testMessages: Message[] = [{ role: 'user', content: prompt }];
    
    let client: ChatClient | null = null;
    if (provider === 'openai') client = new OpenAIClient({ apiKey, model: model || 'gpt-4o-mini' });
    else if (provider === 'gemini') client = new GeminiClient({ apiKey, model: model || 'gemini-2.5-flash', useSearch: false });
    else if (provider === 'anthropic') client = new AnthropicClient({ apiKey, model: model || 'claude-3-5-haiku-latest' });
    else if (provider === 'deepseek') client = new DeepSeekClient({ apiKey, model: model || 'deepseek-chat' });
    else if (provider === 'openrouter') client = new OpenRouterClient({ apiKey, model: model || 'meta-llama/llama-3.3-70b-instruct' });
    else if (provider === 'ollama') client = new OllamaClient({ model: model || 'llama3', baseUrl: baseUrl || 'http://localhost:11434' });

    if (!client) return res.status(400).json({ error: `Unsupported provider: ${provider}` });

    let fullResponse = '';
    await client.chatStream(testMessages, {
      onContentChunk: (chunk) => { fullResponse += chunk; },
      onComplete: () => {},
      onError: (err) => { throw err; }
    });

    res.json({ success: true, response: fullResponse });
  } catch (err: any) {
    res.json({ success: false, error: 'Operation failed.' });
  }
});

// SEC-6: Return a clean 400 for malformed JSON bodies instead of letting
// the default Express handler emit a 500 with a full stack trace.
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  next(err);
});

const PORT = process.env.PORT || 3001;
const BIND_HOST = '127.0.0.1';
const COMPANION_PORT = Number(process.env.KRYLEOS_COMPANION_PORT || 3002);
const COMPANION_BIND_HOST = process.env.KRYLEOS_COMPANION_BIND_HOST || '127.0.0.1';
if (COMPANION_BIND_HOST !== '127.0.0.1' && !COMPANION_AUTH_TOKEN) {
  console.warn(
    `[CRITICAL] Companion WebSocket exposed on ${COMPANION_BIND_HOST} with NO auth token. ` +
    `Set KRYLEOS_COMPANION_AUTH_TOKEN to prevent unauthorized access.`
  );
}
if (process.env.NODE_ENV !== 'test') {
  server.listen(Number(PORT), BIND_HOST, () => {
    console.log(`Kryleos Forge backend running on http://${BIND_HOST}:${PORT}`);
  });
  companionServer.listen(COMPANION_PORT, COMPANION_BIND_HOST, () => {
    console.log(`Kryleos Forge companion channel running on ws://${COMPANION_BIND_HOST}:${COMPANION_PORT}/api/companion/ws`);
  });
}

export { app, server, companionServer };
