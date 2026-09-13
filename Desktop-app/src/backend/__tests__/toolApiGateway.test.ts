import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ToolApiGateway,
  type ToolDefinition,
  redactValue,
} from '../toolApiGateway';

describe('ToolApiGateway', () => {
  let gateway: ToolApiGateway;
  let tempDir: string;
  let auditLogFile: string;

  beforeEach(() => {
    gateway = new ToolApiGateway();
    tempDir = path.join(os.tmpdir(), '.tool-test-' + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(tempDir, { recursive: true });
    auditLogFile = path.join(tempDir, '.kryleos', 'tool-invocations.jsonl');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe('Registry & Filtering', () => {
    it('initializes with standard built-in tools', () => {
      const tools = gateway.listTools();
      const ids = tools.map((t) => t.id);

      expect(ids).toContain('file.read');
      expect(ids).toContain('file.write');
      expect(ids).toContain('file.apply_patch');
      expect(ids).toContain('file.list');
      expect(ids).toContain('file.search');
      expect(ids).toContain('git.status');
      expect(ids).toContain('command.run');
      expect(ids).toContain('code.semantic_index');
    });

    it('filters tools by source, permission, and zero-egress flag', () => {
      const readTools = gateway.listTools({ permission: 'read' });
      expect(readTools.every((t) => t.permission === 'read')).toBe(true);

      const builtInTools = gateway.listTools({ source: 'built_in' });
      expect(builtInTools.length).toBeGreaterThanOrEqual(8);

      const zeroEgressTools = gateway.listTools({ zeroEgressOnly: true });
      expect(zeroEgressTools.every((t) => t.zeroEgressAllowed)).toBe(true);
    });

    it('registers and unregisters custom tools', () => {
      const customTool: ToolDefinition = {
        id: 'custom.calc',
        name: 'Calculator',
        description: 'Performs arithmetic calculation',
        source: 'custom_skill',
        featureStatus: 'production',
        permission: 'read',
        approvalPolicy: 'never',
        remoteApprovalAllowed: true,
        workspaceScoped: true,
        zeroEgressAllowed: true,
        inputSchema: { type: 'object' },
        handler: async (args) => ({ result: (args.a || 0) + (args.b || 0) }),
      };

      gateway.registerTool(customTool);
      expect(gateway.getTool('custom.calc')).toBeDefined();
      expect(gateway.listTools({ source: 'custom_skill' })).toHaveLength(1);

      expect(gateway.unregisterTool('custom.calc')).toBe(true);
      expect(gateway.getTool('custom.calc')).toBeUndefined();
    });
  });

  describe('Approval Policy Enforcement', () => {
    it('evaluates approval policies accurately', () => {
      const safeTool: ToolDefinition = {
        id: 'test.safe',
        name: 'Safe',
        description: 'Safe',
        source: 'built_in',
        featureStatus: 'production',
        permission: 'read',
        approvalPolicy: 'never',
        remoteApprovalAllowed: true,
        workspaceScoped: true,
        zeroEgressAllowed: true,
        inputSchema: {},
      };

      const writeTool: ToolDefinition = {
        id: 'test.write',
        name: 'Write',
        description: 'Write',
        source: 'built_in',
        featureStatus: 'production',
        permission: 'write',
        approvalPolicy: 'on_write',
        remoteApprovalAllowed: true,
        workspaceScoped: true,
        zeroEgressAllowed: true,
        inputSchema: {},
      };

      const adminTool: ToolDefinition = {
        id: 'test.admin',
        name: 'Admin',
        description: 'Admin',
        source: 'built_in',
        featureStatus: 'production',
        permission: 'admin',
        approvalPolicy: 'always',
        remoteApprovalAllowed: false,
        workspaceScoped: false,
        zeroEgressAllowed: false,
        inputSchema: {},
      };

      expect(gateway.requiresApproval(safeTool)).toBe(false);
      expect(gateway.requiresApproval(writeTool)).toBe(true);
      expect(gateway.requiresApproval(adminTool)).toBe(true);
    });

    it('blocks execution when user rejects approval', async () => {
      const writeTool: ToolDefinition = {
        id: 'test.guarded_write',
        name: 'Guarded Write',
        description: 'Guarded Write',
        source: 'built_in',
        featureStatus: 'production',
        permission: 'write',
        approvalPolicy: 'always',
        remoteApprovalAllowed: false,
        workspaceScoped: true,
        zeroEgressAllowed: true,
        inputSchema: {},
        handler: async () => 'executed',
      };
      gateway.registerTool(writeTool);

      await expect(
        gateway.invokeTool(
          'test.guarded_write',
          {},
          {
            workspaceRoot: tempDir,
            sessionId: 'test_session',
            auditLogPath: auditLogFile,
            requestApproval: async () => false, // Rejected
          }
        )
      ).rejects.toThrow(/rejected by the user/);

      // Verify audit log has blocked status
      const logLines = fs.readFileSync(auditLogFile, 'utf-8').trim().split('\n');
      const entry = JSON.parse(logLines[0]);
      expect(entry.status).toBe('blocked');
      expect(entry.approval.decision).toBe('rejected');
    });
  });

  describe('Zero Egress Mode Enforcement', () => {
    it('blocks tools with zeroEgressAllowed = false when Zero Egress is active', async () => {
      const networkTool: ToolDefinition = {
        id: 'network.fetch',
        name: 'External Fetch',
        description: 'Fetches external web content',
        source: 'built_in',
        featureStatus: 'production',
        permission: 'network',
        approvalPolicy: 'never',
        remoteApprovalAllowed: false,
        workspaceScoped: false,
        zeroEgressAllowed: false,
        inputSchema: {},
        handler: async () => 'external content',
      };
      gateway.registerTool(networkTool);

      await expect(
        gateway.invokeTool(
          'network.fetch',
          { url: 'https://example.com' },
          {
            workspaceRoot: tempDir,
            sessionId: 'session_zero_egress',
            zeroEgressMode: true,
            auditLogPath: auditLogFile,
          }
        )
      ).rejects.toThrow(/blocked by Zero Egress mode/);

      // Verify audit log recorded blocked invocation
      const logLines = fs.readFileSync(auditLogFile, 'utf-8').trim().split('\n');
      const entry = JSON.parse(logLines[0]);
      expect(entry.status).toBe('blocked');
      expect(entry.toolId).toBe('network.fetch');
    });

    it('allows tools with zeroEgressAllowed = false when Zero Egress is disabled', async () => {
      const networkTool: ToolDefinition = {
        id: 'network.fetch_allowed',
        name: 'External Fetch Allowed',
        description: 'Fetches external content when egress is enabled',
        source: 'built_in',
        featureStatus: 'production',
        permission: 'network',
        approvalPolicy: 'never',
        remoteApprovalAllowed: false,
        workspaceScoped: false,
        zeroEgressAllowed: false,
        inputSchema: {},
        handler: async () => ({ status: 200 }),
      };
      gateway.registerTool(networkTool);

      const res = await gateway.invokeTool(
        'network.fetch_allowed',
        {},
        {
          workspaceRoot: tempDir,
          sessionId: 'session_regular',
          zeroEgressMode: false,
          auditLogPath: auditLogFile,
        }
      );

      expect(res).toEqual({ status: 200 });
      const logLines = fs.readFileSync(auditLogFile, 'utf-8').trim().split('\n');
      const entry = JSON.parse(logLines[0]);
      expect(entry.status).toBe('succeeded');
    });
  });

  describe('Secret Redaction & Audit Logging', () => {
    it('redacts sensitive keys from arguments in audit log', () => {
      const raw = {
        apiKey: 'sk-ant-api03-1234567890123456789012345678901234',
        userPassword: 'secretPassword123',
        auth_token: 'Bearer xyz',
        safeParam: 'public_value',
      };

      const redacted = redactValue(raw) as Record<string, string>;
      expect(redacted.apiKey).toBe('[REDACTED]');
      expect(redacted.userPassword).toBe('[REDACTED]');
      expect(redacted.auth_token).toBe('[REDACTED]');
      expect(redacted.safeParam).toBe('public_value');
    });

    it('records clean JSONL entries for tool invocations', async () => {
      const tool: ToolDefinition = {
        id: 'test.echo',
        name: 'Echo',
        description: 'Echo test',
        source: 'built_in',
        featureStatus: 'production',
        permission: 'read',
        approvalPolicy: 'never',
        remoteApprovalAllowed: true,
        workspaceScoped: true,
        zeroEgressAllowed: true,
        inputSchema: {},
        handler: async (args) => ({ echoed: args.msg }),
      };
      gateway.registerTool(tool);

      await gateway.invokeTool(
        'test.echo',
        { msg: 'hello audit log', token: 'secret_abc' },
        {
          workspaceRoot: tempDir,
          sessionId: 'sess_1',
          planItemId: 'item_9',
          auditLogPath: auditLogFile,
        }
      );

      expect(fs.existsSync(auditLogFile)).toBe(true);
      const lines = fs.readFileSync(auditLogFile, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(1);
      const entry = JSON.parse(lines[0]);
      expect(entry.toolId).toBe('test.echo');
      expect(entry.sessionId).toBe('sess_1');
      expect(entry.planItemId).toBe('item_9');
      expect(entry.status).toBe('succeeded');
      expect(entry.argumentsRedacted.token).toBe('[REDACTED]');
      expect(entry.argumentsRedacted.msg).toBe('hello audit log');
    });
  });

  describe('Provider Schema Export', () => {
    it('formats OpenAI tool definitions', () => {
      const tool = gateway.getTool('file.read')!;
      const openAi = gateway.toOpenAiSchema(tool);
      expect(openAi.type).toBe('function');
      expect((openAi as any).function.name).toBe('file_read');
      expect((openAi as any).function.parameters).toEqual(tool.inputSchema);
    });

    it('formats Anthropic tool definitions', () => {
      const tool = gateway.getTool('file.read')!;
      const anthropic = gateway.toAnthropicSchema(tool);
      expect(anthropic.name).toBe('file_read');
      expect(anthropic.input_schema).toEqual(tool.inputSchema);
    });

    it('formats Gemini tool definitions', () => {
      const tool = gateway.getTool('file.read')!;
      const gemini = gateway.toGeminiSchema(tool);
      expect(gemini.name).toBe('file_read');
      expect(gemini.parameters).toEqual(tool.inputSchema);
    });
  });

  describe('Built-in Tools Execution', () => {
    it('executes file.write and file.read against workspace', async () => {
      const filePath = 'hello.txt';
      const writeResult = await gateway.invokeTool(
        'file.write',
        { path: filePath, content: 'Hello Tool Gateway!' },
        {
          workspaceRoot: tempDir,
          sessionId: 'sess_fs',
          auditLogPath: auditLogFile,
          requestApproval: async () => true, // write requires approval
        }
      );
      expect(writeResult.success).toBe(true);

      const readResult = await gateway.invokeTool(
        'file.read',
        { path: filePath },
        {
          workspaceRoot: tempDir,
          sessionId: 'sess_fs',
          auditLogPath: auditLogFile,
        }
      );
      expect(readResult).toBe('Hello Tool Gateway!');
    });

    it('executes file.list against workspace', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a');
      fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b');

      const files = await gateway.invokeTool(
        'file.list',
        { path: '.' },
        {
          workspaceRoot: tempDir,
          sessionId: 'sess_list',
          auditLogPath: auditLogFile,
        }
      );
      expect(files).toContain('a.txt');
      expect(files).toContain('b.txt');
    });
  });
});
