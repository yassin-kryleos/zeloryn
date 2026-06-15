import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import type {
  AcceptanceCriterion,
  AcceptanceCriterionType,
  ChatSession,
  CriterionResult,
  CriterionResultStatus,
  DriftClassification,
  ExecutionTrace,
  ProjectTask,
  PlanWorkspaceItem
} from './db';
import { ChatDatabase } from './db';
import type { AgentLog } from './agents';
import type { Message } from './deepseek';

// Minimal structural contract for the model client used by post-run trace
// extraction. Kept local so planningV2 stays decoupled from the orchestrator.
export interface TraceExtractionClient {
  chatStream(
    messages: Message[],
    callbacks: {
      onContentChunk?: (chunk: string) => void;
      onComplete?: (fullContent: string, fullReasoning: string) => void;
      onError?: (err: Error) => void;
    }
  ): Promise<void>;
}

interface LlmTraceResult {
  summary?: string;
  criteria?: Array<{ criterionId: string; status: CriterionResultStatus; evidence?: string }>;
}

export interface DriftItem {
  taskId: string;
  title: string;
  status: DriftClassification;
  category?: string;
  workspace?: string;
  blockedBy: string[];
  results: CriterionResult[];
  latestTrace?: ExecutionTrace;
  suggestedStatus: ProjectTask['status'];
}

export interface DriftReport {
  generatedAt: string;
  summary: Record<DriftClassification, number>;
  items: DriftItem[];
  /** Items/criteria eligible for an LLM-backed evaluation (divergence or llm_check) that were skipped this run (budget cap). */
  deferred: number;
  /** Items/criteria actually evaluated by a targeted LLM call this run (divergence + llm_check). */
  llmEvaluated: number;
}

export interface WhatsLeftItem {
  taskId: string;
  title: string;
  status: DriftClassification;
  category?: string;
  reason: string;
}

export interface WhatsLeftReport {
  generatedAt: string;
  items: WhatsLeftItem[];
  total: number;
  limit: number | null;
  truncated: boolean;
  usedLlm: boolean;
}

interface DivergenceCacheEntry {
  commitHash: string;
  criteriaKey: string;
  diverged: boolean;
}

interface LlmCheckCacheEntry {
  workspaceHash: string;
  criteriaKey: string;
  status: CriterionResultStatus;
  evidence: string;
}

// Max items the targeted divergence LLM call evaluates per drift run.
const MAX_DIVERGENCE_LLM_CALLS = 10;
// Max llm_check criteria the standalone evaluator resolves per drift run.
const MAX_LLM_CHECK_CALLS = 10;
// Structural criterion types whose `fail` is a real, code-grounded signal.
const structuralFailTypes = new Set<AcceptanceCriterionType>(['file_exists', 'symbol_exists', 'git_grep']);

export interface CriteriaEnrichmentResult {
  task: ProjectTask;
  added: AcceptanceCriterion[];
  candidates: Array<{ path: string; score: number; reason: string }>;
}

const generatedCriteriaTypes: AcceptanceCriterionType[] = ['llm_check'];
const textFileExtensions = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.txt',
  '.css', '.scss', '.html', '.yml', '.yaml', '.py', '.go', '.rs', '.java',
  '.cs', '.php', '.rb', '.sql', '.sh', '.ps1'
]);

function slugPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'item';
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function kryleosDir(workspaceRoot: string) {
  const dir = path.join(workspaceRoot, '.kryleos');
  ensureDir(dir);
  return dir;
}

function traceDir(workspaceRoot: string) {
  const dir = path.join(kryleosDir(workspaceRoot), 'traces');
  ensureDir(dir);
  return dir;
}

function safeTraceFileName(trace: Pick<ExecutionTrace, 'timestamp' | 'planItemId'>) {
  const stamp = trace.timestamp.replace(/[:.]/g, '-');
  return `${stamp}-${slugPart(trace.planItemId)}.json`;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function titleKeywords(value: string): string[] {
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'onto',
    'add', 'make', 'create', 'update', 'implement', 'build', 'verify',
    'phase', 'task', 'feature', 'app'
  ]);
  return Array.from(new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .map(word => word.trim())
      .filter(word => word.length >= 4 && !stopWords.has(word))
  )).slice(0, 8);
}

function inferCategory(title: string): string {
  const lower = title.toLowerCase();
  // Plural/derived forms matter: "unit tests" must hit testing, not frontend.
  if (/\b(test(s|ing)?|specs?|vitest|jest|qa|coverage)\b/.test(lower)) return 'testing';
  if (/\b(auth|security|permissions?|rbac|secrets?|sandbox)\b/.test(lower)) return 'security';
  if (/\b(docs?|documentation|readme|guides?|copy|brochure|changelog)\b/.test(lower)) return 'docs';
  if (/\b(docker|ci|deploy(ment)?|infra|pipelines?|releases?|build)\b/.test(lower)) return 'infra';
  if (/\b(apis?|server|backend|db|database|routes?|sync)\b/.test(lower)) return 'backend';
  if (/\b(ui|frontend|react|components?|screens?|tabs?|buttons?|css)\b/.test(lower)) return 'frontend';
  return 'frontend';
}

function titleToCriteria(task: ProjectTask): AcceptanceCriterion[] {
  const title = normalizeText(task.title);
  const category = task.category || inferCategory(title);
  const baseId = slugPart(task.id || title);
  return [
    {
      id: `${baseId}-intent`,
      type: generatedCriteriaTypes[0],
      description: `User confirms the implementation satisfies: ${title}`,
      target: title,
      phase: 'phase1',
      status: 'unknown',
      evidence: 'Phase 1 abstract criterion. Requires user review or later trace evidence.'
    },
    {
      id: `${baseId}-verification`,
      type: 'test_passes',
      description: `Relevant ${category} verification passes after implementation.`,
      target: category === 'docs' ? 'docs/manual review' : 'npm test',
      phase: 'phase1',
      status: 'unknown',
      evidence: 'Phase 1 verification placeholder. Edit this to the exact command when known.'
    }
  ];
}

function resolveWorkspace(workspaceRoot: string, task?: ProjectTask): string {
  const normalizedRoot = path.resolve(workspaceRoot);
  let realRoot: string;
  try {
    realRoot = fs.realpathSync.native(normalizedRoot);
  } catch {
    return normalizedRoot;
  }
  if (!task?.workspace) return realRoot;

  const candidate = path.isAbsolute(task.workspace)
    ? path.resolve(task.workspace)
    : path.resolve(normalizedRoot, task.workspace);
  try {
    const stat = fs.lstatSync(candidate);
    if (!stat.isDirectory() && !stat.isSymbolicLink()) return realRoot;
    const realCandidate = fs.realpathSync.native(candidate);
    const isWithinRoot = realCandidate === realRoot || realCandidate.startsWith(realRoot + path.sep);
    return isWithinRoot && fs.statSync(realCandidate).isDirectory() ? realCandidate : realRoot;
  } catch {
    return realRoot;
  }
}

// Extensions whose comments/string literals can mask false-positive symbol_exists
// matches (e.g. a symbol name mentioned only in a code comment).
const scannableExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const slashCommentExtensions = new Set(['.go', '.rs', '.java', '.cs', '.php', '.css', '.scss']);
const hashCommentExtensions = new Set(['.py', '.rb', '.sh', '.yml', '.yaml']);

const triviaTokenKinds = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.SingleLineCommentTrivia,
  ts.SyntaxKind.MultiLineCommentTrivia,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral
]);

function stripJsLikeTrivia(content: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, content);
  const chars = content.split('');
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (triviaTokenKinds.has(token)) {
      const start = scanner.getTokenPos();
      const end = scanner.getTextPos();
      for (let i = start; i < end; i++) {
        if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
      }
    }
    token = scanner.scan();
  }
  return chars.join('');
}

function blankMatches(content: string, patterns: RegExp[]): string {
  let result = content;
  for (const pattern of patterns) {
    result = result.replace(pattern, match => match.replace(/[^\n\r]/g, ' '));
  }
  return result;
}

