# Tool API, MCP, and Provider Integration

## Purpose

This document resolves the main current architecture gap: Forge must not rely primarily on model-generated XML/JSON text blocks for tool execution. Forge needs a unified, typed Tool API that can be used by local models, hosted models, MCP servers, custom skills, and future provider-native tool systems.

The Tool API is the control plane for every action an agent can take.

## Product Goal

Forge should be tool-native:

```text
Model intent
  -> provider-native tool call when supported
  -> Forge Tool API Gateway
  -> permissions, tier, approval, workspace, and Zero Egress checks
  -> built-in tool, custom skill, or MCP tool
  -> redacted audit log
  -> sanitized result returned to model/user
```

Text-parsed action blocks remain only as compatibility fallback for local or older models.

## Non-Negotiable Requirements

- All agent-callable capabilities must be registered as typed tools.
- Tool definitions must include JSON schemas.
- Provider-native tool/function calls must pass through the same Tool API Gateway as fallback text actions.
- MCP tools must never bypass Forge permissions.
- Local stdio MCP servers are executable local processes and must not be launched for discovery without explicit user trust/approval.
- Custom script skills must declare permissions and execute only through the Tool API Gateway.
- Tool results from external sources must be treated as untrusted data.
- Write, execute, network, and admin tools must have explicit approval policies.
- Tool invocation logs must redact secrets.
- Zero Egress must block hosted providers and network tools that would send workspace data out.

## Tool API Gateway

Responsibilities:

- Own the registry of built-in, custom, and MCP tools.
- Convert Tool API definitions into provider-specific schemas.
- Route invocations to tool implementations.
- Enforce permissions, tier gates, workspace scope, Zero Egress, and approval policy.
- Log invocations.
- Sanitize tool outputs.
- Support deferred loading/tool search when provider supports it.

## Tool Definition Contract

```typescript
interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  source: 'built_in' | 'custom_skill' | 'mcp';
  featureStatus: 'production' | 'preview' | 'simulator' | 'mock' | 'planned';
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  permission: 'read' | 'write' | 'execute' | 'network' | 'admin';
  approvalPolicy: 'never' | 'on_write' | 'on_execute' | 'always';
  remoteApprovalAllowed: boolean;
  tierGate?: 'free' | 'solo' | 'solo_plus' | 'founder' | 'agency';
  workspaceScoped: boolean;
  zeroEgressAllowed: boolean;
}
```

## Tool Invocation Contract

```typescript
interface ToolInvocation {
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
}
```

## Built-In Tool Families

### File Tools

- `file.read`
- `file.write`
- `file.apply_patch`
- `file.list`
- `file.search`
- `file.delete_safe`

`file.apply_patch` should be preferred for agent edits over brittle search-and-replace where possible.

### Git Tools

- `git.status`
- `git.diff`
- `git.stage`
- `git.unstage`
- `git.commit`
- `git.push`
- `git.pull`
- `git.branch`
- `git.restore_safe`

### Command and Verification Tools

- `command.run`
- `test.detect`
- `test.run`
- `test.parse`
- `build.run`
- `package.inspect`
- `package.security_audit`

`command.run` always uses the approval path.

### Code Intelligence Tools

- `code.symbol_search`
- `code.references`
- `code.ast_search`
- `code.dependency_graph`
- `code.semantic_index`

Use AST/LSP/tree-sitter style parsing where available, with regex as fallback.

### Browser and Preview Tools

- `browser.open_preview`
- `browser.screenshot`
- `browser.console_logs`
- `browser.run_playwright_check`

These tools operate on local previews or explicitly allowed URLs.

### Network and Data Tools

- `http.request`
- `db.query_readonly`
- `log.parse`

Network tools require destination display and approval if workspace data is included.

### Planning and Artifact Tools

- `planning.criteria_generate`
- `planning.criteria_evaluate`
- `planning.trace_create`
- `planning.drift_check`
- `planning.whats_left`
- `artifact.list`
- `artifact.read`
- `artifact.write`
- `artifact.publish`

### Security Tools

- `security.secret_scan`
- `security.command_classify`
- `security.diff_risk_scan`
- `security.prompt_injection_scan`

## MCP Integration

Forge must support:

- Local stdio MCP servers.
- Remote Streamable HTTP or SSE MCP servers.
- Tool discovery.
- Tool allowlists and denylists.
- Token references for authenticated MCP servers.
- Disable/revoke server configuration.
- Per-server trust status.

MCP server config:

