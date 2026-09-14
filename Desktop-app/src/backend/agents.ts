import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceSandbox } from './tools';
import { type Message } from './deepseek';
import { ChatDatabase } from './db';
import { recordDecisionSync } from './decisionMemory';

export interface ChatClient {
  model?: string;
  chatStream(
    messages: Message[],
    callbacks: {
      onReasoningChunk?: (chunk: string) => void;
      onContentChunk?: (chunk: string) => void;
      onComplete?: (fullContent: string, fullReasoning: string) => void;
      onError?: (err: Error) => void;
    }
  ): Promise<void>;
}

export type AgentRole = 'coordinator' | 'developer' | 'researcher' | 'debugger';
export type ResponseMode = 'balanced' | 'concise' | 'critical' | 'brutal_audit' | 'minimal_context' | 'docs_heavy' | 'code_only';

export interface AgentAction {
  type: 'delegate' | 'tool' | 'respond' | 'spawn_agent';
  agent?: AgentRole;
  tool?: 'readFile' | 'writeFile' | 'modifyFile' | 'listDir' | 'grepSearch' | 'runCommand' | 'recordDecision';
  arguments?: any;
  plan?: string[];
  message?: string;
  role?: string;
  prompt?: string;
  task?: string;
}

export interface AgentLog {
  timestamp: string;
  sender: string;
  recipient: string;
  message: string;
  type: 'info' | 'thought' | 'action' | 'result' | 'error';
}

export type CommandApprovalDecision = 'approved' | 'rejected' | 'aborted' | 'stale';

export class AgentOrchestrator {
  private readonly workspaceConfigDirs = ['.kryleos', '.matrix'];
  private sandbox: WorkspaceSandbox;
  private client: ChatClient;
  private chatDb = new ChatDatabase();
  private sessionId: string | null = null;
  private space: 'code' | 'cowork' | 'project' = 'code';
  private coordinatorHistory: Message[] = [];
  private maxSteps = 15;
  private stepCount = 0;
  private historyCompressed = false;
  private runFailed = false;
  private runAborted = false;

  private onUpdate: (data: {
    logs: AgentLog[];
    checklist: string[];
    activeAgent: AgentRole | 'system';
    isStreaming: boolean;
    streamingReasoning?: string;
    streamingContent?: string;
    localSkills?: Array<{ name: string; type: 'script' | 'markdown'; content: string }>;
    localAgents?: Array<{ name: string; role: string; prompt: string }>;
  }) => void;

  private logs: AgentLog[] = [];
  private checklist: string[] = [];
  private activeAgent: AgentRole | 'system' = 'system';
  private spawnDepth = 0;
  private customAgentsList: Array<{ name: string; role: string; prompt: string }> = [];
  private customInstructions: string = '';
  private responseMode: ResponseMode = 'balanced';
  private workspaceInstructions: string = '';
  // True when the active model is a local/Ollama model — triggers stricter,
  // example-led tool-call prompting since small local models follow loose specs poorly.
  private localModel: boolean = false;
  private localAgentsList: Array<{ name: string; role: string; prompt: string }> = [];
  private localSkillsList: Array<{ name: string; type: 'script' | 'markdown'; content: string; path: string }> = [];

  // Usability & Control properties
  public isAborted = false;
  // Phase 5.4: lets companionHub refuse a remote START_FORGE_RUN while a run
  // is already in progress for this session, rather than queuing or stomping.
  public isRunning = false;
  public commandPendingApproval: { tool: string; args: any; resolve: (decision: CommandApprovalDecision) => void } | null = null;
  public onCommandApprovalRequired: ((tool: string, command: string) => void) | null = null;
  public pendingCommandId: string | null = null;
  public pendingCommandText: string | null = null;
  // Phase 5.6: set by whoever resolves commandPendingApproval (server.ts for
  // local UI actions, companionHub for signed remote ones) immediately before
  // calling resolve(), so the command_approvals.json entry can record who
  // made the call. Defaults to local/no-device if never set (e.g. an
  // approval resolved as 'aborted' by abortExecution without going through
  // either path).
  public pendingApprovalSource: { source: 'local' | 'remote'; deviceId?: string } | null = null;
  public fastClient?: ChatClient;

  constructor(
    sandbox: WorkspaceSandbox,
    client: ChatClient,
    onUpdate: (data: any) => void,
    fastClient?: ChatClient
  ) {
    this.sandbox = sandbox;
    this.client = client;
    this.onUpdate = onUpdate;
    this.fastClient = fastClient;
  }

  public setFastClient(fastClient?: ChatClient) {
    this.fastClient = fastClient;
  }

  public roleClients: Map<string, ChatClient> = new Map();

  public setRoleClient(role: string, client: ChatClient) {
    this.roleClients.set(role, client);
  }

  public setRoleClients(clients: Record<string, ChatClient>) {
    for (const [r, c] of Object.entries(clients)) {
      if (c) this.roleClients.set(r, c);
    }
  }

  public setCustomAgents(agents: Array<{ name: string; role: string; prompt: string }>) {
    this.customAgentsList = agents || [];
  }

  public setCustomInstructions(instructions: string) {
    this.customInstructions = instructions || '';
  }

  public setLocalModel(isLocal: boolean) {
    this.localModel = Boolean(isLocal);
  }

  // Deterministic command-approval smoke path: runs a fixed command through the
  // real approval + sandbox-exec flow with no model/agent involved. For repeatable
  // QA of the command-approval modal (e.g. from the VS Code extension).
  public async runCommandWithApproval(command: string): Promise<string> {
    return this.executeTool('runCommand', { command });
  }

  public setResponseMode(mode: ResponseMode) {
    const allowed: ResponseMode[] = ['balanced', 'concise', 'critical', 'brutal_audit', 'minimal_context', 'docs_heavy', 'code_only'];
    this.responseMode = allowed.includes(mode) ? mode : 'balanced';
  }

  public getResponseModeInstructions(): string {
    switch (this.responseMode) {
      case 'concise':
        return 'RESPONSE MODE: Concise. Minimize token use. Answer directly, omit filler, avoid repeated context, and include only the details required to act.';
      case 'critical':
        return 'RESPONSE MODE: Critical Reviewer. Be direct and skeptical. Call out mistakes, risky assumptions, missing evidence, and weak plans clearly while staying professional.';
      case 'brutal_audit':
        return 'RESPONSE MODE: Brutal Audit. Be blunt, terse, and highly critical. Prioritize risks, defects, contradictions, and false claims before praise. Do not soften serious issues.';
      case 'minimal_context':
        return 'RESPONSE MODE: Minimal Context. Prioritize brevity and speed. Exclude non-essential historical chat logs or code files, and focus strictly on the immediate query.';
      case 'docs_heavy':
        return 'RESPONSE MODE: Docs-Heavy. Prioritize clear, detailed comments, docstrings (JSDoc/Python docstrings), codebase explanation files, and user documentation.';
      case 'code_only':
        return 'RESPONSE MODE: Code-Only. Output strictly raw code blocks and files with minimal conversational wrapper text. Put explanatory notes inside the code comments.';
      default:
        return 'RESPONSE MODE: Balanced. Be clear, useful, and appropriately concise.';
    }
  }