function stripQuotedStrings(content: string): string {
  return blankMatches(content, [
    /'''[\s\S]*?'''/g,
    /"""[\s\S]*?"""/g,
    /'(?:\\.|[^'\\])*'/g,
    /"(?:\\.|[^"\\])*"/g,
    /`(?:\\.|[^`\\])*`/g,
  ]);
}

// Blanks out comments/strings so symbol_exists can't match a symbol that only
// appears inside a comment or string literal. git_grep is intentionally not
// run through this — it keeps raw substring semantics.
function stripCommentsAndStrings(filePath: string, content: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (scannableExtensions.has(ext)) {
    try {
      return stripJsLikeTrivia(content);
    } catch {
      return content;
    }
  }
  if (ext === '.md') {
    return blankMatches(stripQuotedStrings(content), [/<!--[\s\S]*?-->/g, /```[\s\S]*?```/g, /`[^`\n]*`/g]);
  }
  if (ext === '.json' || ext === '.txt') return stripQuotedStrings(content);
  if (slashCommentExtensions.has(ext)) {
    const withoutStrings = stripQuotedStrings(content);
    return blankMatches(withoutStrings, [/\/\*[\s\S]*?\*\//g, /\/\/[^\r\n]*/g]);
  }
  if (hashCommentExtensions.has(ext)) {
    const withoutStrings = stripQuotedStrings(content);
    return blankMatches(withoutStrings, [/#.*$/gm]);
  }
  if (ext === '.sql') {
    return blankMatches(stripQuotedStrings(content), [/\/\*[\s\S]*?\*\//g, /--[^\r\n]*/g, /\$\$[\s\S]*?\$\$/g]);
  }
  if (ext === '.ps1') {
    return blankMatches(stripQuotedStrings(content), [/<#[\s\S]*?#>/g, /#.*$/gm]);
  }
  if (ext === '.html') {
    return blankMatches(stripQuotedStrings(content), [/<!--[\s\S]*?-->/g]);
  }
  return content;
}

function walkTextFiles(root: string, limit = 600): string[] {
  const skip = new Set(['node_modules', 'dist', 'dist-backend', '.git', '.kryleos', 'coverage', '.next', 'build']);
  const files: string[] = [];

  function walk(dir: string, depth: number) {
    if (files.length >= limit || depth > 5) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= limit) return;
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(fullPath, depth + 1);
      } else if (entry.isFile() && textFileExtensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  walk(root, 0);
  return files;
}

function scoreFileCandidate(root: string, filePath: string, keywords: string[]): { score: number; reason: string } {
  const relative = path.relative(root, filePath).replace(/\\/g, '/');
  const lowerRelative = relative.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  for (const keyword of keywords) {
    if (lowerRelative.includes(keyword)) {
      score += 5;
      reasons.push(`path matches "${keyword}"`);
    }
  }

  if (score < 5) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8').slice(0, 50000).toLowerCase();
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          score += 1;
        }
      }
      if (score > 0) reasons.push('content keyword match');
    } catch {}
  }

  if (/readme\.md$/i.test(relative)) {
    score += 2;
    reasons.push('README project signal');
  }
  if (/package\.json$/i.test(relative)) {
    score += 2;
    reasons.push('package manifest signal');
  }

  return { score, reason: reasons.join(', ') || 'low confidence workspace signal' };
}

function extractTraceEvidence(logs: AgentLog[] = []) {
  const filesChanged = new Set<string>();
  const commandsRun: string[] = [];
  const outcomes: string[] = [];

  for (const log of logs) {
    const message = String(log.message || '');
    const writeMatch = message.match(/Successfully wrote file "([^"]+)"/);
    const diffHeader = message.match(/--- DIFF CONTENT ---[\s\S]*?diff --git a\/([^\s]+)\s+b\//);
    const commandApproval = message.match(/COMMAND (?:APPROVED BY USER|APPROVAL REQUIRED)\nCommand:\s*([^\n]+)/);
    const commandComplete = message.match(/Command "([^"]+)" completed with code/);

    if (writeMatch) filesChanged.add(writeMatch[1]);
    if (diffHeader) filesChanged.add(diffHeader[1]);
    if (commandApproval) commandsRun.push(commandApproval[1]);
    if (commandComplete) commandsRun.push(commandComplete[1]);
    if (log.type === 'result' || log.sender === 'terminal') outcomes.push(message.slice(0, 500));
  }

  return {
    filesChanged: Array.from(filesChanged),
    commandsRun: Array.from(new Set(commandsRun)),
    outcomes: outcomes.slice(-8)
  };
}

// Tolerant JSON extraction: prefer <json>…</json>, then ```json fences,
// then the first balanced-looking object. Returns null on any failure.
function parseTolerantJson(raw: string): any | null {
  if (!raw) return null;
  let text = raw.trim();
  const tagMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagMatch) text = tagMatch[1].trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) text = fenceMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Run a one-shot, non-streaming completion by collecting streamed chunks.
function collectCompletion(client: TraceExtractionClient, messages: Message[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let content = '';
    client
      .chatStream(messages, {
        onContentChunk: chunk => { content += chunk; },
        onComplete: full => resolve(full || content),
        onError: err => reject(err)
      })
      .catch(reject);
  });
}

// Resolve the current git commit by reading .git directly (no child process).
// Returns '' when the workspace is not a git repo.
function currentGitCommit(root: string): string {
  try {
    const headPath = path.join(root, '.git', 'HEAD');
    const head = fs.readFileSync(headPath, 'utf-8').trim();
    const refMatch = head.match(/^ref:\s*(.+)$/);
    if (!refMatch) return head; // detached HEAD: already a hash
    const refPath = path.join(root, '.git', refMatch[1]);
    if (fs.existsSync(refPath)) return fs.readFileSync(refPath, 'utf-8').trim();
    // Packed refs fallback.
    const packed = path.join(root, '.git', 'packed-refs');
    if (fs.existsSync(packed)) {
      for (const line of fs.readFileSync(packed, 'utf-8').split('\n')) {
        const [hash, ref] = line.trim().split(/\s+/);
        if (ref === refMatch[1]) return hash;
      }
    }
    return '';
  } catch {
    return '';
  }
}

function stableHash(basis: string): string {
  let hash = 5381;
  for (let i = 0; i < basis.length; i++) hash = ((hash << 5) + hash + basis.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

function workspaceContentHash(root: string): string {
  const hash = crypto.createHash('sha256');
  const generatedStateFiles = new Set([
    'chat_history.json',
    '.kryleos_sync_users.json',
    '.kryleos_sync_state.json',
  ]);
  for (const filePath of walkTextFiles(root).filter(file => !generatedStateFiles.has(path.basename(file))).sort()) {
    const relative = path.relative(root, filePath).replace(/\\/g, '/');
    hash.update(relative);
    hash.update('\0');
    try { hash.update(fs.readFileSync(filePath)); } catch {}
    hash.update('\0');
  }
  return hash.digest('hex');
}

// Stable short signature of an item's criteria so the divergence cache invalidates
// when the criteria themselves change (not only when the commit changes).
function criteriaSignature(criteria: AcceptanceCriterion[]): string {
  const basis = criteria
    .map(c => `${c.id}:${c.type}:${c.target}`)
    .sort()
    .join('|');
  return stableHash(basis);
}

// Per-criterion signature for the llm_check cache — includes the claim text
// (description), since that's what the model is asked to assess.
function llmCheckSignature(criterion: AcceptanceCriterion): string {
  return stableHash(`${criterion.id}:${criterion.type}:${criterion.target}:${criterion.description}`);
}

export interface WorkspaceFingerprint {
  isExistingCodebase: boolean;
  hasReadme: boolean;
  hasGit: boolean;
  hasTests: boolean;
  packageManagers: string[];
  languages: string[];
  fileCount: number;
}

const PACKAGE_MANIFESTS: Record<string, string> = {
  'package.json': 'npm',
  'requirements.txt': 'pip',
  'pyproject.toml': 'pip',
  'Cargo.toml': 'cargo',
  'go.mod': 'go',
  'pom.xml': 'maven',
  'build.gradle': 'gradle',
  'Gemfile': 'bundler',
  'composer.json': 'composer'
};

const EXT_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.rb': 'Ruby',
  '.php': 'PHP', '.cs': 'C#'
};

// Shallow, dependency-free scan to fingerprint a workspace for the bootstrap flow.
export function fingerprintWorkspace(root: string): WorkspaceFingerprint {
  let hasReadme = false;
  let hasGit = false;
  let hasTests = false;
  const packageManagers = new Set<string>();
  const languages = new Set<string>();
  let fileCount = 0;

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return { isExistingCodebase: false, hasReadme: false, hasGit: false, hasTests: false, packageManagers: [], languages: [], fileCount: 0 };
  }

  for (const entry of entries) {
    const name = entry.name;
    if (entry.isDirectory()) {
      if (name === '.git') hasGit = true;
      if (/^(test|tests|__tests__|spec)$/i.test(name)) hasTests = true;
    } else if (entry.isFile()) {
      if (/^readme(\.md|\.txt)?$/i.test(name)) hasReadme = true;
      if (PACKAGE_MANIFESTS[name]) packageManagers.add(PACKAGE_MANIFESTS[name]);
      if (/\.(test|spec)\.[a-z]+$/i.test(name)) hasTests = true;
    }
  }

  // Sample file extensions (bounded walk) for language signal, count, and
  // colocated tests (e.g. src/foo.test.ts) the root-only pass above can't see.
  const sample = walkTextFiles(root, 200);
  fileCount = sample.length;
  for (const filePath of sample) {
    const base = path.basename(filePath);
    const lang = EXT_LANGUAGE[path.extname(filePath).toLowerCase()];
    if (lang) languages.add(lang);
    if (/\.(test|spec)\.[a-z]+$/i.test(base)) hasTests = true;
  }

  const isExistingCodebase = hasReadme || hasGit || packageManagers.size > 0 || fileCount > 0;
  return {
    isExistingCodebase,
    hasReadme,
    hasGit,
    hasTests,
    packageManagers: Array.from(packageManagers),
    languages: Array.from(languages),
    fileCount
  };
}