```typescript
interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'streamable_http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  authTokenRef?: string;
  enabled: boolean;
  discoveryStatus: 'not_started' | 'requires_trust' | 'discovered' | 'failed';
  lastDiscoveryAt?: string;
  allowedTools?: string[];
  deniedTools?: string[];
  workspaceTrust: 'trusted' | 'untrusted';
  featureStatus: 'preview' | 'production';
  createdAt: string;
  updatedAt: string;
}
```

MCP safety rules:

- New MCP servers are disabled until tested.
- Local stdio discovery requires explicit approval before launching the configured command.
- Discovery approval displays command, args, working directory, environment summary, and workspace trust impact.
- Prefer static manifest inspection before launching a stdio process when available.
- Discovered tools are not automatically allowed.
- External tool output is evidence, not instruction.
- MCP tokens are never exposed to models or renderer logs.
- MCP tools cannot call local shell or filesystem unless routed through Forge built-ins.

## Custom Skill Governance

Custom skills may be passive Markdown instructions or executable script skills. Script skills are high-risk and must be treated like tools, not like plain content.

Rules:

- Skill definitions declare permission level, workspace scope, and feature status.
- Script skills are disabled until reviewed and enabled.
- Script skills execute only through the Tool API Gateway.
- Script skill filesystem, command, network, and admin effects require the same approval policies as built-in tools.
- Skill output is sanitized as untrusted evidence before model reuse.

## Provider Adapters

### OpenAI

- New tool-capable workflows should use the Responses API.
- Map Tool API definitions to OpenAI tool/function schemas.
- Support built-in provider tools when appropriate: web search, file search, code interpreter, computer use, and remote MCP.
- Tool search/deferred loading should be used for large tool catalogs.
- Chat Completions may remain only as compatibility fallback.

### Anthropic

- Use native tool use for Forge tools.
- Use MCP connector for remote MCP servers when the deployment supports it.
- Support strict tool schemas where available.
- For local stdio MCP, use Forge's own MCP client and map tools into Anthropic tool definitions.

### Gemini

- Use function calling for Forge tools.
- Use supported built-in combinations such as Google Search grounding, URL context, and code execution only where product policy allows.
- Preserve function call IDs when returning function responses.

### Ollama, OpenRouter, and DeepSeek

- Use native tool support where the selected model/provider exposes it.
- Otherwise use strict text-action fallback.
- Fallback action blocks must be parsed, validated against ToolDefinition schemas, and routed through the same Tool API Gateway.

## External Integrations to Add

Priority 1:

- GitHub Issues, Pull Requests, Checks, and Actions.
- Linear issues/projects.
- Sentry issues/events/releases.

Priority 2:

- Slack or Discord notifications.
- Vercel, Netlify, Render, Fly.io, Railway deployment status.
- Docker and Compose inspection.
- Kubernetes and Terraform read-only inspection.

Priority 3:

- Jira.
- Notion.
- Google Drive/Docs/Sheets deeper project import/export.

## Tool Permission Levels

- `read`: can inspect local or external data.
- `write`: can mutate files, tasks, artifacts, or remote records.
- `execute`: can run commands or tests.
- `network`: can call external URLs or APIs.
- `admin`: can change credentials, billing, MCP servers, command policies, or destructive settings.

## Approval Policy

- `never`: safe read-only local calls.
- `on_write`: file/task/artifact/remote mutation.
- `on_execute`: command/test/build execution.
- `always`: high-risk, network, admin, destructive, credential-adjacent, or cross-workspace calls.

## Audit Log

Store redacted JSONL under:

```text
.kryleos/tool-invocations.jsonl
```

Each record should include:

- Invocation ID.
- Tool ID.
- Session ID.
- Plan item ID when available.
- Provider/model.
- Redacted arguments.
- Approval decision.
- Status.
- Result summary.
- Timestamp.

## Acceptance Criteria

- Tool registry lists built-in tools with schemas.
- Agent execution uses Tool API Gateway for all tools.
- OpenAI adapter uses Responses API for at least one native tool call path.
- At least one Anthropic or Gemini native tool adapter is implemented.
- Ollama fallback validates parsed text actions against schemas.
- MCP server can be added, tested, discovered, allowlisted, invoked, and disabled.
- Local stdio MCP discovery cannot launch untrusted commands without explicit user trust/approval.
- Custom script skills cannot bypass tool permissions, workspace containment, approval policy, or audit logging.
- External tool prompt-injection payloads are not treated as instructions.
- Tool audit log records redacted invocations.
- Zero Egress blocks hosted providers and disallowed network tools.