  public abortExecution(): number {
    this.isAborted = true;
    this.isRunning = false;

    if (this.commandPendingApproval) {
      const commandText = this.pendingCommandText || this.commandPendingApproval.args?.command || 'pending command';
      this.addLog('SYSTEM', 'user', `WORKFLOW ABORTED: pending command was cancelled before execution.\nCommand: ${commandText}`, 'error');
      this.commandPendingApproval.resolve('aborted');
      this.commandPendingApproval = null;
    }
    this.pendingCommandId = null;
    this.pendingCommandText = null;

    return this.sandbox.killActiveProcesses();
  }

  private async loadLocalAgentsAndSkills(): Promise<void> {
    this.localAgentsList = [];
    this.localSkillsList = [];

    const seenAgentRoles = new Set<string>();
    const seenSkillNames = new Set<string>();

    // Scan new Kryleos workspace folders first, then legacy folders for migration compatibility.
    for (const configDir of this.workspaceConfigDirs) {
      try {
        const files = await this.sandbox.listDir(`${configDir}/agents`);
      for (const file of files) {
        if (file.isDirectory) continue;
        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith('.json')) {
          try {
            const raw = await this.sandbox.readFile(`${configDir}/agents/${file.name}`);
            const data = JSON.parse(raw);
            if (data.name && data.role && data.prompt && !seenAgentRoles.has(data.role.toLowerCase())) {
              seenAgentRoles.add(data.role.toLowerCase());
              this.localAgentsList.push({
                name: data.name,
                role: data.role.toLowerCase(),
                prompt: data.prompt
              });
            }
          } catch {}
        } else if (lowerName.endsWith('.md')) {
          try {
            const content = await this.sandbox.readFile(`${configDir}/agents/${file.name}`);
            const role = file.name.slice(0, -3).toLowerCase();
            const name = file.name.slice(0, -3);
            if (content.trim() && !seenAgentRoles.has(role)) {
              seenAgentRoles.add(role);
              this.localAgentsList.push({
                name: name,
                role: role,
                prompt: content.trim()
              });
            }
          } catch {}
        }
      }
      } catch {}
    }