export interface BootstrapEvaluation {
  evaluatedAt: string;
  evaluated: number;
  likelyComplete: Array<{ taskId: string; title: string }>;
  tasks: ProjectTask[];
}

// Bootstrap "Likely Complete": at least one structural criterion and ALL structural
// criteria pass. Non-structural (test_passes/llm_check) are ignored during bootstrap.
export function isLikelyComplete(results: CriterionResult[]): boolean {
  const structural = results.filter(r => structuralFailTypes.has(r.type));
  return structural.length > 0 && structural.every(r => r.status === 'pass');
}

// Parse + validate an LLM Phase 1 criteria response. Pure; returns null when the
// payload yields no usable abstract criteria (caller falls back to deterministic).
export function parsePhase1Criteria(raw: string, task: ProjectTask): AcceptanceCriterion[] | null {
  const allowed = new Set<AcceptanceCriterionType>(['symbol_exists', 'test_passes', 'llm_check']);
  const parsed = parseTolerantJson(raw) as { criteria?: Array<{ type?: unknown; description?: unknown; target?: unknown }> } | null;
  const rows = parsed?.criteria;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const baseId = slugPart(task.id || task.title);
  const criteria: AcceptanceCriterion[] = rows
    .filter(row => typeof row.description === 'string' && typeof row.target === 'string' && row.description.trim() && row.target.trim())
    .map((row, idx) => {
      const type = (typeof row.type === 'string' && allowed.has(row.type as AcceptanceCriterionType))
        ? (row.type as AcceptanceCriterionType)
        : 'llm_check';
      return {
        id: `${baseId}-ai-${idx}`,
        type,
        description: (row.description as string).trim(),
        target: (row.target as string).trim(),
        phase: 'phase1' as const,
        status: 'unknown' as const,
        evidence: 'AI-drafted Phase 1 criterion. Review and edit before relying on it.'
      };
    });
  return criteria.length > 0 ? criteria : null;
}

function truncateList(items: string[], max: number): string {
  if (items.length === 0) return '(none)';
  const shown = items.slice(0, max).map(item => `- ${item.replace(/\s+/g, ' ').slice(0, 200)}`);
  if (items.length > max) shown.push(`- …and ${items.length - max} more`);
  return shown.join('\n');
}

export class PlanningV2Service {
  private chatDb: ChatDatabase;
  private workspaceRoot: string;
  private flowSessionId: string;

  constructor(chatDb: ChatDatabase, workspaceRoot: string, flowSessionId: string = 'flow_board') {
    this.chatDb = chatDb;
    this.workspaceRoot = workspaceRoot;
    this.flowSessionId = flowSessionId;
  }

  private async getFlowSession(): Promise<ChatSession> {
    const existing = await this.chatDb.getSession(this.flowSessionId);
    return existing || {
      id: this.flowSessionId,
      title: this.flowSessionId === 'flow_board' ? 'FLOW Board' : 'Project Tasks',
      createdAt: new Date().toISOString(),
      logs: [],
      checklist: [],
      space: 'project',
      tasks: []
    };
  }

  // Locate the FLOW board session that actually holds the task: the active
  // board first, then any other saved project-space board. Items created on a
  // project-scoped board must stay reachable even when the active board changes.
  private async findTaskSession(taskId: string): Promise<{ session: ChatSession; idx: number } | null> {
    const active = await this.getFlowSession();
    let idx = (active.tasks || []).findIndex(task => task.id === taskId);
    if (idx !== -1) return { session: active, idx };
    const sessions = await this.chatDb.listSessions('project');
    for (const meta of sessions) {
      if (meta.id === this.flowSessionId) continue;
      const session = await this.chatDb.getSession(meta.id);
      if (!session) continue;
      idx = (session.tasks || []).findIndex(task => task.id === taskId);
      if (idx !== -1) return { session, idx };
    }
    return null;
  }

  private async updateTask(taskId: string, updater: (task: ProjectTask) => ProjectTask): Promise<ProjectTask> {
    const found = await this.findTaskSession(taskId);
    if (!found) throw new Error(`Plan item not found: ${taskId}`);
    const tasks = found.session.tasks || [];
    const updated = updater(tasks[found.idx]);
    tasks[found.idx] = updated;
    found.session.tasks = tasks;
    await this.chatDb.saveSession(found.session);
    return updated;
  }

  public draftCriteria(task: ProjectTask): AcceptanceCriterion[] {
    return titleToCriteria(task);
  }

  public bootstrapFingerprint(): WorkspaceFingerprint {
    return fingerprintWorkspace(this.workspaceRoot);
  }

  // Existing-project bootstrap: for each task, ensure Phase 1 criteria exist
  // (AI/deterministic, llm_check dropped per bootstrap rule), evaluate structural
  // criteria against the workspace scan, and flag items whose structural criteria
  // all pass as "Likely Complete" for user confirmation. Stores a bootstrap trace.
  public async bootstrapEvaluate(client?: TraceExtractionClient): Promise<BootstrapEvaluation> {
    const session = await this.getFlowSession();
    const tasks = session.tasks || [];

    // 1. Ensure each task has Phase 1 criteria (no llm_check during bootstrap).
    for (const task of tasks) {
      if ((task.acceptanceCriteria || []).length > 0) continue;
      const generated = await this.generateCriteria(client, task.id);
      const structuralOnly = generated.criteria.filter(c => c.type !== 'llm_check');
      const criteria = structuralOnly.length > 0 ? structuralOnly : generated.criteria;
      await this.saveCriteria(task.id, criteria);
    }

    // 2. Re-load, evaluate, flag.
    const fresh = await this.getFlowSession();
    const freshTasks = fresh.tasks || [];
    const likelyComplete: Array<{ taskId: string; title: string }> = [];

    for (const task of freshTasks) {
      const criteria = (task.acceptanceCriteria || []).filter(c => c.type !== 'llm_check');
      const results = criteria.length > 0 ? this.evaluateCriteria(task, criteria) : [];
      const likely = isLikelyComplete(results);
      task.bootstrapLikelyComplete = likely;
      if (likely) likelyComplete.push({ taskId: task.id, title: task.title });
    }

    fresh.tasks = freshTasks;
    await this.chatDb.saveSession(fresh);

    // 3. Persist a bootstrap trace per likely-complete item (no llm_check).
    for (const entry of likelyComplete) {
      await this.saveTrace({
        planItemId: entry.taskId,
        summary: `Bootstrap scan: structural criteria pass for "${entry.title}".`
      });
    }

    return {
      evaluatedAt: new Date().toISOString(),
      evaluated: freshTasks.length,
      likelyComplete,
      tasks: freshTasks
    };
  }

