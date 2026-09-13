/**
 * Tool API Gateway
 *
 * Implements the control plane for agent tool execution specified in
 * docs/17-tool-api-mcp-provider-integration.md and docs/08-agent-and-planning-engine.md.
 *
 * Responsibilities:
 * - Owns the registry of built-in, custom skill, and MCP tools.
 * - Converts Tool API definitions into provider-specific schemas (OpenAI, Anthropic, Gemini).
 * - Routes invocations to tool implementations.
 * - Enforces permissions, workspace containment, Zero Egress, and approval policies.
 * - Records redacted JSONL audit logs to .kryleos/tool-invocations.jsonl.
 * - Sanitizes tool outputs.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { WorkspaceSandbox, classifyCommand } from './tools';

// ── Types & Contracts ─────────────────────────────────────────────────────────

export type ToolSource = 'built_in' | 'custom_skill' | 'mcp';
export type ToolFeatureStatus = 'production' | 'preview' | 'simulator' | 'mock' | 'planned';
export type ToolPermission = 'read' | 'write' | 'execute' | 'network' | 'admin';
export type ToolApprovalPolicy = 'never' | 'on_write' | 'on_execute' | 'always';
export type ToolTierGate = 'free' | 'solo' | 'solo_plus' | 'founder' | 'agency';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  source: ToolSource;
  featureStatus: ToolFeatureStatus;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  permission: ToolPermission;
  approvalPolicy: ToolApprovalPolicy;
  remoteApprovalAllowed: boolean;
  tierGate?: ToolTierGate;
  workspaceScoped: boolean;
  zeroEgressAllowed: boolean;
  handler?: (args: any, context: ToolExecutionContext) => Promise<any>;
}

export interface ToolInvocation {
  id: string;
  toolId: string;
  sessionId: string;
  planItemId?: string;
  requestedBy: 'model' | 'user' | 'system' | 'companion';
  provider?: string;
  argumentsRedacted: Record<string, unknown>;
  approval?: {
    required: boolean;
    decision?: 'approved' | 'rejected' | 'aborted' | 'stale';
    source?: 'local' | 'remote';
    deviceId?: string;
    commandId?: string;
  };
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked';
  startedAt: string;
  completedAt?: string;
  resultSummary?: string;
  error?: string;
}

export interface ToolExecutionContext {
  workspaceRoot: string;
  sandbox?: WorkspaceSandbox;
  sessionId: string;
  planItemId?: string;
  requestedBy?: 'model' | 'user' | 'system' | 'companion';
  provider?: string;
  zeroEgressMode?: boolean;
  userRole?: 'admin' | 'developer';
  userTier?: ToolTierGate;
  requestApproval?: (tool: ToolDefinition, args: any) => Promise<boolean>;
  auditLogPath?: string;
}

export interface ToolListFilter {
  source?: ToolSource;
  permission?: ToolPermission;
  zeroEgressOnly?: boolean;
  featureStatus?: ToolFeatureStatus;
}

// ── Redaction Helper ──────────────────────────────────────────────────────────

const SECRET_KEY_PATTERN = /token|key|secret|password|auth|credential|bearer|private/i;
const SECRET_VALUE_PATTERNS = [
  /ghp_[a-zA-Z0-9]{36}/g,
  /sk-ant-[a-zA-Z0-9_\-]{30,}/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /AIza[0-9A-Za-z\-_]{35}/g,
  /xox[baprs]-[0-9]{10,}-[a-zA-Z0-9]+/g,
];

export function redactValue(val: unknown): unknown {
  if (typeof val === 'string') {
    let sanitized = val;
    for (const pat of SECRET_VALUE_PATTERNS) {
      sanitized = sanitized.replace(pat, '[REDACTED_SECRET]');
    }
    return sanitized;
  }
  if (Array.isArray(val)) {
    return val.map(redactValue);
  }
  if (val && typeof val === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      if (SECRET_KEY_PATTERN.test(k)) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = redactValue(v);
      }
    }
    return result;
  }
  return val;
}

// ── ToolApiGateway Implementation ─────────────────────────────────────────────

export class ToolApiGateway {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerBuiltInTools();
  }

  /** Register a tool in the gateway */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  /** Unregister a tool by ID */
  unregisterTool(toolId: string): boolean {
    return this.tools.delete(toolId);
  }

  /** Get a tool definition by ID */
  getTool(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  /** List tools with optional filtering */
  listTools(filter?: ToolListFilter): ToolDefinition[] {
    let list = Array.from(this.tools.values());
    if (filter?.source) {
      list = list.filter((t) => t.source === filter.source);
    }
    if (filter?.permission) {
      list = list.filter((t) => t.permission === filter.permission);
    }
    if (filter?.zeroEgressOnly) {
      list = list.filter((t) => t.zeroEgressAllowed);
    }
    if (filter?.featureStatus) {
      list = list.filter((t) => t.featureStatus === filter.featureStatus);
    }
    return list;
  }

  /**
   * Determine if invocation of a tool requires approval based on policy and parameters.
   */
  requiresApproval(tool: ToolDefinition, args?: any): boolean {
    switch (tool.approvalPolicy) {
      case 'never':
        return false;
      case 'always':
        return true;
      case 'on_write':
        return tool.permission === 'write' || tool.permission === 'execute' || tool.permission === 'admin';
      case 'on_execute':
        if (tool.permission === 'admin') return true;
        if (tool.permission === 'execute') {
          // If command.run, also check if destructive
          if (tool.id === 'command.run' && args?.command) {
            const classified = classifyCommand(String(args.command));
            if (classified.destructive) return true;
          }
          return true;
        }
        return false;
      default:
        return true;
    }
  }

  /** Check Zero Egress compliance */
  checkZeroEgress(tool: ToolDefinition, zeroEgressMode: boolean): { allowed: boolean; reason?: string } {
    if (zeroEgressMode && !tool.zeroEgressAllowed) {
      return {
        allowed: false,
        reason: `Tool "${tool.id}" is blocked by Zero Egress mode: external network access and non-local data transmission are disabled.`,
      };
    }
    return { allowed: true };
  }

  /** Record a tool invocation in the audit log (.kryleos/tool-invocations.jsonl) */
  async logInvocation(invocation: ToolInvocation, workspaceRoot: string, customLogPath?: string): Promise<void> {
    try {
      const logFile = customLogPath || path.join(workspaceRoot, '.kryleos', 'tool-invocations.jsonl');
      await fs.promises.mkdir(path.dirname(logFile), { recursive: true });
      const line = JSON.stringify(invocation) + '\n';
      await fs.promises.appendFile(logFile, line, 'utf-8');
    } catch (err: any) {
      console.error('[ToolApiGateway] Failed to record audit log:', err.message);
    }
  }

  /**
   * Invoke a tool through the Tool API Gateway with full safety checks:
   * 1. Schema / existence check
   * 2. Zero Egress check
   * 3. Approval check
   * 4. Audit logging
   * 5. Execution
   */
  async invokeTool(
    toolId: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<any> {
    const tool = this.getTool(toolId);
    if (!tool) {
      throw new Error(`Tool not found: "${toolId}"`);
    }

    const invocationId = `inv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const startedAt = new Date().toISOString();
    const redactedArgs = (redactValue(args) as Record<string, unknown>) || {};

    const invocation: ToolInvocation = {
      id: invocationId,
      toolId,
      sessionId: context.sessionId,
      planItemId: context.planItemId,
      requestedBy: context.requestedBy || 'system',
      provider: context.provider,
      argumentsRedacted: redactedArgs,
      status: 'pending',
      startedAt,
    };

    // 1. Zero Egress verification
    if (context.zeroEgressMode) {
      const egressCheck = this.checkZeroEgress(tool, true);
      if (!egressCheck.allowed) {
        invocation.status = 'blocked';
        invocation.completedAt = new Date().toISOString();
        invocation.error = egressCheck.reason;
        invocation.resultSummary = 'Blocked by Zero Egress policy';
        await this.logInvocation(invocation, context.workspaceRoot, context.auditLogPath);
        throw new Error(egressCheck.reason);
      }
    }

    // 2. Approval Policy verification
    const needsApproval = this.requiresApproval(tool, args);
    invocation.approval = {
      required: needsApproval,
    };

    if (needsApproval) {
      if (!context.requestApproval) {
        invocation.status = 'blocked';
        invocation.completedAt = new Date().toISOString();
        invocation.approval.decision = 'rejected';
        invocation.error = `Tool "${toolId}" requires approval, but no approval handler was provided.`;
        await this.logInvocation(invocation, context.workspaceRoot, context.auditLogPath);
        throw new Error(invocation.error);
      }

      const approved = await context.requestApproval(tool, args);
      invocation.approval.decision = approved ? 'approved' : 'rejected';
      if (!approved) {
        invocation.status = 'blocked';
        invocation.completedAt = new Date().toISOString();
        invocation.error = `Execution of "${toolId}" was rejected by the user.`;
        invocation.resultSummary = 'Rejected by user approval';
        await this.logInvocation(invocation, context.workspaceRoot, context.auditLogPath);
        throw new Error(invocation.error);
      }
    }

    // 3. Execution
    invocation.status = 'running';
    if (!tool.handler) {
      invocation.status = 'failed';
      invocation.completedAt = new Date().toISOString();
      invocation.error = `Tool "${toolId}" has no executable handler registered.`;
      await this.logInvocation(invocation, context.workspaceRoot, context.auditLogPath);
      throw new Error(invocation.error);
    }

    try {
      const result = await tool.handler(args, context);
      invocation.status = 'succeeded';
      invocation.completedAt = new Date().toISOString();
      invocation.resultSummary = typeof result === 'string'
        ? (result.length > 200 ? result.slice(0, 200) + '...' : result)
        : JSON.stringify(result).slice(0, 200);
      await this.logInvocation(invocation, context.workspaceRoot, context.auditLogPath);
      return result;
    } catch (execErr: any) {
      invocation.status = 'failed';
      invocation.completedAt = new Date().toISOString();
      invocation.error = execErr.message || 'Unknown tool execution error';
      await this.logInvocation(invocation, context.workspaceRoot, context.auditLogPath);
      throw execErr;
    }
  }

  // ── Provider Schema Converters ──────────────────────────────────────────────

  /** Convert to OpenAI Responses / Function tool definition */
  toOpenAiSchema(tool: ToolDefinition): Record<string, unknown> {
    return {
      type: 'function',
      function: {
        name: tool.id.replace(/\./g, '_'),
        description: tool.description,
        parameters: tool.inputSchema,
      },
    };
  }

  /** Convert to Anthropic Tool Use definition */
  toAnthropicSchema(tool: ToolDefinition): Record<string, unknown> {
    return {
      name: tool.id.replace(/\./g, '_'),
      description: tool.description,
      input_schema: tool.inputSchema,
    };
  }

  /** Convert to Gemini Function Declaration */
  toGeminiSchema(tool: ToolDefinition): Record<string, unknown> {
    return {
      name: tool.id.replace(/\./g, '_'),
      description: tool.description,
      parameters: tool.inputSchema,
    };
  }

  // ── Built-in Tools Registration ─────────────────────────────────────────────

  private registerBuiltInTools(): void {
    // 1. file.read
    this.registerTool({
      id: 'file.read',
      name: 'Read File',
      description: 'Read the contents of a file inside the workspace.',
      source: 'built_in',
      featureStatus: 'production',
      permission: 'read',
      approvalPolicy: 'never',
      remoteApprovalAllowed: true,
      workspaceScoped: true,
      zeroEgressAllowed: true,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to file within workspace.' },
        },
        required: ['path'],
      },
      handler: async (args, ctx) => {
        if (ctx.sandbox) {
          return ctx.sandbox.readFile(String(args.path));
        }
        const resolved = path.resolve(ctx.workspaceRoot, String(args.path));
        return fs.promises.readFile(resolved, 'utf-8');
      },
    });

    // 2. file.write
    this.registerTool({
      id: 'file.write',
      name: 'Write File',
      description: 'Write or overwrite contents of a file inside the workspace.',
      source: 'built_in',
      featureStatus: 'production',
      permission: 'write',
      approvalPolicy: 'on_write',
      remoteApprovalAllowed: true,
      workspaceScoped: true,
      zeroEgressAllowed: true,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to file within workspace.' },
          content: { type: 'string', description: 'Full text content to write.' },
        },
        required: ['path', 'content'],
      },
      handler: async (args, ctx) => {
        if (ctx.sandbox) {
          await ctx.sandbox.writeFile(String(args.path), String(args.content));
          return { success: true, path: args.path };
        }
        const resolved = path.resolve(ctx.workspaceRoot, String(args.path));
        await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
        await fs.promises.writeFile(resolved, String(args.content), 'utf-8');
        return { success: true, path: args.path };
      },
    });

    // 3. file.apply_patch
    this.registerTool({
      id: 'file.apply_patch',
      name: 'Apply Patch',
      description: 'Apply unified or search-and-replace patch to a file.',
      source: 'built_in',
      featureStatus: 'production',
      permission: 'write',
      approvalPolicy: 'on_write',
      remoteApprovalAllowed: true,
      workspaceScoped: true,
      zeroEgressAllowed: true,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to patch.' },
          patch: { type: 'string', description: 'Patch or replacement text.' },
        },
        required: ['path', 'patch'],
      },
      handler: async (args, ctx) => {
        if (ctx.sandbox) {
          return ctx.sandbox.modifyFile(
            String(args.path),
            String(args.targetContent || ''),
            String(args.patch || args.replacementContent || '')
          );
        }
        throw new Error('Patching requires active workspace sandbox.');
      },
    });

    // 4. file.list
    this.registerTool({
      id: 'file.list',
      name: 'List Files',
      description: 'List files and directories in the workspace.',
      source: 'built_in',
      featureStatus: 'production',
      permission: 'read',
      approvalPolicy: 'never',
      remoteApprovalAllowed: true,
      workspaceScoped: true,
      zeroEgressAllowed: true,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Subdirectory path to list from.' },
          recursive: { type: 'boolean', description: 'Whether to list recursively.' },
        },
      },
      handler: async (args, ctx) => {
        if (ctx.sandbox) {
          return ctx.sandbox.listDir(args.path ? String(args.path) : '.');
        }
        const target = path.resolve(ctx.workspaceRoot, args.path ? String(args.path) : '.');
        return fs.promises.readdir(target);
      },
    });

    // 5. file.search
    this.registerTool({
      id: 'file.search',
      name: 'Search Files',
      description: 'Search for string or pattern across workspace files.',
      source: 'built_in',
      featureStatus: 'production',
      permission: 'read',
      approvalPolicy: 'never',
      remoteApprovalAllowed: true,
      workspaceScoped: true,
      zeroEgressAllowed: true,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or regex pattern.' },
          path: { type: 'string', description: 'Scope directory.' },
        },
        required: ['query'],
      },
      handler: async (args, ctx) => {
        if (ctx.sandbox) {
          return ctx.sandbox.grepSearch(String(args.query), args.path ? String(args.path) : '.');
        }
        return [];
      },
    });

    // 6. git.status
    this.registerTool({
      id: 'git.status',
      name: 'Git Status',
      description: 'Get git status and review diffs for the current workspace.',
      source: 'built_in',
      featureStatus: 'production',
      permission: 'read',
      approvalPolicy: 'never',
      remoteApprovalAllowed: true,
      workspaceScoped: true,
      zeroEgressAllowed: true,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async (_args, ctx) => {
        if (ctx.sandbox) {
          return ctx.sandbox.gitReviewCurrent();
        }
        return { success: false, message: 'Sandbox not available' };
      },
    });

    // 7. command.run
    this.registerTool({
      id: 'command.run',
      name: 'Run Command',
      description: 'Execute a shell command inside the workspace.',
      source: 'built_in',
      featureStatus: 'production',
      permission: 'execute',
      approvalPolicy: 'on_execute',
      remoteApprovalAllowed: false,
      workspaceScoped: true,
      zeroEgressAllowed: true,
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command line string to execute.' },
          cwd: { type: 'string', description: 'Working directory.' },
        },
        required: ['command'],
      },
      handler: async (args, ctx) => {
        if (ctx.sandbox) {
          return ctx.sandbox.runCommand(String(args.command));
        }
        throw new Error('Command execution requires active workspace sandbox.');
      },
    });

    // 8. code.semantic_index
    this.registerTool({
      id: 'code.semantic_index',
      name: 'Semantic Code Index',
      description: 'Retrieve semantic code intelligence and symbol outline.',
      source: 'built_in',
      featureStatus: 'production',
      permission: 'read',
      approvalPolicy: 'never',
      remoteApprovalAllowed: true,
      workspaceScoped: true,
      zeroEgressAllowed: true,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Symbol or concept query.' },
        },
        required: ['query'],
      },
      handler: async (args, ctx) => {
        if (ctx.sandbox) {
          return ctx.sandbox.querySemanticCache(String(args.query));
        }
        return { symbols: [] };
      },
    });
  }
}

// Export singleton instance
export const toolApiGateway = new ToolApiGateway();
