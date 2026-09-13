import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import {
  MCPClientManager,
  type MCPServerConfig,
  StdioMCPTransport,
  HttpMCPTransport,
} from '../mcpClient';
import { ToolApiGateway } from '../toolApiGateway';

describe('MCPClientManager', () => {
  let manager: MCPClientManager;
  let gateway: ToolApiGateway;

  beforeEach(() => {
    manager = new MCPClientManager();
    gateway = new ToolApiGateway();
  });

  afterEach(async () => {
    await manager.closeAll();
  });

  describe('Server Configuration Management', () => {
    it('manages server configs with correct initial states', async () => {
      const config: MCPServerConfig = {
        id: 'github-mcp',
        name: 'GitHub MCP',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        enabled: false,
        discoveryStatus: 'not_started',
        workspaceTrust: 'untrusted',
        featureStatus: 'preview',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      manager.addServer(config);
      expect(manager.getServer('github-mcp')).toBeDefined();
      expect(manager.listServers()).toHaveLength(1);

      const updated = manager.updateServer('github-mcp', { enabled: true, workspaceTrust: 'trusted' });
      expect(updated?.enabled).toBe(true);
      expect(updated?.workspaceTrust).toBe('trusted');

      await expect(manager.removeServer('github-mcp', gateway)).resolves.toBe(true);
      expect(manager.getServer('github-mcp')).toBeUndefined();
    });

    it('prevents tool discovery when server is disabled', async () => {
      manager.addServer({
        id: 'disabled-server',
        name: 'Disabled Server',
        transport: 'stdio',
        command: 'node',
        enabled: false,
        discoveryStatus: 'not_started',
        workspaceTrust: 'untrusted',
        featureStatus: 'preview',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await expect(manager.discoverTools('disabled-server', gateway)).rejects.toThrow(/is disabled/);
    });
  });

  describe('Local Stdio Trust Gating (Critical Safety)', () => {
    it('blocks stdio discovery without launching process when workspace is untrusted', async () => {
      manager.addServer({
        id: 'untrusted-server',
        name: 'Untrusted Stdio Server',
        transport: 'stdio',
        command: 'rm',
        args: ['-rf', '/'],
        enabled: true,
        discoveryStatus: 'not_started',
        workspaceTrust: 'untrusted', // Untrusted!
        featureStatus: 'preview',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await expect(manager.discoverTools('untrusted-server', gateway)).rejects.toThrow(
        /requires explicit workspace trust/
      );

      const server = manager.getServer('untrusted-server');
      expect(server?.discoveryStatus).toBe('requires_trust');
    });
  });

  describe('Tool Discovery & Gateway Registration', () => {
    it('registers discovered tools into ToolApiGateway with filters and security defaults', async () => {
      // Mock an active transport
      const mockTransport = {
        start: vi.fn().mockResolvedValue(undefined),
        sendRequest: vi.fn().mockImplementation(async (method: string) => {
          if (method === 'initialize') {
            return { serverInfo: { name: 'mock-server', version: '1.0' } };
          }
          if (method === 'tools/list') {
            return {
              tools: [
                { name: 'allowed_tool', description: 'Allowed Tool', inputSchema: { type: 'object' } },
                { name: 'denied_tool', description: 'Denied Tool', inputSchema: { type: 'object' } },
                { name: 'general_tool', description: 'General Tool', inputSchema: { type: 'object' } },
              ],
            };
          }
          return {};
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      manager.addServer({
        id: 'mock-server',
        name: 'Mock Server',
        transport: 'stdio',
        command: 'node',
        enabled: true,
        discoveryStatus: 'not_started',
        workspaceTrust: 'trusted',
        featureStatus: 'production',
        deniedTools: ['denied_tool'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Inject mock transport
      (manager as any).transports.set('mock-server', mockTransport);

      const discovered = await manager.discoverTools('mock-server', gateway);
      expect(discovered).toHaveLength(2);
      expect(discovered.map((t) => t.id)).toContain('mcp.mock-server.allowed_tool');
      expect(discovered.map((t) => t.id)).toContain('mcp.mock-server.general_tool');
      expect(discovered.map((t) => t.id)).not.toContain('mcp.mock-server.denied_tool');

      // Check registered attributes in gateway
      const tool = gateway.getTool('mcp.mock-server.allowed_tool')!;
      expect(tool).toBeDefined();
      expect(tool.source).toBe('mcp');
      expect(tool.permission).toBe('network');
      expect(tool.approvalPolicy).toBe('on_execute');
      expect(tool.zeroEgressAllowed).toBe(false); // MCP tools cannot egress under Zero Egress mode
    });

    it('blocks execution of discovered MCP tools when Zero Egress mode is active', async () => {
      const mockTransport = {
        start: vi.fn().mockResolvedValue(undefined),
        sendRequest: vi.fn().mockImplementation(async (method: string) => {
          if (method === 'initialize') return {};
          if (method === 'tools/list') {
            return {
              tools: [{ name: 'remote_query', description: 'Remote DB query' }],
            };
          }
          return { content: [{ type: 'text', text: 'data from external MCP' }] };
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      manager.addServer({
        id: 'external-db',
        name: 'External DB',
        transport: 'streamable_http',
        url: 'https://example.com/mcp',
        enabled: true,
        discoveryStatus: 'not_started',
        workspaceTrust: 'trusted',
        featureStatus: 'production',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      (manager as any).transports.set('external-db', mockTransport);
      await manager.discoverTools('external-db', gateway);

      // Attempt invocation with Zero Egress enabled
      await expect(
        gateway.invokeTool(
          'mcp.external-db.remote_query',
          {},
          {
            workspaceRoot: os.tmpdir(),
            sessionId: 'sess_ze',
            zeroEgressMode: true, // Active Zero Egress
          }
        )
      ).rejects.toThrow(/Zero Egress mode/);
    });
  });

  describe('MCP Transports', () => {
    it('HttpMCPTransport handles JSON-RPC requests and responses', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { greeting: 'hello from remote mcp' },
        }),
      } as any);

      const httpTransport = new HttpMCPTransport('https://api.example.com/mcp', 'test-token');
      await httpTransport.start();

      const result = await httpTransport.sendRequest('test/ping', { key: 'val' });
      expect(result).toEqual({ greeting: 'hello from remote mcp' });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );

      fetchSpy.mockRestore();
    });
  });
});