  // AI Phase 1 criteria: abstract, structural, NO file paths (symbol_exists /
  // test_passes / llm_check). Returned for user review — never auto-saved.
  // Deterministic titleToCriteria fallback when no client or output.
  public async generateCriteria(client: TraceExtractionClient | undefined, taskId: string): Promise<{ task: ProjectTask; criteria: AcceptanceCriterion[]; usedLlm: boolean }> {
    const { task } = await this.getCriteria(taskId);
    if (!client) return { task, criteria: titleToCriteria(task), usedLlm: false };

    const userPrompt = [
      `Generate 2-4 abstract, structural acceptance criteria for this plan item.`,
      `Phase 1 rules: NO file paths or directory assumptions. Allowed types only:`,
      `- symbol_exists: a function/class/component/identifier that must exist`,
      `- test_passes: a test or command that must pass`,
      `- llm_check: a behavioral claim a reviewer/LLM can confirm`,
      ``,
      `PLAN ITEM: ${normalizeText(task.title)}`,
      `CATEGORY: ${task.category || inferCategory(task.title)}`,
      ``,
      `Respond with ONLY JSON wrapped in <json></json>:`,
      `<json>{"criteria":[{"type":"symbol_exists","description":"<what>","target":"<symbol, command, or claim>"}]}</json>`,
      `Keep targets abstract (symbol name, command, or claim) — never a path like src/x.ts.`
    ].join('\n');

    const messages: Message[] = [
      { role: 'system', content: 'You draft abstract acceptance criteria for an AI coding tool. You report strictly in JSON.' },
      { role: 'user', content: userPrompt }
    ];

    try {
      const raw = await collectCompletion(client, messages);
      const criteria = parsePhase1Criteria(raw, task);
      return criteria
        ? { task, criteria, usedLlm: true }
        : { task, criteria: titleToCriteria(task), usedLlm: false };
    } catch {
      return { task, criteria: titleToCriteria(task), usedLlm: false };
    }
  }

  public async generateCriteriaForIssue(
    client: TraceExtractionClient | undefined,
    title: string,
    body: string,
    id: string
  ): Promise<{ criteria: AcceptanceCriterion[]; usedLlm: boolean }> {
    const mockTask: ProjectTask = {
      id,
      title,
      status: 'todo',
      category: inferCategory(title)
    };
    if (!client) return { criteria: titleToCriteria(mockTask), usedLlm: false };

    const userPrompt = [
      `Generate 2-4 abstract, structural acceptance criteria for this plan item based on the description/body.`,
      `Phase 1 rules: NO file paths or directory assumptions. Allowed types only:`,
      `- symbol_exists: a function/class/component/identifier that must exist`,
      `- test_passes: a test or command that must pass`,
      `- llm_check: a behavioral claim a reviewer/LLM can confirm`,
      ``,
      `PLAN ITEM: ${normalizeText(title)}`,
      `DESCRIPTION: ${normalizeText(body || '(no description)')}`,
      `CATEGORY: ${mockTask.category}`,
      ``,
      `Respond with ONLY JSON wrapped in <json></json>:`,
      `<json>{"criteria":[{"type":"symbol_exists","description":"<what>","target":"<symbol, command, or claim>"}]}</json>`,
      `Keep targets abstract (symbol name, command, or claim) — never a path like src/x.ts.`
    ].join('\n');

    const messages: Message[] = [
      { role: 'system', content: 'You draft abstract acceptance criteria for an AI coding tool. You report strictly in JSON.' },
      { role: 'user', content: userPrompt }
    ];

    try {
      const raw = await collectCompletion(client, messages);
      const criteria = parsePhase1Criteria(raw, mockTask);
      return criteria
        ? { criteria, usedLlm: true }
        : { criteria: titleToCriteria(mockTask), usedLlm: false };
    } catch {
      return { criteria: titleToCriteria(mockTask), usedLlm: false };
    }
  }

  public scanDocsContext(): {
    packageJson?: any;
    readmeExcerpt?: string;
    sourceTree?: string;
    testFilesCount: number;
    recentGitChanges?: string;
    gitStatus?: string;
  } {
    const root = this.workspaceRoot;
    const context: {
      packageJson?: any;
      readmeExcerpt?: string;
      sourceTree?: string;
      testFilesCount: number;
      recentGitChanges?: string;
      gitStatus?: string;
    } = { testFilesCount: 0 };

    // 1. Package JSON
    try {
      const pkgPath = path.join(root, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        context.packageJson = {
          name: pkg.name,
          version: pkg.version,
          dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : [],
          devDependencies: pkg.devDependencies ? Object.keys(pkg.devDependencies) : [],
          scripts: pkg.scripts || {}
        };
      }
    } catch {}

    // 2. README
    try {
      const readmeFiles = ['README.md', 'readme.md', 'README.txt'];
      for (const file of readmeFiles) {
        const readmePath = path.join(root, file);
        if (fs.existsSync(readmePath)) {
          const readmeContent = fs.readFileSync(readmePath, 'utf-8');
          context.readmeExcerpt = readmeContent.slice(0, 1000);
          break;
        }
      }
    } catch {}

    // 3. Source Tree (simple walk up to depth 3, max 100 files)
    try {
      const treeLines: string[] = [];
      const skip = new Set(['node_modules', 'dist', 'dist-backend', '.git', '.kryleos', 'coverage', '.next', 'build']);
      
      const walkTree = (dir: string, depth: number, prefix: string) => {
        if (depth > 3 || treeLines.length >= 100) return;
        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        
        for (const entry of entries) {
          if (entry.name.startsWith('.') && entry.name !== '.kryleos') continue;
          if (skip.has(entry.name)) continue;
          
          treeLines.push(`${prefix}├── ${entry.name}${entry.isDirectory() ? '/' : ''}`);
          if (entry.isDirectory()) {
            walkTree(path.join(dir, entry.name), depth + 1, prefix + '│   ');
          }
        }
      };
      
      walkTree(root, 0, '');
      context.sourceTree = treeLines.join('\n');
    } catch {}

    // 4. Test Files count
    try {
      const testFiles = walkTextFiles(root, 300).filter(f => /\.(test|spec)\.[a-z]+$/i.test(f));
      context.testFilesCount = testFiles.length;
    } catch {}

    // 5. Recent Git changes & status
    try {
      context.recentGitChanges = execSync('git log -n 5 --oneline', { cwd: root, encoding: 'utf-8' }).trim();
      context.gitStatus = execSync('git status --short', { cwd: root, encoding: 'utf-8' }).trim();
    } catch {}

    return context;
  }

  public async getCriteria(taskId: string): Promise<{ task: ProjectTask; criteria: AcceptanceCriterion[] }> {
    const found = await this.findTaskSession(taskId);
    if (!found) throw new Error(`Plan item not found: ${taskId}`);
    const task = (found.session.tasks || [])[found.idx];
    return { task, criteria: task.acceptanceCriteria || [] };
  }

  public async saveCriteria(taskId: string, criteria?: AcceptanceCriterion[]): Promise<ProjectTask> {
    return this.updateTask(taskId, task => ({
      ...task,
      category: task.category || inferCategory(task.title),
      acceptanceCriteria: criteria && criteria.length > 0 ? criteria : titleToCriteria(task),
      lastModified: new Date().toISOString()
    }));
  }

  public async patchCriteria(taskId: string, criteria: AcceptanceCriterion[]): Promise<ProjectTask> {
    return this.updateTask(taskId, task => ({
      ...task,
      acceptanceCriteria: criteria,
      lastModified: new Date().toISOString()
    }));
  }