    // Scan skills
    for (const configDir of this.workspaceConfigDirs) {
      try {
        const files = await this.sandbox.listDir(`${configDir}/skills`);
      for (const file of files) {
        if (file.isDirectory) continue;
        const lowerName = file.name.toLowerCase();
        const skillName = file.name.replace(/\.(js|ts|md)$/i, '');
        if (seenSkillNames.has(skillName)) continue;
        if (lowerName.endsWith('.js') || lowerName.endsWith('.ts')) {
          try {
            const content = await this.sandbox.readFile(`${configDir}/skills/${file.name}`);
            seenSkillNames.add(skillName);
            this.localSkillsList.push({
              name: skillName,
              type: 'script',
              content: content,
              path: `${configDir}/skills/${file.name}`
            });
          } catch {}
        } else if (lowerName.endsWith('.md')) {
          try {
            const content = await this.sandbox.readFile(`${configDir}/skills/${file.name}`);
            seenSkillNames.add(skillName);
            this.localSkillsList.push({
              name: skillName,
              type: 'markdown',
              content: content,
              path: `${configDir}/skills/${file.name}`
            });
          } catch {}
        }
      }
      } catch {}
    }
  }

  private async saveToDatabase() {
    if (!this.sessionId) return;
    try {
      const firstUserLog = this.logs.find(l => l.sender === 'user' && l.type === 'info');
      const title = firstUserLog ? firstUserLog.message.slice(0, 50) : 'Active Session';
      
      await this.chatDb.saveSession({
        id: this.sessionId,
        title,
        createdAt: new Date().toISOString(),
        logs: this.logs,
        checklist: this.checklist,
        messages: this.coordinatorHistory,
        space: this.space
      });
    } catch (err) {
      console.error('Failed to save chat session:', err);
    }
  }

  public addLog(sender: string, recipient: string, message: string, type: 'info' | 'thought' | 'action' | 'result' | 'error') {
    const log: AgentLog = {
      timestamp: new Date().toLocaleTimeString(),
      sender,
      recipient,
      message,
      type
    };
    this.logs.push(log);
    this.broadcastUpdate(false);
    this.saveToDatabase();
  }

  private broadcastUpdate(isStreaming: boolean, streamingReasoning?: string, streamingContent?: string) {
    this.onUpdate({
      logs: this.logs,
      checklist: this.checklist,
      activeAgent: this.activeAgent,
      isStreaming,
      streamingReasoning,
      streamingContent,
      localSkills: this.localSkillsList,
      localAgents: this.localAgentsList
    });
  }

  public getLogs(): AgentLog[] {
    return this.logs;
  }

  // System Prompts for each specialist agent
  private getSystemPrompt(role: AgentRole): string {
    const commonInstructions = `
You are part of the Kryleos Forge multi-agent coding team operating in a local sandboxed workspace.
The workspace directory is: "${this.sandbox.getWorkspaceRoot()}". All paths you work with should be relative to this directory.
Always maintain high-quality coding practices, clean formatting, and write fully implemented code (do not use placeholders or comments like "todo: implement here").
${this.customInstructions ? `\nUSER SPECIFIC CUSTOM INSTRUCTIONS:\n${this.customInstructions}\n` : ''}
${this.workspaceInstructions ? `\nWORKSPACE SPECIFIC INSTRUCTIONS:\n${this.workspaceInstructions}\n` : ''}
${this.getResponseModeInstructions()}
`;

    switch (role) {
      case 'coordinator':
        const allCustomAgents = [...this.customAgentsList, ...this.localAgentsList];
        const customAgentsText = allCustomAgents.length > 0 
          ? `\nREGISTERED CUSTOM SAVED AGENTS (delegate to them setting "type": "delegate" and "agent" to the custom agent's role):\n${allCustomAgents.map(a => `- Role: "${a.role}" (Name: "${a.name}"): ${a.prompt}`).join('\n')}`
          : '';

        const allowedTools = ["readFile", "writeFile", "modifyFile", "listDir", "grepSearch", "runCommand", ...this.localSkillsList.map(s => s.name)];
        const allowedToolsText = allowedTools.map(t => `"${t}"`).join(" | ");

        const customSkillsText = this.localSkillsList.length > 0
          ? `\nDYNAMIC WORKSPACE SKILLS (call them using type="tool" and setting "tool" to the skill's name):\n${this.localSkillsList.map(s => `- Tool: "${s.name}" (${s.type === 'script' ? 'custom executable script' : 'markdown guidelines/procedures'}). Arguments object keys are custom, specific to the skill's requirements.`).join('\n')}`
          : '';

        return `
${commonInstructions}
ROLE: COORDINATOR (THE PLANNER)
You are the central brain of this multi-agent system. Your job is to orchestrate the solution to the user's coding request.
You do not edit files or run commands directly. Instead, you delegate tasks to specialist agents, spawn dynamic single-use agents, or call workspace tools.

YOUR SPECIALISTS:
1. developer: Best at writing code, editing files, and creating new files.
2. researcher: Best at reading files, listing directories, and searching (grep) the codebase.
3. debugger: Best at running test commands, analyzing error messages, and checking compilations.
${customAgentsText}

${customSkillsText}

HOW TO RESPOND:
You MUST structure your response. First, think step-by-step.
Then, you MUST output a single XML-style action block containing a valid JSON object.
Format:
<action>
{
  "type": "delegate" | "tool" | "respond" | "spawn_agent",
  "agent": "developer" | "researcher" | "debugger" | "[custom_agent_role]",
  "tool": ${allowedToolsText},
  "arguments": { ... },
  "plan": ["step 1", "step 2", "step 3"],
  "message": "User-facing message or message to the specialist",
  "role": "dynamic_agent_unique_role",
  "prompt": "Dynamic agent prompt detailing its custom rules/expert instruction...",
  "task": "Specific subset of the task for the spawned agent to do..."
}
</action>

GUIDELINES:
- Set type="delegate" to ask a standard or custom saved agent to perform a task.
- Set type="tool" to run a tool directly.
- Set type="respond" when the goal is achieved or you need direct user input.
- Set type="spawn_agent" to dynamically create a single-use micro-agent. You MUST specify a "role" name, "prompt" (its persona), and "task" (its goal). Use this when none of the standard agents or saved custom agents match a highly specific problem (e.g., SVG generator, SQLite query optimizer, raw data parser).
- Keep "plan" updated with progress.

CRITICAL OUTPUT RULES:
- Emit EXACTLY ONE action per turn, wrapped in <action></action> tags. Put nothing after </action>.
- When the task needs a shell command, file edit, or search, you MUST emit a "tool" (or "delegate") action — do NOT describe the answer in prose instead of acting.
- To run a shell command, copy this shape exactly:
<action>
{"type":"tool","tool":"runCommand","arguments":{"command":"node -v"},"message":"checking node version"}
</action>
${this.localModel ? `
LOCAL MODEL MODE (strict): You are running on a local model. Follow these rules literally:
- Output ONLY the <action> block. No reasoning prose before or after it.
- Never answer a command/tool request from memory — always call the tool.
- Use double quotes for all JSON keys and string values. No trailing commas. No comments.
- If asked to run a command, respond with a single runCommand action exactly like the example above.
` : ''}`;

      case 'developer':
        return `
${commonInstructions}
ROLE: DEVELOPER (THE BUILDER)
You are a specialist in writing and editing code. Your goal is to implement features or fixes requested by the Coordinator.
You have access to tools: readFile, writeFile, modifyFile.
For edits, prefer modifyFile (search-and-replace) for existing files. Make sure TargetContent is unique and exact.
Provide a clear explanation of what you changed.
Always respond to the Coordinator in a normal, direct markdown summary explaining what you did, and include code snippets if helpful.
`;

      case 'researcher':
        return `
${commonInstructions}
ROLE: RESEARCHER (THE ANALYST)
You are a specialist in searching and reading code. Your goal is to scan directories, locate files, find patterns, and read contents as requested by the Coordinator.
You have access to tools: listDir, readFile, grepSearch.
Scan files carefully to answer questions about architecture, usage, or dependencies.
Always respond to the Coordinator with a clean summary of your findings.
`;

      case 'debugger':
        return `
${commonInstructions}
ROLE: DEBUGGER (THE REVIEWER)
You are a specialist in testing, compilation checks, and analyzing diagnostics. Your goal is to run commands, inspect logs, and debug errors as requested by the Coordinator.
You have access to tools: runCommand, readFile.
Execute the compilation or testing command, analyze stdout/stderr, and report back if there are errors, detailing what they are and where.
`;
    }
  }

  // Orchestrator entry point
  public async handleUserQuery(userQuery: string, existingSessionId?: string, space: 'code' | 'cowork' | 'project' = 'code', displayQuery?: string) {
    this.stepCount = 0;
    this.historyCompressed = false;
    this.runFailed = false;
    this.runAborted = false;
    this.space = space;

    // Load custom local agents and skills from Kryleos workspace folders.
    await this.loadLocalAgentsAndSkills();

    // Load workspace rule files if they exist
    this.workspaceInstructions = '';
    const ruleFiles = ['.matrixcode.json', 'CLAUDE.md', '.clauderc', 'INSTRUCTIONS.md', '.cursorrules', '.cursor/rules'];
    for (const file of ruleFiles) {
      try {
        const content = await this.sandbox.readFile(file);
        if (content && content.trim()) {
          this.workspaceInstructions += `\n[INSTRUCTIONS FROM LOCAL WORKSPACE FILE ${file}]:\n${content}\n`;
        }
      } catch {
        // file doesn't exist
      }
    }

    // Load cross-card architectural decisions if present (Phase 9a)
    try {
      const decisions = await this.sandbox.readFile('.kryleos/decisions.md');
      if (decisions && decisions.trim()) {
        this.workspaceInstructions += `\n=== CROSS-CARD ARCHITECTURAL DECISIONS (.kryleos/decisions.md) ===\n${decisions.trim()}\n==================================================================\n`;
      }
    } catch {
      // file doesn't exist
    }

    if (this.space === 'cowork') {
      try {
        const workspaceFile = '.kryleos/plan-workspace.json';
        const raw = await this.sandbox.readFile(workspaceFile);
        const items = JSON.parse(raw);
        if (Array.isArray(items)) {
          const readyItems = items.filter(it => it.status === 'ready_for_crew');
          if (readyItems.length > 0) {
            this.workspaceInstructions += `\n=== PLAN WORKSPACE ITEMS STAGED FOR REVIEW ===\n`;
            readyItems.forEach((it, idx) => {
              this.workspaceInstructions += `${idx + 1}. Title: ${it.title}\n   Category: ${it.category}\n   Description: ${it.description}\n`;
              if (it.context) {
                this.workspaceInstructions += `   Origin context: ${it.context}\n`;
              }
            });
            this.workspaceInstructions += `==============================================\n`;
          }
        }
      } catch {
        // file doesn't exist or is empty
      }
    }

    if (existingSessionId) {
      this.sessionId = existingSessionId;
      const existing = await this.chatDb.getSession(existingSessionId);
      if (existing) {
        this.logs = existing.logs;
        this.checklist = existing.checklist;
        this.coordinatorHistory = existing.messages || [
          { role: 'system', content: this.getSystemPrompt('coordinator') }
        ];
      } else {
        this.logs = [];
        this.checklist = ['[ ] Analyze user request'];
        this.coordinatorHistory = [
          { role: 'system', content: this.getSystemPrompt('coordinator') }
        ];
      }
    } else {
      this.sessionId = `session_${Date.now()}`;
      this.logs = [];
      this.checklist = ['[ ] Analyze user request'];
      this.coordinatorHistory = [
        { role: 'system', content: this.getSystemPrompt('coordinator') }
      ];
    }

    this.addLog('user', 'coordinator', displayQuery || userQuery, 'info');
    
    // Append user request
    this.coordinatorHistory.push({ role: 'user', content: `USER REQUEST: ${userQuery}` });

    let loop = true;
    this.isAborted = false;
    this.isRunning = true;
    
    while (loop && this.stepCount < this.maxSteps) {
      if (this.isAborted) {
        this.runAborted = true;
        this.addLog('SYSTEM', 'user', 'Workflow execution interrupted by user.', 'error');
        break;
      }
      this.stepCount++;
      this.activeAgent = 'coordinator';
      this.addLog('SYSTEM', 'coordinator', `Orchestrator step ${this.stepCount}/${this.maxSteps}...`, 'info');

      // Compress if needed
      await this.compressHistoryIfNeeded();

      // Call Coordinator
      let coordContent = '';
      let coordReasoning = '';

      const coordClient = this.roleClients.get('reasoning') || this.roleClients.get('coordinator') || this.client;
      try {
        await coordClient.chatStream(this.coordinatorHistory, {
          onReasoningChunk: (chunk) => {
            if (this.isAborted) return;
            coordReasoning += chunk;
            this.broadcastUpdate(true, coordReasoning, coordContent);
          },
          onContentChunk: (chunk) => {
            if (this.isAborted) return;
            coordContent += chunk;
            this.broadcastUpdate(true, coordReasoning, coordContent);
          },
          onComplete: (content, reasoning) => {
            if (this.isAborted) return;
            coordContent = content;
            coordReasoning = reasoning;
          },
          onError: (err) => {
            throw err;
          }
        });
      } catch (err: any) {
        this.runFailed = true;
        this.addLog('coordinator', 'SYSTEM', `LLM Query Error: ${err.message}`, 'error');
        this.activeAgent = 'system';
        this.isRunning = false;
        this.broadcastUpdate(false);
        return;
      }

      if (this.isAborted) {
        this.runAborted = true;
        this.addLog('SYSTEM', 'user', 'Workflow execution interrupted by user.', 'error');
        break;
      }

      this.activeAgent = 'system';
      this.broadcastUpdate(false);

      if (coordReasoning) {
        this.addLog('coordinator', 'thought', coordReasoning, 'thought');
      }

      // Parse Coordinator Action
      const action = this.parseActionBlock(coordContent);
      if (!action) {
        // Fallback: if coordinator responded with text but no action tag, treat it as respond
        this.addLog('coordinator', 'user', coordContent, 'action');
        this.addLog('SYSTEM', 'user', `Final Coordinator response: ${coordContent}`, 'info');
        this.coordinatorHistory.push({ role: 'assistant', content: coordContent });
        break;
      }

      // Update plan/checklist if provided
      if (action.plan && action.plan.length > 0) {
        this.checklist = action.plan;
        this.broadcastUpdate(false);
      }

      this.addLog('coordinator', action.agent || action.tool || 'user', 
        `Action: ${action.type.toUpperCase()}${action.tool ? ` (${action.tool})` : ''}${action.agent ? ` -> ${action.agent}` : ''}\nMessage: ${action.message || ''}`, 
        'action'
      );

      // Execute Action
      if (action.type === 'respond') {
        this.addLog('coordinator', 'user', action.message || coordContent, 'action');
        this.coordinatorHistory.push({ role: 'assistant', content: coordContent });
        loop = false;
      } else if (action.type === 'tool') {
        const toolResult = await this.executeTool(action.tool!, action.arguments);
        this.addLog(action.tool!, 'coordinator', toolResult, 'result');
        this.coordinatorHistory.push({ role: 'assistant', content: coordContent });
        this.coordinatorHistory.push({ role: 'user', content: `TOOL RESULT (${action.tool}):\n${toolResult}` });

        // Trigger failsafe compilation check if file was updated
        if (action.tool === 'writeFile' || action.tool === 'modifyFile') {
          await this.runFailsafeCompilationCheck();
        }
      } else if (action.type === 'delegate') {
        const specialistResponse = await this.invokeSpecialist(action.agent!, action.message || '');
        this.addLog(action.agent!, 'coordinator', specialistResponse, 'result');
        this.coordinatorHistory.push({ role: 'assistant', content: coordContent });
        this.coordinatorHistory.push({ role: 'user', content: `SPECIALIST RESPONSE (${action.agent}):\n${specialistResponse}` });

        // Trigger compile check after developer delegation
        if (action.agent === 'developer') {
          await this.runFailsafeCompilationCheck();
        }
      } else if (action.type === 'spawn_agent') {
        if (this.spawnDepth >= 1) {
          const depthErr = 'Error: Maximum subagent spawning depth exceeded. Spawning custom subagents inside another subagent is forbidden.';
          this.addLog('SYSTEM', 'coordinator', depthErr, 'error');
          this.coordinatorHistory.push({ role: 'assistant', content: coordContent });
          this.coordinatorHistory.push({ role: 'user', content: `SPAWN_AGENT RESULT:\n${depthErr}` });
        } else {
          this.spawnDepth++;
          const spawnedResponse = await this.invokeSpawnedAgent(action.role || 'dynamic_agent', action.prompt || 'You are a helpful assistant.', action.task || '');
          this.spawnDepth--;
          this.addLog(action.role || 'dynamic_agent', 'coordinator', spawnedResponse, 'result');
          this.coordinatorHistory.push({ role: 'assistant', content: coordContent });
          this.coordinatorHistory.push({ role: 'user', content: `SPAWNED AGENT RESPONSE (${action.role}):\n${spawnedResponse}` });
        }
      }
    }

    // Final Sentinel verification check
    await this.runFailsafeCompilationCheck();

    if (this.stepCount >= this.maxSteps) {
      this.addLog('SYSTEM', 'user', 'Max iteration steps reached. Stopping coordination loop.', 'error');
    }

    this.activeAgent = 'system';
    this.isRunning = false;
    this.broadcastUpdate(false);
  }

  public getRunState(): { incomplete: boolean; reason?: string } {
    const reasons: string[] = [];
    if (this.stepCount >= this.maxSteps) reasons.push(`maximum ${this.maxSteps} orchestration steps reached`);
    if (this.historyCompressed) reasons.push('history compression was required');
    if (this.lastSentinelResult && !this.lastSentinelResult.passed) {
      reasons.push(`Sentinel verification check failed after ${this.lastSentinelResult.attempts} attempt(s)`);
    }
    if (this.runAborted) reasons.push('run was stopped before completion');
    if (this.runFailed) reasons.push('model or orchestration error interrupted the run');
    return reasons.length > 0 ? { incomplete: true, reason: reasons.join('; ') } : { incomplete: false };
  }

  // Extract the first brace-balanced JSON object containing a "type" key.
  // Used as a fallback for local models that emit bare JSON without an <action> tag.
  private extractBalancedJsonWithType(text: string): string | null {
    for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
      let depth = 0;
      let inStr = false;
      let escaped = false;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            const candidate = text.slice(start, i + 1);
            if (/"type"\s*:/.test(candidate)) return candidate;
            break; // this object lacks "type"; try the next opening brace
          }
        }
      }
    }
    return null;
  }

  // Parse a coordinator action. Prefers an <action>...</action> block, then a
  // ```json fenced block, then bare JSON — tolerating loose local-model output.
  private parseActionBlock(text: string): AgentAction | null {
    let rawJson: string | null = null;

    const tagMatch = text.match(/<action>([\s\S]*?)<\/action>/i);
    if (tagMatch) {
      rawJson = tagMatch[1].trim();
    } else {
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenceMatch && /"type"\s*:/.test(fenceMatch[1])) {
        rawJson = fenceMatch[1].trim();
      } else {
        rawJson = this.extractBalancedJsonWithType(text);
      }
    }

    if (!rawJson) return null;

    try {
      return JSON.parse(rawJson) as AgentAction;
    } catch (err) {
      // Lenient regex parsing fallback for handling raw newlines generated inside JSON strings
      try {
        const typeMatch = rawJson.match(/"type"\s*:\s*"([^"]+)"/i);
        const type = typeMatch ? typeMatch[1] : 'respond';
        
        const messageMatch = rawJson.match(/"message"\s*:\s*"([\s\S]*?)"\s*}/) || 
                             rawJson.match(/"message"\s*:\s*"([\s\S]*?)"\s*(,\s*"|$)/) ||
                             rawJson.match(/"message"\s*:\s*"([\s\S]*?)"/);
        const message = messageMatch ? messageMatch[1] : '';

        const planMatch = rawJson.match(/"plan"\s*:\s*\[([\s\S]*?)\]/i);
        const plan = planMatch 
          ? planMatch[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')) 
          : [];

        const toolMatch = rawJson.match(/"tool"\s*:\s*"([^"]+)"/i);
        const tool = toolMatch ? toolMatch[1] : undefined;

        const argsMatch = rawJson.match(/"arguments"\s*:\s*({[\s\S]*?})/);
        let parsedArgs = {};
        if (argsMatch) {
          try {
            parsedArgs = JSON.parse(argsMatch[1]);
          } catch {}
        }

        return {
          type: type as any,
          tool: tool as any,
          arguments: parsedArgs,
          plan: plan,
          message: message
        };
      } catch (fallbackErr) {
        this.addLog('SYSTEM', 'coordinator', `Failed to parse action JSON: ${rawJson}`, 'error');
        return null;
      }
    }
  }

  // Execute tool calls in sandbox
  private async executeTool(tool: string, args: any): Promise<string> {
    try {
      switch (tool) {
        case 'readFile':
          if (!args.path) return 'Error: Missing path argument';
          const fileContent = await this.sandbox.readFile(args.path);
          return `File contents of "${args.path}":\n\`\`\`\n${fileContent}\n\`\`\``;
        
        case 'writeFile':
          if (!args.path || args.content === undefined) return 'Error: Missing path or content argument';
          await this.sandbox.writeFile(args.path, args.content);
          return `Successfully wrote file "${args.path}"`;
        
        case 'modifyFile':
          if (!args.path || !args.targetContent || !args.replacementContent) {
            return 'Error: Missing path, targetContent, or replacementContent arguments';
          }
          const modResult = await this.sandbox.modifyFile(args.path, args.targetContent, args.replacementContent);
          if (modResult.success) {
            return modResult.diff
              ? `${modResult.message}\n\n--- DIFF CONTENT ---\n${modResult.diff}\n--------------------`
              : modResult.message;
          } else {
            return `Modify Error: ${modResult.message}`;
          }
        
        case 'listDir':
          const items = await this.sandbox.listDir(args.path || '.');
          return `Directory listing for "${args.path || '.'}":\n${JSON.stringify(items, null, 2)}`;
        
        case 'grepSearch':
          if (!args.query) return 'Error: Missing query argument';
          const grepResult = await this.sandbox.grepSearch(args.query, args.path || '.');
          return `Grep matches for "${args.query}":\n${JSON.stringify(grepResult, null, 2)}`;
        
        case 'runCommand':
          if (!args.command) return 'Error: Missing command argument';
          
          // Request user approval before running CLI command
          if (this.onCommandApprovalRequired) {
            this.addLog('SYSTEM', 'user', `COMMAND APPROVAL REQUIRED\nCommand: ${args.command}\nStatus: waiting for explicit user approval.`, 'info');
            const decision = await new Promise<CommandApprovalDecision>((resolve) => {
              this.commandPendingApproval = {
                tool,
                args,
                resolve
              };
              this.onCommandApprovalRequired!(tool, args.command);
            });
            
            // Log decision to persistent history
            try {
              const root = this.sandbox.getWorkspaceRoot();
              const dir = path.join(root, '.kryleos');
              const filePath = path.join(dir, 'command_approvals.json');
              await fs.promises.mkdir(dir, { recursive: true });
              let logs = [];
              try {
                const existing = await fs.promises.readFile(filePath, 'utf8');
                logs = JSON.parse(existing);
              } catch {}
              const approvalSource = this.pendingApprovalSource || { source: 'local' as const };
              logs.push({
                timestamp: new Date().toISOString(),
                command: args.command,
                decision,
                source: approvalSource.source,
                deviceId: approvalSource.deviceId ?? null
              });
              await fs.promises.writeFile(filePath, JSON.stringify(logs, null, 2), 'utf8');
            } catch (err) {
              console.error('Failed to log command approval:', err);
            }

            this.pendingApprovalSource = null;
            this.commandPendingApproval = null;
            if (decision !== 'approved') {
              if (decision === 'rejected') {
                this.addLog('SYSTEM', 'coordinator', `COMMAND REJECTED BY USER\nCommand: ${args.command}\nStatus: not executed.`, 'error');
                return `Command rejected by user. Not executed: ${args.command}`;
              }
              if (decision === 'stale') {
                this.addLog('SYSTEM', 'coordinator', `STALE COMMAND APPROVAL BLOCKED\nCommand: ${args.command}\nStatus: not executed because approval did not match the active command.`, 'error');
                return `Stale command approval blocked. Not executed: ${args.command}`;
              }
              return `Workflow aborted before command execution. Not executed: ${args.command}`;
            }
            this.addLog('SYSTEM', 'coordinator', `COMMAND APPROVED BY USER\nCommand: ${args.command}\nStatus: executing now.`, 'info');
          }

          // Streaming terminal back as system info log
          const cmdResult = await this.sandbox.runCommand(args.command, 
            (stdout) => this.addLog('terminal', 'coordinator', stdout, 'info'),
            (stderr) => this.addLog('terminal', 'coordinator', stderr, 'error')
          );
          return `Command "${args.command}" completed with code ${cmdResult.code}.\nStdout summary:\n${cmdResult.stdout.slice(-1000)}\nStderr summary:\n${cmdResult.stderr}`;

        case 'recordDecision':
          if (!args.decision && !args.text) return 'Error: Missing decision argument';
          const decisionStr = args.decision || args.text;
          recordDecisionSync(this.sandbox.getWorkspaceRoot(), {
            taskId: args.taskId,
            decision: decisionStr,
            rationale: args.rationale
          });
          return `Architectural decision recorded to .kryleos/decisions.md: "${decisionStr}"`;

        default:
          const localSkill = this.localSkillsList.find(s => s.name === tool);
          if (localSkill) {
            if (localSkill.type === 'markdown') {
              return `INSTRUCTIONAL SKILL PROCEDURES FOR "${tool}":\n${localSkill.content}\n\nPlease read and execute the above guidelines using your available tools.`;
            } else {
              const tempArgsFile = `.kryleos/scratch_args_${Date.now()}.json`;
              try {
                await this.sandbox.runCommand(`node -e "require('fs').mkdirSync('.kryleos', { recursive: true })"`);
              } catch {}
              await this.sandbox.writeFile(tempArgsFile, JSON.stringify(args || {}));
              try {
                const isTs = localSkill.content.includes(':') || localSkill.content.includes('import ') || localSkill.content.includes('export ');
                const runCmd = isTs 
                  ? `npx tsx ${localSkill.path} "${tempArgsFile}"`
                  : `node ${localSkill.path} "${tempArgsFile}"`;
                
                this.addLog('SYSTEM', 'coordinator', `Executing custom script skill: ${runCmd}`, 'info');
                const runRes = await this.sandbox.runCommand(runCmd);
                
                try {
                  await this.sandbox.runCommand(`node -e "require('fs').unlinkSync('${tempArgsFile}')"`);
                } catch {}

                if (runRes.code !== 0) {
                  return `Error executing skill "${tool}" (exit code ${runRes.code}):\n${runRes.stderr || runRes.stdout}`;
                }
                return `Execution result for skill "${tool}":\n${runRes.stdout}`;
              } catch (err: any) {
                return `Failed to execute custom script skill "${tool}": ${err.message}`;
              }
            }
          }
          return `Error: Unknown tool "${tool}"`;
      }
    } catch (err: any) {
      return `Error executing tool: ${err.message}`;
    }
  }

  // Invoke a specialist agent (developer, researcher, debugger, or custom saved agent)
  private async invokeSpecialist(role: string, taskDescription: string): Promise<string> {
    this.activeAgent = role as any;
    this.addLog('coordinator', role, `Task assigned: ${taskDescription}`, 'info');

    const commonInstructions = `
You are part of the Kryleos Forge multi-agent coding team operating in a local sandboxed workspace.
The workspace directory is: "${this.sandbox.getWorkspaceRoot()}". All paths you work with should be relative to this directory.
Always maintain high-quality coding practices, clean formatting, and write fully implemented code (do not use placeholders or comments like "todo: implement here").
`;

    // Query custom agents list (UI saved and dynamic directory profiles), fallback to standard prompts
    let systemPrompt = '';
    const customAgent = this.customAgentsList.find(a => a.role === role) || this.localAgentsList.find(a => a.role === role);
    if (customAgent) {
      systemPrompt = `
${commonInstructions}
ROLE: ${customAgent.name.toUpperCase()} (CUSTOM SAVED AGENT)
${customAgent.prompt}
`;
    } else {
      systemPrompt = this.getSystemPrompt(role as AgentRole);
    }

    // Role-based model routing: check roleClients first, then fallbacks
    let clientToUse: ChatClient = this.client;
    if (this.roleClients.has(role)) {
      clientToUse = this.roleClients.get(role)!;
    } else if (role === 'developer' && this.roleClients.has('coding')) {
      clientToUse = this.roleClients.get('coding')!;
    } else if (role === 'researcher' && this.roleClients.has('research')) {
      clientToUse = this.roleClients.get('research')!;
    } else if ((role === 'scope_guard' || role === 'debugger') && (this.roleClients.has('fast') || this.fastClient)) {
      clientToUse = this.roleClients.get('fast') || this.fastClient!;
    }

    let messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `TASK ASSIGNED: ${taskDescription}` }
    ];

    // Adapter for pure reasoning models (e.g. DeepSeek Reasoner, o1) that reject system prompts
    const targetModelName = ((clientToUse as any).model || '').toLowerCase();
    if (targetModelName.includes('reasoner') || targetModelName.includes('r1') || targetModelName === 'o1') {
      messages = [
        { role: 'user', content: `[SYSTEM INSTRUCTIONS]\n${systemPrompt}\n\n[TASK ASSIGNED]\n${taskDescription}` }
      ];
    }

    let responseContent = '';
    let responseReasoning = '';

    try {
      await clientToUse.chatStream(messages, {
        onReasoningChunk: (chunk) => {
          responseReasoning += chunk;
          this.broadcastUpdate(true, responseReasoning, responseContent);
        },
        onContentChunk: (chunk) => {
          responseContent += chunk;
          this.broadcastUpdate(true, responseReasoning, responseContent);
        },
        onComplete: (content, reasoning) => {
          responseContent = content;
          responseReasoning = reasoning;
        },
        onError: (err) => {
          throw err;
        }
      });
    } catch (err: any) {
      this.addLog(role, 'coordinator', `Agent Error: ${err.message}`, 'error');
      return `Error invoking ${role}: ${err.message}`;
    }

    if (responseReasoning) {
      this.addLog(role, 'thought', responseReasoning, 'thought');
    }

    const action = this.parseActionBlock(responseContent);
    if (action && action.type === 'tool') {
      this.addLog(role, action.tool!, `Calling tool: ${action.tool} with args: ${JSON.stringify(action.arguments)}`, 'action');
      const toolResult = await this.executeTool(action.tool!, action.arguments);
      this.addLog(action.tool!, role, toolResult, 'result');

      messages.push({ role: 'assistant', content: responseContent });
      messages.push({ role: 'user', content: `TOOL RESULT (${action.tool}):\n${toolResult}` });

      responseContent = '';
      responseReasoning = '';

      await clientToUse.chatStream(messages, {
        onReasoningChunk: (chunk) => {
          responseReasoning += chunk;
          this.broadcastUpdate(true, responseReasoning, responseContent);
        },
        onContentChunk: (chunk) => {
          responseContent += chunk;
          this.broadcastUpdate(true, responseReasoning, responseContent);
        },
        onComplete: (content, reasoning) => {
          responseContent = content;
          responseReasoning = reasoning;
        }
      });

      if (responseReasoning) {
        this.addLog(role, 'thought', responseReasoning, 'thought');
      }
    }

    return responseContent;
  }

  // Spawns a dynamic, single-use agent to handle a specific subtask autonomously
  private async invokeSpawnedAgent(role: string, customSystemPrompt: string, taskDescription: string): Promise<string> {
    this.activeAgent = role as any;
    this.addLog('SYSTEM', role, `[SPAWNING AGENT] Dynamic Persona: ${role}\nGoal: ${taskDescription}`, 'info');

    const commonInstructions = `
You are a dynamically spawned single-use coding specialist in a local sandboxed workspace.
The workspace directory is: "${this.sandbox.getWorkspaceRoot()}". All paths you work with should be relative to this directory.
Always write fully implemented code.
`;

    const systemPrompt = `
${commonInstructions}
ROLE PERSONA: ${role.toUpperCase()}
${customSystemPrompt}
`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `TASK ASSIGNED: ${taskDescription}` }
    ];

    let responseContent = '';
    let responseReasoning = '';

    try {
      await this.client.chatStream(messages, {
        onReasoningChunk: (chunk) => {
          responseReasoning += chunk;
          this.broadcastUpdate(true, responseReasoning, responseContent);
        },
        onContentChunk: (chunk) => {
          responseContent += chunk;
          this.broadcastUpdate(true, responseReasoning, responseContent);
        },
        onComplete: (content, reasoning) => {
          responseContent = content;
          responseReasoning = reasoning;
        },
        onError: (err) => {
          throw err;
        }
      });
    } catch (err: any) {
      this.addLog(role, 'coordinator', `Dynamic Agent Error: ${err.message}`, 'error');
      return `Error invoking dynamic agent ${role}: ${err.message}`;
    }

    if (responseReasoning) {
      this.addLog(role, 'thought', responseReasoning, 'thought');
    }

    // Check if spawned agent requests a tool.
    const action = this.parseActionBlock(responseContent);
    if (action && action.type === 'tool') {
      this.addLog(role, action.tool!, `Calling tool: ${action.tool} with args: ${JSON.stringify(action.arguments)}`, 'action');
      const toolResult = await this.executeTool(action.tool!, action.arguments);
      this.addLog(action.tool!, role, toolResult, 'result');

      messages.push({ role: 'assistant', content: responseContent });
      messages.push({ role: 'user', content: `TOOL RESULT (${action.tool}):\n${toolResult}` });

      responseContent = '';
      responseReasoning = '';

      await this.client.chatStream(messages, {
        onReasoningChunk: (chunk) => {
          responseReasoning += chunk;
          this.broadcastUpdate(true, responseReasoning, responseContent);
        },
        onContentChunk: (chunk) => {
          responseContent += chunk;
          this.broadcastUpdate(true, responseReasoning, responseContent);
        },
        onComplete: (content, reasoning) => {
          responseContent = content;
          responseReasoning = reasoning;
        }
      });

      if (responseReasoning) {
        this.addLog(role, 'thought', responseReasoning, 'thought');
      }
    }

    return responseContent;
  }

  private inFailsafeCheck: boolean = false;
  private lastSentinelResult: {
    passed: boolean;
    attempts: number;
    compileCommand: string;
    testCommand?: string;
    testStats?: { total?: number; passed?: number; failed?: number; command: string };
    lastError?: string;
  } | null = null;

  public getSentinelResult() {
    return this.lastSentinelResult;
  }

  private parseTestOutput(command: string, stdout: string, stderr: string, code: number | null): { total?: number; passed?: number; failed?: number; command: string } {
    const text = `${stdout}\n${stderr}`;
    let passed: number | undefined;
    let failed: number | undefined;
    let total: number | undefined;

    const passMatch = text.match(/(\d+)\s+passed/i);
    if (passMatch) passed = parseInt(passMatch[1], 10);
    const failMatch = text.match(/(\d+)\s+failed/i);
    if (failMatch) failed = parseInt(failMatch[1], 10);
    const totalMatch = text.match(/Tests\s+(\d+)\s+total/i) || text.match(/\((\d+)\s+tests?\)/i);
    if (totalMatch) total = parseInt(totalMatch[1], 10);

    if (code === 0 && failed === undefined) failed = 0;
    else if (code !== 0 && failed === undefined) failed = 1;

    return { command, passed, failed, total };
  }

  private async executeCoordinatorTurn(): Promise<void> {
    let coordContent = '';
    let coordReasoning = '';

    await this.client.chatStream(this.coordinatorHistory, {
      onReasoningChunk: (chunk) => {
        if (this.isAborted) return;
        coordReasoning += chunk;
        this.broadcastUpdate(true, coordReasoning, coordContent);
      },
      onContentChunk: (chunk) => {
        if (this.isAborted) return;
        coordContent += chunk;
        this.broadcastUpdate(true, coordReasoning, coordContent);
      },
      onComplete: (content, reasoning) => {
        if (this.isAborted) return;
        coordContent = content;
        coordReasoning = reasoning;
      },
      onError: (err) => {
        throw err;
      }
    });

    if (coordReasoning) {
      this.addLog('coordinator', 'thought', coordReasoning, 'thought');
    }

    const action = this.parseActionBlock(coordContent);
    if (!action) {
      this.addLog('coordinator', 'user', coordContent, 'action');
      this.coordinatorHistory.push({ role: 'assistant', content: coordContent });
      return;
    }

    this.addLog('coordinator', action.agent || action.tool || 'user',
      `Recovery Action: ${action.type.toUpperCase()}${action.tool ? ` (${action.tool})` : ''}${action.agent ? ` -> ${action.agent}` : ''}\nMessage: ${action.message || ''}`,
      'action'
    );

    if (action.type === 'respond') {
      this.addLog('coordinator', 'user', action.message || coordContent, 'action');
      this.coordinatorHistory.push({ role: 'assistant', content: coordContent });
    } else if (action.type === 'tool') {
      const toolResult = await this.executeTool(action.tool!, action.arguments);
      this.addLog(action.tool!, 'coordinator', toolResult, 'result');
      this.coordinatorHistory.push({ role: 'assistant', content: coordContent });
      this.coordinatorHistory.push({ role: 'user', content: `TOOL RESULT (${action.tool}):\n${toolResult}` });
    } else if (action.type === 'delegate') {
      const specialistResponse = await this.invokeSpecialist(action.agent!, action.message || '');
      this.addLog(action.agent!, 'coordinator', specialistResponse, 'result');
      this.coordinatorHistory.push({ role: 'assistant', content: coordContent });
      this.coordinatorHistory.push({ role: 'user', content: `SPECIALIST RESPONSE (${action.agent}):\n${specialistResponse}` });
    }
  }

  // Anti-Hallucination reviewer failsafe check with bounded retry loop (cap at 3 attempts)
  private async runFailsafeCompilationCheck(): Promise<void> {
    if (this.inFailsafeCheck) return;
    this.inFailsafeCheck = true;

    try {
      let verifyCmd = '';
      try {
        await this.sandbox.readFile('tsconfig.json');
        verifyCmd = 'npx tsc --noEmit';
      } catch {
        verifyCmd = 'npm run build';
      }

      const testCmd = await this.sandbox.detectTestCommand();

      const MAX_ATTEMPTS = 3;
      let attempt = 1;
      let checkPassed = false;

      while (attempt <= MAX_ATTEMPTS && !checkPassed) {
        this.addLog('SYSTEM', 'sentinel', `Running Sentinel verification check (attempt ${attempt}/${MAX_ATTEMPTS})...`, 'info');

        let compilePassed = false;
        let compileErrors = '';
        try {
          const res = await this.sandbox.runCommand(verifyCmd);
          if (res.code === 0) {
            compilePassed = true;
          } else {
            compileErrors = (res.stderr || res.stdout).slice(-800);
          }
        } catch (err: any) {
          compileErrors = err.message;
        }

        let testsPassed = true;
        let testErrors = '';
        let testStats: { total?: number; passed?: number; failed?: number; command: string } | undefined = undefined;

        if (compilePassed && testCmd) {
          try {
            this.addLog('SYSTEM', 'sentinel', `Running project test suite: ${testCmd} (attempt ${attempt}/${MAX_ATTEMPTS})...`, 'info');
            const testRes = await this.sandbox.runCommand(testCmd);
            testStats = this.parseTestOutput(testCmd, testRes.stdout, testRes.stderr, testRes.code);
            if (testRes.code === 0) {
              testsPassed = true;
            } else {
              testsPassed = false;
              testErrors = (testRes.stderr || testRes.stdout).slice(-800);
            }
          } catch (tErr: any) {
            testsPassed = false;
            testErrors = tErr.message;
          }
        }

        if (compilePassed && testsPassed) {
          checkPassed = true;
          this.lastSentinelResult = {
            passed: true,
            attempts: attempt,
            compileCommand: verifyCmd,
            testCommand: testCmd || undefined,
            testStats
          };
          const testMsg = testStats ? ` | Tests: ${testStats.passed ?? 0} passed, ${testStats.failed ?? 0} failed` : '';
          this.addLog('sentinel', 'coordinator', `Integrity check passed on attempt ${attempt}/${MAX_ATTEMPTS}. Code compiles and tests pass${testMsg}.`, 'result');
          break;
        }

        // Failure on this attempt
        const failureDetails = !compilePassed
          ? `Compilation check failed (${verifyCmd}):\n${compileErrors}`
          : `Test execution failed (${testCmd}):\n${testErrors}`;

        this.addLog('sentinel', 'coordinator', `[FAILSAFE WARNING: ATTEMPT ${attempt}/${MAX_ATTEMPTS}] ${failureDetails}`, 'error');

        this.coordinatorHistory.push({
          role: 'user',
          content: `CRITICAL INTEGRITY FAILURE (Attempt ${attempt}/${MAX_ATTEMPTS}):\n${failureDetails}\n\nPlease repair this error immediately.`
        });

        if (attempt < MAX_ATTEMPTS) {
          this.addLog('SYSTEM', 'sentinel', `Triggering coordinator recovery turn for attempt ${attempt + 1}/${MAX_ATTEMPTS}...`, 'info');
          try {
            await this.executeCoordinatorTurn();
          } catch (recErr: any) {
            this.addLog('SYSTEM', 'coordinator', `Recovery turn error: ${recErr.message}`, 'error');
          }
          attempt++;
        } else {
          // Capped out!
          this.lastSentinelResult = {
            passed: false,
            attempts: MAX_ATTEMPTS,
            compileCommand: verifyCmd,
            testCommand: testCmd || undefined,
            testStats,
            lastError: failureDetails
          };
          this.addLog('sentinel', 'coordinator', `[FAILSAFE CAPPED OUT: ${MAX_ATTEMPTS}/${MAX_ATTEMPTS} ATTEMPTS EXHAUSTED] Integrity check failed. Code remains unverified.`, 'error');
          break;
        }
      }
    } catch (err: any) {
      this.addLog('SYSTEM', 'sentinel', `Verification check skipped: ${err.message}`, 'info');
    } finally {
      this.inFailsafeCheck = false;
    }
  }

  // Automatic context window compressor to prevent token overflow
  private async compressHistoryIfNeeded(): Promise<void> {
    let totalLength = this.coordinatorHistory.reduce((acc, msg) => acc + msg.content.length, 0);
    
    // Threshold set to 60,000 characters (~15k tokens) to trigger compaction
    if (totalLength < 60000 || this.coordinatorHistory.length <= 6) return;

    this.addLog('SYSTEM', 'sentinel', 'Context limit threshold reached. Starting historical context compression...', 'info');

    // Keep the system prompt (messages[0]) and the last 4 messages to preserve immediate task state
    const systemPrompt = this.coordinatorHistory[0];
    const messagesToCompress = this.coordinatorHistory.slice(1, -4);
    const messagesToKeep = this.coordinatorHistory.slice(-4);

    const compressionQuery: Message[] = [
      {
        role: 'system',
        content: 'You are an advanced text compaction utility. Summarize the following session conversation history between the User, Coordinator, and Specialists. Capture all completed steps, key technical decision paths, file modifications made, and final conclusions. Output a concise summary so the model does not lose historical context. Make the summary structured and compact.'
      },
      {
        role: 'user',
        content: `Compress this history:\n\n${messagesToCompress.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n')}`
      }
    ];

    let summaryContent = '';
    try {
      const clientToUse = this.fastClient || this.client;
      await clientToUse.chatStream(compressionQuery, {
        onContentChunk: (chunk) => {
          summaryContent += chunk;
        },
        onComplete: (content) => {
          summaryContent = content;
        },
        onError: (err) => {
          throw err;
        }
      });

      if (summaryContent) {
        this.historyCompressed = true;
        const summaryMessage: Message = {
          role: 'user',
          content: `[HISTORICAL CONTEXT COMPRESSED SUMMARY: The following is a summary of the previous turns in this session to prevent context overflow:\n${summaryContent.trim()}\n--- END OF PREVIOUS HISTORY SUMMARY ---]`
        };
        // Rebuild coordinatorHistory
        this.coordinatorHistory = [
          systemPrompt,
          summaryMessage,
          ...messagesToKeep
        ];
        this.addLog('SYSTEM', 'sentinel', `Context compression complete. Reduced history character count from ${totalLength} to ${this.coordinatorHistory.reduce((acc, msg) => acc + msg.content.length, 0)} characters.`, 'result');
      }
    } catch (err: any) {
      this.addLog('SYSTEM', 'sentinel', `Context compression skipped due to error: ${err.message}`, 'error');
    }
  }
}
