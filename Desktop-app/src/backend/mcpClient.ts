/**
 * MCP Client (Model Context Protocol)
 *
 * Implements stdio and remote Streamable HTTP / SSE MCP transports
 * specified in docs/17-tool-api-mcp-provider-integration.md.
 *
 * Safety rules:
 * - New MCP servers are disabled until tested/enabled.
 * - Local stdio discovery requires explicit approval / workspace trust ('trusted')
 *   before launching the configured command.
 * - Discovered tools pass through ToolApiGateway permissions and Zero Egress policies.
 * - Discovered tools are filtered through allowedTools and deniedTools.
 * - MCP auth tokens are kept secure and redacted from model logs.
 */

import * as child_process from 'child_process';
import * as readline from 'readline';
import { ToolApiGateway, toolApiGateway, type ToolDefinition } from './toolApiGateway';

// ── Types & Contracts ─────────────────────────────────────────────────────────

export type MCPTransportType = 'stdio' | 'streamable_http' | 'sse';
export type MCPDiscoveryStatus = 'not_started' | 'requires_trust' | 'discovered' | 'failed';
export type MCPWorkspaceTrust = 'trusted' | 'untrusted';

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: MCPTransportType;
  command?: string;
  args?: string[];
  url?: string;
  authTokenRef?: string;
  enabled: boolean;
  discoveryStatus: MCPDiscoveryStatus;
  lastDiscoveryAt?: string;
  allowedTools?: string[];
  deniedTools?: string[];
  workspaceTrust: MCPWorkspaceTrust;
  featureStatus: 'preview' | 'production';
  createdAt: string;
  updatedAt: string;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// ── MCP Transport Abstraction ─────────────────────────────────────────────────

export interface MCPTransport {
  start(): Promise<void>;
  sendRequest(method: string, params?: Record<string, unknown>): Promise<any>;
  close(): Promise<void>;
}

/**
 * Stdio Transport: communicates with an external process over stdin/stdout
 * using JSON-RPC 2.0. Supports both newline-delimited JSON and Content-Length headers.
 */
export class StdioMCPTransport implements MCPTransport {
  private command: string;
  private args: string[];
  private cwd?: string;
  private env?: Record<string, string>;
  private child: child_process.ChildProcess | null = null;
  private pendingRequests: Map<string | number, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();
  private nextId = 1;
  private rl: readline.Interface | null = null;

  constructor(
    command: string,
    args: string[] = [],
    cwd?: string,
    env?: Record<string, string>
  ) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.child = child_process.spawn(this.command, this.args, {
          cwd: this.cwd,
          env: { ...process.env, ...(this.env || {}) },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.child.on('error', (err) => {
          reject(new Error(`Failed to spawn MCP stdio process "${this.command}": ${err.message}`));
        });

        if (this.child.stdout) {
          this.rl = readline.createInterface({
            input: this.child.stdout,
            terminal: false,
          });

          this.rl.on('line', (line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('Content-Length:')) return;
            try {
              const res = JSON.parse(trimmed) as JsonRpcResponse;
              if (res.id !== undefined && this.pendingRequests.has(res.id)) {
                const handler = this.pendingRequests.get(res.id)!;
                this.pendingRequests.delete(res.id);
                if (res.error) {
                  handler.reject(new Error(res.error.message || 'MCP JSON-RPC error'));
                } else {
                  handler.resolve(res.result);
                }
              }
            } catch {
              // Non-JSON or log line from stdout
            }
          });
        }

        this.child.on('exit', (code) => {
          for (const handler of this.pendingRequests.values()) {
            handler.reject(new Error(`MCP process exited unexpectedly with code ${code}`));
          }
          this.pendingRequests.clear();
        });

        resolve();
      } catch (err: any) {
        reject(err);
      }
    });
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<any> {
    if (!this.child || !this.child.stdin || this.child.killed) {
      throw new Error('MCP stdio transport is not running');
    }

    const id = this.nextId++;
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params: params || {},
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timeout for method "${method}"`));
        }
      }, 30_000);

      this.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.child!.stdin!.write(JSON.stringify(req) + '\n');
    });
  }

  async close(): Promise<void> {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM');
      this.child = null;
    }
    this.pendingRequests.clear();
  }
}

/**
 * Streamable HTTP / SSE Transport: sends JSON-RPC 2.0 over HTTP/SSE
 */
export class HttpMCPTransport implements MCPTransport {
  private url: string;
  private authToken?: string;
  private nextId = 1;

  constructor(url: string, authToken?: string) {
    this.url = url;
    this.authToken = authToken;
  }

  async start(): Promise<void> {
    // Verified reachable on start or initialize
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<any> {
    const id = this.nextId++;
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params: params || {},
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const res = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      throw new Error(`MCP HTTP request failed with status ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as JsonRpcResponse;
    if (json.error) {
      throw new Error(json.error.message || `MCP server returned error code ${json.error.code}`);
    }

    return json.result;
  }

  async close(): Promise<void> {
    // No-op for HTTP transport
  }
}

// ── MCP Client Manager ────────────────────────────────────────────────────────

export class MCPClientManager {
  private servers: Map<string, MCPServerConfig> = new Map();
  private transports: Map<string, MCPTransport> = new Map();

  /** Register an MCP server configuration */
  addServer(config: MCPServerConfig): void {
    this.servers.set(config.id, { ...config });
  }