  public async enrichCriteria(taskId: string): Promise<CriteriaEnrichmentResult> {
    const { task } = await this.getCriteria(taskId);
    const root = resolveWorkspace(this.workspaceRoot, task);
    const keywords = titleKeywords(`${task.title} ${task.category || ''}`);
    const files = walkTextFiles(root, 400);
    const candidates = files
      .map(filePath => {
        const scored = scoreFileCandidate(root, filePath, keywords);
        return {
          path: path.relative(root, filePath).replace(/\\/g, '/'),
          score: scored.score,
          reason: scored.reason
        };
      })
      .filter(candidate => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const existing = task.acceptanceCriteria && task.acceptanceCriteria.length > 0
      ? task.acceptanceCriteria
      : titleToCriteria(task);
    const existingTargets = new Set(existing.map(criterion => `${criterion.type}:${criterion.target}`.toLowerCase()));
    const added: AcceptanceCriterion[] = candidates
      .filter(candidate => !existingTargets.has(`file_exists:${candidate.path}`.toLowerCase()))
      .map(candidate => ({
        id: `${slugPart(task.id)}-${slugPart(candidate.path)}-exists`,
        type: 'file_exists',
        description: `Confirm relevant workspace file exists: ${candidate.path}`,
        target: candidate.path,
        phase: 'phase2',
        status: 'unknown',
        evidence: `Phase 2 enrichment candidate (${candidate.reason}). User should confirm.`
      }));

    const updated = await this.patchCriteria(taskId, [...existing, ...added]);
    return { task: updated, added, candidates };
  }

  public evaluateCriteria(task: ProjectTask, criteria: AcceptanceCriterion[]): CriterionResult[] {
    const root = resolveWorkspace(this.workspaceRoot, task);
    const textFiles = walkTextFiles(root);

    return criteria.map(criterion => {
      const target = criterion.target.trim();
      if (!target) {
        return { criterionId: criterion.id, type: criterion.type, status: 'unknown', evidence: 'No target configured.' };
      }

      if (criterion.type === 'file_exists') {
        const resolved = path.isAbsolute(target) ? target : path.resolve(root, target);
        const status = fs.existsSync(resolved) ? 'pass' : 'fail';
        return { criterionId: criterion.id, type: criterion.type, status, evidence: status === 'pass' ? `Found ${target}` : `Missing ${target}` };
      }

      if (criterion.type === 'symbol_exists' || criterion.type === 'git_grep') {
        // symbol_exists must match a whole identifier (so "Foo" does not match
        // "Foobar"); git_grep keeps grep-style substring semantics.
        let matcher: RegExp | null = null;
        if (criterion.type === 'symbol_exists') {
          const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          matcher = new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`);
        }
        for (const filePath of textFiles) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const searchable = matcher ? stripCommentsAndStrings(filePath, content) : content;
            const hit = matcher ? matcher.test(searchable) : content.includes(target);
            if (hit) {
              return {
                criterionId: criterion.id,
                type: criterion.type,
                status: 'pass',
                evidence: `Matched "${target}" in ${path.relative(root, filePath)}`
              };
            }
          } catch {}
        }
        return { criterionId: criterion.id, type: criterion.type, status: 'fail', evidence: `No text match for "${target}"` };
      }

      if (criterion.type === 'test_passes') {
        return { criterionId: criterion.id, type: criterion.type, status: 'unknown', evidence: 'Test criteria require an execution trace command result.' };
      }

      return { criterionId: criterion.id, type: criterion.type, status: 'unknown', evidence: 'LLM check is deferred to a later Phase 2.6 slice.' };
    });
  }

  public classify(task: ProjectTask, results: CriterionResult[], latestTrace?: ExecutionTrace): DriftClassification {
    if ((task.blockedBy || []).length > 0) return 'blocked';
    if (task.status === 'done') return 'complete';
    if (results.length === 0) return latestTrace ? 'needs_review' : 'not_started';
    const passCount = results.filter(result => result.status === 'pass').length;
    const failCount = results.filter(result => result.status === 'fail').length;
    const unknownCount = results.filter(result => result.status === 'unknown').length;
    if (passCount === results.length) return 'complete';
    if (passCount > 0 && failCount + unknownCount > 0) return 'in_progress';
    if (failCount > 0 && latestTrace) return 'needs_review';
    return 'not_started';
  }

  public suggestedStatus(status: DriftClassification): ProjectTask['status'] {
    if (status === 'complete') return 'done';
    if (status === 'in_progress' || status === 'needs_review' || status === 'diverged') return 'in_progress';
    return 'todo';
  }

  // Dedicated post-run structured-output call. Structural criteria are already
  // evaluated with real code/test checks before this runs; the model only refines
  // the summary and resolves criteria that structural checks left `unknown`
  // (e.g. test_passes, llm_check), grounded strictly in the run evidence.
  public async extractTraceWithLLM(
    client: TraceExtractionClient,
    task: ProjectTask,
    evaluated: CriterionResult[],
    evidence: { filesChanged: string[]; commandsRun: string[]; outcomes: string[] }
  ): Promise<LlmTraceResult | null> {
    const criteriaById = new Map((task.acceptanceCriteria || []).map(c => [c.id, c]));
    const unresolved = evaluated.filter(result => result.status === 'unknown');
    const unresolvedBlock = unresolved
      .map(result => {
        const criterion = criteriaById.get(result.criterionId);
        return `- ${result.criterionId} [${result.type}]: ${criterion?.description || result.criterionId} (target: ${criterion?.target || 'n/a'})`;
      })
      .join('\n');

    const userPrompt = [
      `Analyze the result of an automated coding agent run for this plan item.`,
      ``,
      `PLAN ITEM: ${normalizeText(task.title)}`,
      ``,
      `FILES CHANGED:`,
      truncateList(evidence.filesChanged, 25),
      ``,
      `COMMANDS RUN:`,
      truncateList(evidence.commandsRun, 25),
      ``,
      `RUN OUTPUT (most recent first, truncated):`,
      truncateList(evidence.outcomes, 8),
      ``,
      unresolved.length > 0
        ? `UNRESOLVED CRITERIA — assess each ONLY from the evidence above. Use "pass" or "fail" only when the evidence clearly supports it; otherwise "unknown":\n${unresolvedBlock}`
        : `There are no unresolved criteria to assess.`,
      ``,
      `Respond with ONLY a JSON object wrapped in <json></json> tags, shaped exactly:`,
      `<json>{"summary": "<1-2 sentence plain summary of what the run accomplished>", "criteria": [{"criterionId": "<id>", "status": "pass|fail|unknown", "evidence": "<short reason grounded in the evidence>"}]}</json>`,
      `Only include criteria you were asked to assess. Never invent files, commands, or results not present in the evidence.`
    ].join('\n');

    const messages: Message[] = [
      {
        role: 'system',
        content: 'You are an execution-trace analyzer for an AI coding tool. You report strictly in JSON and never fabricate evidence.'
      },
      { role: 'user', content: userPrompt }
    ];

    try {
      const raw = await collectCompletion(client, messages);
      return parseTolerantJson(raw) as LlmTraceResult | null;
    } catch {
      return null;
    }
  }

  public async saveTrace(
    traceInput: Partial<ExecutionTrace> & { planItemId: string; logs?: AgentLog[]; client?: TraceExtractionClient }
  ): Promise<ExecutionTrace> {
    const { task, criteria } = await this.getCriteria(traceInput.planItemId);
    let evaluated = criteria.length > 0 ? this.evaluateCriteria(task, criteria) : [];
    const evidence = extractTraceEvidence(traceInput.logs || []);
    let summary = traceInput.summary || `Trace captured for ${task.title}`;

    // Fire the dedicated structured-output extraction only when a client is
    // supplied and the caller hasn't pre-computed criteria results.
    if (traceInput.client && criteria.length > 0 && !traceInput.criteriaResults) {
      const llm = await this.extractTraceWithLLM(traceInput.client, task, evaluated, evidence);
      if (llm) {
        if (llm.summary && !traceInput.summary) summary = llm.summary.trim();
        if (Array.isArray(llm.criteria)) {
          const byId = new Map(llm.criteria.map(entry => [entry.criterionId, entry]));
          evaluated = evaluated.map(result => {
            // Structural pass/fail checks are authoritative; the model may only
            // resolve criteria that real checks left as `unknown`.
            if (result.status !== 'unknown') return result;
            const guess = byId.get(result.criterionId);
            if (guess && (guess.status === 'pass' || guess.status === 'fail')) {
              return { ...result, status: guess.status, evidence: `LLM: ${guess.evidence || 'assessed from run evidence'}` };
            }
            return result;
          });
        }
      }
    }

    const timestamp = traceInput.timestamp || new Date().toISOString();
    if (traceInput.incompleteReason) {
      evaluated = evaluated.map(result => ({
        ...result,
        status: 'unknown',
        evidence: `Incomplete run: ${traceInput.incompleteReason}`
      }));
    }
    const status = traceInput.incompleteReason ? 'in_progress' : this.classify(task, evaluated);
    const trace: ExecutionTrace = {
      id: `${timestamp}-${slugPart(traceInput.planItemId)}`,
      planItemId: traceInput.planItemId,
      timestamp,
      filesChanged: traceInput.filesChanged || evidence.filesChanged,
      commandsRun: traceInput.commandsRun || evidence.commandsRun,
      outcomes: traceInput.outcomes || evidence.outcomes,
      criteriaResults: traceInput.criteriaResults || evaluated,
      suggestedStatus: traceInput.suggestedStatus || this.suggestedStatus(status),
      summary,
      mode: traceInput.mode,
      incompleteReason: traceInput.incompleteReason
    };

    const dir = traceDir(this.workspaceRoot);
    const finalPath = path.join(dir, safeTraceFileName(trace));
    const tempPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(trace, null, 2), 'utf-8');
    fs.renameSync(tempPath, finalPath);
    await this.updateTask(trace.planItemId, item => ({
      ...item,
      latestTraceId: trace.id,
      driftStatus: status,
      lastModified: new Date().toISOString()
    }));
    return trace;
  }

  public async recoverInterruptedRun(): Promise<ExecutionTrace | null> {
    const markerPath = path.join(kryleosDir(this.workspaceRoot), 'run-in-progress.json');
    if (!fs.existsSync(markerPath)) return null;
    try {
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8')) as { planItemId?: string; startedAt?: string };
      if (!marker.planItemId) return null;
      const trace = await this.saveTrace({
        planItemId: marker.planItemId,
        timestamp: new Date().toISOString(),
        summary: `Recovered interrupted FORGE run started at ${marker.startedAt || 'an unknown time'}. Review and rerun it.`,
        suggestedStatus: 'in_progress',
        incompleteReason: 'application or backend stopped before trace completion'
      });
      fs.unlinkSync(markerPath);
      return trace;
    } catch {
      return null;
    }
  }

  public listTraces(planItemId: string): ExecutionTrace[] {
    const dir = traceDir(this.workspaceRoot);
    return fs.readdirSync(dir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as ExecutionTrace;
        } catch {
          return null;
        }
      })
      .filter((trace): trace is ExecutionTrace => Boolean(trace && trace.planItemId === planItemId))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public latestTrace(planItemId: string): ExecutionTrace | undefined {
    return this.listTraces(planItemId)[0];
  }

  private divergenceCachePath(): string {
    return path.join(kryleosDir(this.workspaceRoot), 'drift-cache.json');
  }

  private loadDivergenceCache(): Record<string, DivergenceCacheEntry> {
    try {
      return JSON.parse(fs.readFileSync(this.divergenceCachePath(), 'utf-8'));
    } catch {
      return {};
    }
  }

  private llmCheckCachePath(): string {
    return path.join(kryleosDir(this.workspaceRoot), 'llm-check-cache.json');
  }

  private loadLlmCheckCache(): Record<string, LlmCheckCacheEntry> {
    try {
      return JSON.parse(fs.readFileSync(this.llmCheckCachePath(), 'utf-8'));
    } catch {
      return {};
    }
  }

  private saveLlmCheckCache(cache: Record<string, LlmCheckCacheEntry>) {
    try {
      fs.writeFileSync(this.llmCheckCachePath(), JSON.stringify(cache, null, 2), 'utf-8');
    } catch {
      // Cache is best-effort; ignore write failures.
    }
  }

  // Standalone, on-demand evaluator for `llm_check` criteria. Grounded only in
  // workspace file excerpts relevant to the plan item's title — never fabricates
  // evidence, and defaults to "unknown" when the excerpts don't clearly settle it.
  public async evaluateLlmCheck(
    client: TraceExtractionClient,
    task: ProjectTask,
    criterion: AcceptanceCriterion,
    root: string
  ): Promise<{ status: CriterionResultStatus; evidence: string }> {
    const keywords = titleKeywords(normalizeText(task.title));
    const candidates = walkTextFiles(root)
      .map(filePath => ({ filePath, ...scoreFileCandidate(root, filePath, keywords) }))
      .filter(candidate => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const excerptBlock = candidates.length > 0
      ? candidates
          .map(candidate => {
            const relative = path.relative(root, candidate.filePath).replace(/\\/g, '/');
            let content = '';
            try { content = fs.readFileSync(candidate.filePath, 'utf-8').slice(0, 2000); } catch {}
            return `--- ${relative} ---\n${content}`;
          })
          .join('\n\n')
      : 'No relevant workspace files were found.';

    const userPrompt = [
      `Assess whether the claim below about a plan item is supported by the workspace evidence.`,
      ``,
      `PLAN ITEM: ${normalizeText(task.title)}`,
      `CLAIM TO ASSESS: ${criterion.description}`,
      criterion.target ? `TARGET: ${criterion.target}` : '',
      ``,
      `WORKSPACE EVIDENCE (excerpts, may be incomplete):`,
      excerptBlock,
      ``,
      `Respond with ONLY a JSON object wrapped in <json></json>:`,
      `<json>{"status": "pass|fail|unknown", "evidence": "<short reason grounded in the excerpts above>"}</json>`,
      `Use "pass" only when the excerpts clearly support the claim, "fail" only when they clearly contradict it,`,
      `and "unknown" when the excerpts don't settle it. Never invent files or content not shown above.`
    ].filter(Boolean).join('\n');

    const messages: Message[] = [
      {
        role: 'system',
        content: 'You assess acceptance-criteria claims for an AI coding tool from workspace evidence only. You report strictly in JSON and never fabricate evidence.'
      },
      { role: 'user', content: userPrompt }
    ];

    try {
      const raw = await collectCompletion(client, messages);
      const parsed = parseTolerantJson(raw) as { status?: unknown; evidence?: unknown } | null;
      const status = parsed?.status;
      if (status === 'pass' || status === 'fail' || status === 'unknown') {
        return { status, evidence: typeof parsed?.evidence === 'string' ? `LLM: ${parsed.evidence}` : 'LLM assessment (no reason given).' };
      }
      return { status: 'unknown', evidence: 'LLM response was not understood.' };
    } catch {
      return { status: 'unknown', evidence: 'LLM check call failed.' };
    }
  }

  private saveDivergenceCache(cache: Record<string, DivergenceCacheEntry>) {
    try {
      fs.writeFileSync(this.divergenceCachePath(), JSON.stringify(cache, null, 2), 'utf-8');
    } catch {
      // Cache is best-effort; ignore write failures.
    }
  }

  // Targeted single-shot LLM call: given an item with failing structural criteria,
  // decide whether the implementation has DIVERGED (conflicts with intent) versus
  // simply being incomplete. Grounded in the failing criteria + their evidence.
  public async classifyDivergence(
    client: TraceExtractionClient,
    task: ProjectTask,
    failingResults: CriterionResult[]
  ): Promise<boolean | null> {
    const criteriaById = new Map((task.acceptanceCriteria || []).map(c => [c.id, c]));
    const failingBlock = failingResults
      .map(result => {
        const criterion = criteriaById.get(result.criterionId);
        return `- ${result.type}: ${criterion?.description || result.criterionId} — evidence: ${result.evidence}`;
      })
      .join('\n');

    const userPrompt = [
      `A plan item has FAILING acceptance criteria after an implementation attempt.`,
      `Decide whether the implementation has DIVERGED from the item's intent — i.e. the code`,
      `does something conflicting or contradictory to what the item asked — versus simply being`,
      `INCOMPLETE (the work just is not finished yet).`,
      ``,
      `PLAN ITEM: ${normalizeText(task.title)}`,
      `CATEGORY: ${task.category || 'unspecified'}`,
      ``,
      `FAILING CRITERIA:`,
      failingBlock,
      ``,
      `Respond with ONLY a JSON object wrapped in <json></json>:`,
      `<json>{"diverged": true, "reason": "<short justification>"}</json>`,
      `Set "diverged" true ONLY when the evidence suggests a conflicting/contradictory implementation,`,
      `not merely unfinished work. When unsure, return false.`
    ].join('\n');

    const messages: Message[] = [
      {
        role: 'system',
        content: 'You classify plan-item drift for an AI coding tool. You report strictly in JSON and never fabricate evidence.'
      },
      { role: 'user', content: userPrompt }
    ];

    try {
      const raw = await collectCompletion(client, messages);
      const parsed = parseTolerantJson(raw) as { diverged?: unknown } | null;
      if (!parsed || typeof parsed.diverged !== 'boolean') return null;
      return parsed.diverged;
    } catch {
      return null;
    }
  }

  // Single LLM call: rank open items by what to tackle next, with a one-line reason
  // each. Returns ordered {taskId, reason}. Empty on failure (caller falls back).
  public async prioritizeWhatsLeft(
    client: TraceExtractionClient,
    open: DriftItem[]
  ): Promise<Array<{ taskId: string; reason: string }>> {
    const list = open
      .map(item => {
        const fails = item.results.filter(r => r.status === 'fail').map(r => r.type).join(', ') || 'none';
        return `- id=${item.taskId} | "${normalizeText(item.title)}" | status=${item.status} | failing=${fails}`;
      })
      .join('\n');

    const userPrompt = [
      `These plan items are not complete. Rank them by what a developer should tackle next,`,
      `highest priority first, and give a short reason for each.`,
      ``,
      `ITEMS:`,
      list,
      ``,
      `Respond with ONLY JSON wrapped in <json></json>, highest priority first:`,
      `<json>{"items":[{"taskId":"<id>","reason":"<short why-next>"}]}</json>`,
      `Use only the ids listed. Reason must be one concise sentence.`
    ].join('\n');

    const messages: Message[] = [
      { role: 'system', content: 'You prioritize remaining work for an AI coding tool. You report strictly in JSON.' },
      { role: 'user', content: userPrompt }
    ];

    try {
      const raw = await collectCompletion(client, messages);
      const parsed = parseTolerantJson(raw) as { items?: Array<{ taskId?: unknown; reason?: unknown }> } | null;
      if (!parsed || !Array.isArray(parsed.items)) return [];
      const valid = new Set(open.map(item => item.taskId));
      return parsed.items
        .filter(entry => typeof entry.taskId === 'string' && valid.has(entry.taskId))
        .map(entry => ({ taskId: entry.taskId as string, reason: typeof entry.reason === 'string' ? entry.reason : '' }));
    } catch {
      return [];
    }
  }

  // "What's Left" report: drift-evaluated open items, AI-prioritized via one LLM call,
  // capped to `limit` (null = unlimited). Deterministic fallback when no client.
  public async whatsLeft(
    client: TraceExtractionClient | undefined,
    limit: number | null
  ): Promise<WhatsLeftReport> {
    const report = await this.checkDrift(client);
    const open = report.items.filter(item => item.status !== 'complete');

    const statusWeight: Record<DriftClassification, number> = {
      diverged: 5, needs_review: 4, in_progress: 3, not_started: 2, blocked: 1, complete: 0
    };
    const deterministicReason = (item: DriftItem): string => {
      const fails = item.results.filter(r => r.status === 'fail').length;
      if (item.status === 'diverged') return 'Implementation appears to conflict with the plan item intent.';
      if (item.status === 'blocked') return `Blocked by ${item.blockedBy.length} unfinished dependency(ies).`;
      if (item.status === 'in_progress') return `In progress — ${fails} criterion(s) still failing.`;
      if (item.status === 'needs_review') return 'Low-confidence signals — needs review.';
      return 'Not started — no passing criteria yet.';
    };

    const ranked = client && open.length > 0 ? await this.prioritizeWhatsLeft(client, open) : [];
    const usedLlm = ranked.length > 0;

    let ordered: DriftItem[];
    const reasons = new Map<string, string>();
    if (usedLlm) {
      const order = new Map(ranked.map((entry, idx) => [entry.taskId, idx]));
      for (const entry of ranked) if (entry.reason) reasons.set(entry.taskId, entry.reason);
      ordered = [...open].sort((a, b) => {
        const ra = order.has(a.taskId) ? order.get(a.taskId)! : Number.MAX_SAFE_INTEGER;
        const rb = order.has(b.taskId) ? order.get(b.taskId)! : Number.MAX_SAFE_INTEGER;
        return ra - rb;
      });
    } else {
      ordered = [...open].sort((a, b) => statusWeight[b.status] - statusWeight[a.status]);
    }

    const total = ordered.length;
    const capped = limit === null ? ordered : ordered.slice(0, limit);
    const items: WhatsLeftItem[] = capped.map(item => ({
      taskId: item.taskId,
      title: item.title,
      status: item.status,
      category: item.category,
      reason: reasons.get(item.taskId) || deterministicReason(item)
    }));

    return {
      generatedAt: new Date().toISOString(),
      items,
      total,
      limit,
      truncated: limit !== null && total > limit,
      usedLlm
    };
  }

  public async checkDrift(client?: TraceExtractionClient): Promise<DriftReport> {
    const session = await this.getFlowSession();
    const items: DriftItem[] = (session.tasks || []).map(task => {
      const criteria = task.acceptanceCriteria || [];
      const latestTrace = this.latestTrace(task.id);
      const results = criteria.length > 0 ? this.evaluateCriteria(task, criteria) : [];
      const status = this.classify(task, results, latestTrace);
      return {
        taskId: task.id,
        title: task.title,
        status,
        category: task.category,
        workspace: task.workspace,
        blockedBy: task.blockedBy || [],
        results,
        latestTrace,
        suggestedStatus: this.suggestedStatus(status)
      };
    });

    const taskById = new Map((session.tasks || []).map(task => [task.id, task]));
    let deferred = 0;
    let llmEvaluated = 0;

    // llm_check resolution and divergence both only run when a client is available.
    if (client) {
      const commit = currentGitCommit(this.workspaceRoot);
      const workspaceHashes = new Map<string, string>();

      // Standalone llm_check evaluator: resolve any llm_check criteria the
      // structural pass left `unknown`, budgeted and cached per criterion.
      const llmCheckCache = this.loadLlmCheckCache();
      let llmCheckBudget = MAX_LLM_CHECK_CALLS;

      for (const item of items) {
        const task = taskById.get(item.taskId);
        if (!task) continue;
        const llmCheckCriteria = (task.acceptanceCriteria || []).filter(c => c.type === 'llm_check');
        if (llmCheckCriteria.length === 0) continue;

        let changed = false;
        for (const criterion of llmCheckCriteria) {
          const result = item.results.find(r => r.criterionId === criterion.id);
          if (!result || result.status !== 'unknown') continue;

          const cacheKey = `${item.taskId}:${criterion.id}`;
          const criteriaKey = llmCheckSignature(criterion);
          const cached = llmCheckCache[cacheKey];
          const root = resolveWorkspace(this.workspaceRoot, task);
          let workspaceHash = workspaceHashes.get(root);
          if (!workspaceHash) {
            workspaceHash = workspaceContentHash(root);
            workspaceHashes.set(root, workspaceHash);
          }

          if (cached && cached.workspaceHash === workspaceHash && cached.criteriaKey === criteriaKey) {
            if (cached.status !== 'unknown') {
              result.status = cached.status;
              result.evidence = cached.evidence;
              changed = true;
            }
            continue;
          }

          if (llmCheckBudget <= 0) { deferred++; continue; }
          llmCheckBudget--;
          llmEvaluated++;
          const evaluation = await this.evaluateLlmCheck(client, task, criterion, root);
          llmCheckCache[cacheKey] = { workspaceHash, criteriaKey, status: evaluation.status, evidence: evaluation.evidence };
          if (evaluation.status !== 'unknown') {
            result.status = evaluation.status;
            result.evidence = evaluation.evidence;
            changed = true;
          }
        }

        if (changed) {
          item.status = this.classify(task, item.results, item.latestTrace);
          item.suggestedStatus = this.suggestedStatus(item.status);
        }
      }

      this.saveLlmCheckCache(llmCheckCache);

      // Divergence: candidates are non-complete, non-blocked items with at
      // least one failing structural criterion.
      const cache = this.loadDivergenceCache();
      let llmBudget = MAX_DIVERGENCE_LLM_CALLS;

      for (const item of items) {
        if (item.status === 'complete' || item.status === 'blocked') continue;
        const failingStructural = item.results.filter(r => r.status === 'fail' && structuralFailTypes.has(r.type));
        if (failingStructural.length === 0) continue;

        const task = taskById.get(item.taskId);
        const criteriaKey = criteriaSignature(task?.acceptanceCriteria || []);
        const cached = cache[item.taskId];

        // Reuse the cached decision when the commit and criteria are unchanged.
        if (cached && cached.commitHash === commit && cached.criteriaKey === criteriaKey) {
          if (cached.diverged) { item.status = 'diverged'; item.suggestedStatus = this.suggestedStatus('diverged'); }
          continue;
        }

        if (llmBudget <= 0) { deferred++; continue; }
        llmBudget--;
        llmEvaluated++;
        const diverged = task ? await this.classifyDivergence(client, task, failingStructural) : null;
        if (diverged === null) continue; // call failed; leave deterministic status
        cache[item.taskId] = { commitHash: commit, criteriaKey, diverged };
        if (diverged) { item.status = 'diverged'; item.suggestedStatus = this.suggestedStatus('diverged'); }
      }

      this.saveDivergenceCache(cache);
    }

    const summary: Record<DriftClassification, number> = {
      complete: 0,
      in_progress: 0,
      not_started: 0,
      diverged: 0,
      needs_review: 0,
      blocked: 0
    };
    for (const item of items) summary[item.status]++;

    const report: DriftReport = {
      generatedAt: new Date().toISOString(),
      summary,
      items,
      deferred,
      llmEvaluated
    };

    const sessionTasks = session.tasks || [];
    session.tasks = sessionTasks.map(task => {
      const item = items.find(result => result.taskId === task.id);
      return item ? { ...task, driftStatus: item.status, category: task.category || inferCategory(task.title) } : task;
    });
    await this.chatDb.saveSession(session);

    return report;
  }

  private workspacePath(): string {
    return path.join(kryleosDir(this.workspaceRoot), 'plan-workspace.json');
  }

  public getWorkspaceItems(): PlanWorkspaceItem[] {
    const file = this.workspacePath();
    if (!fs.existsSync(file)) return [];
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as PlanWorkspaceItem[];
    } catch {
      return [];
    }
  }

  public saveWorkspaceItems(items: PlanWorkspaceItem[]): void {
    const file = this.workspacePath();
    fs.writeFileSync(file, JSON.stringify(items, null, 2), 'utf-8');
  }

  // Model-driven plan workspace item extraction from scratchbook messages
  public async extractWorkspaceItems(
    client: TraceExtractionClient,
    messages: Message[]
  ): Promise<PlanWorkspaceItem[]> {
    const userPrompt = [
      `Analyze the conversation history between the user and assistant and extract concrete plan items.`,
      `Each item should represent a scoped task, feature, or refinement proposed or agreed on in the conversation.`,
      ``,
      `Respond with ONLY a JSON object wrapped in <json></json> tags matching this schema:`,
      `<json>`,
      `{`,
      `  "items": [`,
      `    {`,
      `      "title": "<Concise, descriptive name, e.g. Implement JWT Auth>",`,
      `      "description": "<Clear 2-3 sentence summary of what needs to be done>",`,
      `      "category": "frontend|backend|testing|security|docs|infra",`,
      `      "context": "<Short excerpt or summary of the chat context that prompted this item>"`,
      `    }`,
      `  ]`,
      `}`,
      `</json>`,
      `If no concrete tasks/features are proposed in the conversation, return an empty array.`
    ].join('\n');

    const filteredHistory = messages.filter(m => m.role === 'user' || m.role === 'assistant');
    const extractionMessages: Message[] = [
      {
        role: 'system',
        content: 'You are a product manager and system architect. You extract structured plan items from a developer chat. You report strictly in JSON.'
      },
      ...filteredHistory,
      { role: 'user', content: userPrompt }
    ];

    try {
      const raw = await collectCompletion(client, extractionMessages);
      const parsed = parseTolerantJson(raw) as { items?: Array<{ title?: unknown; description?: unknown; category?: unknown; context?: unknown }> } | null;
      if (!parsed || !Array.isArray(parsed.items)) return [];

      const allowedCategories = new Set(['frontend', 'backend', 'testing', 'security', 'docs', 'infra']);
      
      return parsed.items
        .filter(item => typeof item.title === 'string' && typeof item.description === 'string' && item.title.trim() && item.description.trim())
        .map((item, idx) => {
          const cat = (typeof item.category === 'string' && allowedCategories.has(item.category.toLowerCase()))
            ? (item.category.toLowerCase() as any)
            : 'frontend';
          return {
            id: `item_${Date.now()}_${idx}`,
            title: (item.title as string).trim(),
            description: (item.description as string).trim(),
            category: cat,
            status: 'draft' as const,
            context: typeof item.context === 'string' ? (item.context as string).trim() : undefined
          };
        });
    } catch (err) {
      console.error('Failed to extract workspace items:', err);
      return [];
    }
  }

  // Model-driven feasibility check against project description and FLOW tasks
  public async checkFeasibility(
    client: TraceExtractionClient,
    projectDescription: string,
    title: string,
    description: string,
    category: string
  ): Promise<{ verdict: 'feasible' | 'needs_clarification' | 'potential_conflict'; reason: string }> {
    const flowSession = await this.getFlowSession();
    const flowTasks = flowSession.tasks || [];

    const userPrompt = [
      `Assess whether the proposed plan workspace item is feasible, needs clarification, or has a potential conflict.`,
      `Evaluate it against the existing project description and the tasks currently on the FLOW board.`,
      ``,
      `PROJECT DESCRIPTION:`,
      projectDescription || '(No description provided)',
      ``,
      `CURRENT FLOW BOARD TASKS:`,
      flowTasks.map(t => `- [${t.status}] ${t.title} (${t.category || 'general'})`).join('\n') || '(No tasks on the board yet)',
      ``,
      `PROPOSED PLAN ITEM TO ASSESS:`,
      `Title: ${title}`,
      `Description: ${description}`,
      `Category: ${category}`,
      ``,
      `Respond with ONLY a JSON object wrapped in <json></json>:`,
      `<json>`,
      `{`,
      `  "verdict": "feasible|needs_clarification|potential_conflict",`,
      `  "reason": "<one concise sentence explaining the verdict>"`,
      `}`,
      `</json>`
    ].join('\n');

    const messages: Message[] = [
      {
        role: 'system',
        content: 'You are a technical feasibility reviewer. You assess plan items and report strictly in JSON.'
      },
      { role: 'user', content: userPrompt }
    ];

    const fallback = { verdict: 'feasible' as const, reason: 'Feasible (assessed deterministically).' };

    try {
      const raw = await collectCompletion(client, messages);
      const parsed = parseTolerantJson(raw) as { verdict?: unknown; reason?: unknown } | null;
      if (!parsed || typeof parsed.verdict !== 'string' || typeof parsed.reason !== 'string') return fallback;
      const verdict = parsed.verdict.toLowerCase();
      if (verdict === 'feasible' || verdict === 'needs_clarification' || verdict === 'potential_conflict') {
        return {
          verdict: verdict as any,
          reason: parsed.reason.trim()
        };
      }
      return fallback;
    } catch {
      return fallback;
    }
  }
}