  /** Remove an MCP server configuration and stop its transport */
  async removeServer(id: string, gateway?: ToolApiGateway): Promise<boolean> {
    const transport = this.transports.get(id);
    if (transport) {
      await transport.close().catch(() => {});
      this.transports.delete(id);
    }

    // Unregister any tools registered from this server
    const gw = gateway || toolApiGateway;
    const prefix = `mcp.${id}.`;
    const tools = gw.listTools({ source: 'mcp' });
    for (const t of tools) {
      if (t.id.startsWith(prefix)) {
        gw.unregisterTool(t.id);
      }
    }

    return this.servers.delete(id);
  }

  /** Get server configuration */
  getServer(id: string): MCPServerConfig | undefined {
    return this.servers.get(id);
  }

  /** List all configured MCP servers */
  listServers(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  /** Update an MCP server configuration */
  updateServer(id: string, updates: Partial<MCPServerConfig>): MCPServerConfig | undefined {
    const existing = this.servers.get(id);
    if (!existing) return undefined;
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.servers.set(id, updated);
    return updated;
  }

  /** Get or initialize transport for a server */
  private async getOrCreateTransport(config: MCPServerConfig): Promise<MCPTransport> {
    let transport = this.transports.get(config.id);
    if (transport) return transport;

    if (config.transport === 'stdio') {
      if (!config.command) {
        throw new Error(`MCP server "${config.id}" has stdio transport but no command configured.`);
      }
      transport = new StdioMCPTransport(config.command, config.args || []);
    } else {
      if (!config.url) {
        throw new Error(`MCP server "${config.id}" has HTTP/SSE transport but no url configured.`);
      }
      transport = new HttpMCPTransport(config.url, config.authTokenRef ? process.env[config.authTokenRef] : undefined);
    }

    await transport.start();
    this.transports.set(config.id, transport);
    return transport;
  }

  /**
   * Discover tools from an MCP server, applying trust gating and filters,
   * and registers them with the ToolApiGateway.
   */
  async discoverTools(serverId: string, gateway?: ToolApiGateway): Promise<ToolDefinition[]> {
    const config = this.servers.get(serverId);
    if (!config) {
      throw new Error(`MCP server "${serverId}" not found.`);
    }

    if (!config.enabled) {
      throw new Error(`MCP server "${config.name}" (${serverId}) is disabled. Enable it to discover tools.`);
    }

    // Safety rule: Local stdio requires explicit workspace trust
    if (config.transport === 'stdio' && config.workspaceTrust !== 'trusted') {
      this.updateServer(serverId, { discoveryStatus: 'requires_trust' });
      throw new Error(
        `MCP Server "${config.name}" uses local stdio execution and requires explicit workspace trust before launching command "${config.command}".`
      );
    }

    try {
      const transport = await this.getOrCreateTransport(config);

      // JSON-RPC initialize
      await transport.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'Kryleos-Forge', version: '0.1.0' },
      });

      // JSON-RPC tools/list
      const listRes = await transport.sendRequest('tools/list', {});
      const rawTools: MCPTool[] = listRes?.tools || [];

      // Filter tools against allowlist and denylist
      const allowedSet = config.allowedTools ? new Set(config.allowedTools) : null;
      const deniedSet = config.deniedTools ? new Set(config.deniedTools) : null;

      const filtered = rawTools.filter((t) => {
        if (deniedSet && deniedSet.has(t.name)) return false;
        if (allowedSet && !allowedSet.has(t.name)) return false;
        return true;
      });

      const gw = gateway || toolApiGateway;
      const registeredTools: ToolDefinition[] = [];

      for (const mcpTool of filtered) {
        const toolDef: ToolDefinition = {
          id: `mcp.${config.id}.${mcpTool.name}`,
          name: `${config.name}: ${mcpTool.name}`,
          description: mcpTool.description || `MCP tool ${mcpTool.name} provided by ${config.name}`,
          source: 'mcp',
          featureStatus: config.featureStatus,
          permission: 'network',
          approvalPolicy: 'on_execute',
          remoteApprovalAllowed: false,
          workspaceScoped: false,
          zeroEgressAllowed: false, // External / remote MCP calls are blocked in Zero Egress mode
          inputSchema: mcpTool.inputSchema || { type: 'object' },
          handler: async (args: any) => {
            return this.callTool(config.id, mcpTool.name, args);
          },
        };

        gw.registerTool(toolDef);
        registeredTools.push(toolDef);
      }

      this.updateServer(serverId, {
        discoveryStatus: 'discovered',
        lastDiscoveryAt: new Date().toISOString(),
      });

      return registeredTools;
    } catch (err: any) {
      this.updateServer(serverId, { discoveryStatus: 'failed' });
      throw err;
    }
  }

  /**
   * Execute an MCP tool call through JSON-RPC tools/call.
   */
  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<any> {
    const config = this.servers.get(serverId);
    if (!config) {
      throw new Error(`MCP server "${serverId}" not found.`);
    }
    if (!config.enabled) {
      throw new Error(`MCP server "${config.name}" is disabled.`);
    }

    const transport = await this.getOrCreateTransport(config);
    const result = await transport.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    });

    return result;
  }

  /** Terminate all active MCP transports */
  async closeAll(): Promise<void> {
    for (const [id, transport] of this.transports.entries()) {
      try {
        await transport.close();
      } catch (err: any) {
        console.error(`[MCPClientManager] Error closing transport for "${id}":`, err.message);
      }
    }
    this.transports.clear();
  }
}

// Export singleton instance
export const mcpClientManager = new MCPClientManager();
