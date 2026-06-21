# System Architecture

## Architecture Summary

Kryleos Forge should be rebuilt as a local-first desktop application with clean boundaries between UI, local backend, planning domain, agent orchestration, workspace tools, companion channel, and optional hosted services.

```text
React Renderer
  -> Local REST API
  -> Local WebSocket
Electron Main/Preload
  -> native folder picker
  -> secure local session bootstrap
  -> backend supervisor and port broker
Local Backend
  -> Planning Service
  -> Agent Orchestrator
  -> Swarm Orchestrator
  -> Learning Engine
  -> Storage Service
  -> Tool API Gateway
  -> Workspace Sandbox
  -> Provider Clients
  -> MCP Client Manager
  -> Companion Hub
Workspace
  -> files, git, .kryleos data
```

## Runtime Components

### Electron Shell

Responsibilities:

- Create desktop window.
- Generate process-scoped local session secret.
- Pass safe APIs through preload.
- Provide folder picker.
- Package app.
- Protect privileged backend access from arbitrary origins.
- Run with `contextIsolation: true` and `nodeIntegration: false`.
- Enforce production CSP and separate dev CSP.
- Deny untrusted navigation and gate `window.open`.
- Validate IPC payloads and avoid raw generic IPC passthrough.
- Supervise the local backend process with readiness checks and bounded restart behavior.
- Broker backend port changes to the renderer after restarts or port fallback.

### React Renderer

Responsibilities:

- Render Plan, Crew, Flow, Forge.
- Hold UI state.
- Use REST for request/response operations.
- Use WebSocket for streaming and approvals.
- Never store plaintext provider keys in localStorage.
- Show feature status labels honestly.

### Local Backend

Responsibilities:

- Serve authenticated local REST and WebSocket APIs.
- Expose minimal health status without session or secret details.
- Own active workspace sandbox.
- Manage provider clients.
- Manage Tool API registry, invocation, approval, and audit.
- Manage MCP server configuration and discovery.
- Manage planning service.
- Manage agent orchestration.
- Manage native task swarm sessions and lane state.
- Manage suggest-only local learning signals and recommendations.
- Manage billing/account/sync preview services.
- Manage companion pairing and signed remote actions.
- Enforce Zero Egress and workspace boundaries server-side.

### Storage Service

Responsibilities:

- Own `.kryleos` metadata reads and writes.
- Store schema version on persisted state.
- Use atomic write protocol for JSON/JSONL metadata.
- Flush file contents before rename where the platform supports it.
- Use lock files with PID, hostname, and process start token.
- Reject unsafe stale-lock cleanup when lock ownership cannot be verified.
- Support backup-before-migrate and read-compatible rollback rules once migrations exist.

### Planning Service

Responsibilities:

- Store Plan Workspace items.
- Convert plan items to Flow tasks.
- Generate and enrich criteria.
- Create execution traces.
- Evaluate drift.
- Produce What's Left reports.
- Manage multi-repo assignments and blockers.

### Agent Orchestrator

Responsibilities:

- Build prompt/context for active run.
- Route to specialist agents.
- Load custom agents/skills.
- Load workspace rules.
- Call provider clients.
- Request tools through the Tool API Gateway.
- Pause for command approval.
- Abort active workflow safely.
- Emit trace extraction input.

### Swarm Orchestrator

Responsibilities:

- Create hierarchical swarm sessions from Flow tasks.
- Plan default and conditional lanes.
- Enforce max active worker lane count.
- Route worker actions through Agent Orchestrator and Tool API Gateway.
- Serialize write, execute, network, Git, and admin actions through approval policy.
- Emit swarm timeline events.
- Attach lane evidence to execution traces.
- Mark swarm sessions succeeded, failed, or aborted.

### Learning Engine

Responsibilities:

- Extract evidence-backed learning signals from traces, criteria, tool approvals, drift, review outcomes, and user feedback.
- Store local learning data under `.kryleos/learning`.
- Generate suggest-only recommendations with confidence and evidence references.
- Apply only user-approved recommendations as local hints.
- Suppress rejected recommendation signatures.
- Roll back approved patterns.
- Block secrets and prompt-injection content from learning memory.

### Tool API Gateway

Responsibilities:

- Own built-in, custom skill, and MCP tool definitions.
- Convert common tool definitions into provider-specific schemas.
- Route every model tool call through permission, tier, approval, workspace, and Zero Egress checks.
- Invoke Workspace Sandbox, MCP tools, and approved external integrations.
- Write redacted invocation records.
- Sanitize tool output before it returns to the model or UI.
- Provide tool search/deferred loading for large catalogs where supported.

### Workspace Sandbox

Responsibilities:

- Resolve paths.
- Enforce workspace boundary.
- Allow whitelisted multi-repo roots.
- Read/write/list/search files.
- Run approved commands.
- Track child processes.
- Provide Git helpers.
- Provide review diffs and safe revert.
- Implement local file, Git, command, test, build, and code-intelligence tool handlers.

### MCP Client Manager

Responsibilities:

- Connect to local stdio MCP servers.
- Connect to remote Streamable HTTP or SSE MCP servers.
- Discover tools and expose them to the Tool API Gateway.
- Enforce per-server allowlists, denylists, trust status, token references, and disable/revoke behavior.
- Treat MCP output as untrusted evidence, never as direct instruction.

### Companion Hub

Responsibilities:

- Generate short-lived pairing code and pairing secret.
- Register paired devices with public keys.
- Reconnect devices with device tokens.
- Verify signed device messages.
- Broadcast session updates.
- Route remote approve/reject/stop/start actions.
- Stream telemetry.
- Revoke devices.

### Web Companion

Responsibilities:

- Product, pricing, planning draft, demo, account preview.
- Connect to desktop companion where configured.
- Avoid privileged local backend credentials.

### Mobile Companion

Responsibilities:

- Pair with desktop.
- Store device identity securely.
- Show Today/session state.
- Sign remote actions.
- Capture offline notes.

## Network Topology

Default local API:

```text
127.0.0.1:3001 preferred, random loopback fallback if unavailable
```

Default companion channel:

```text
127.0.0.1:3002/api/companion/ws
```

The Electron main process owns backend launch, readiness checks, and active port handoff to the renderer. The renderer must not assume a fixed backend port after restart.

Companion can be bound to LAN/Tailscale only by explicit configuration. Pairing secret endpoints must remain loopback-only.

## Authentication Boundary

- Desktop renderer sends `X-Kryleos-Session` local secret for local API calls.
- The session secret is generated by Electron main and delivered only through the typed preload bridge.
- Backend rejects missing/invalid local session headers when required.
- Header comparison uses timing-safe equality.
- `/health` returns only non-sensitive readiness/version information.
- Webhooks are exempt from local session but must verify provider signatures outside mock development.
- Companion clients use pairing code/secret and signed device messages, not desktop admin session credentials.

## Logging and Observability Baseline

- Use structured JSON logs from Phase 0.
- Redact provider keys, pairing secrets, tokens, command secrets, credential references, and full private file contents.
- Store logs locally with rotation and a future export sanitizer.
- Capture startup, backend readiness, backend restarts, active port, storage lock decisions, command approvals, tool approvals, aborts, and crash diagnostics.
- Preload or backend boot failure must show a diagnostic screen instead of a blank window.

## Data Flow: Plan Item Execution

```text
Flow task Execute
  -> server validates task and blockers
  -> orchestrator selects specialist or starts native swarm
  -> sandbox activates assigned workspace
  -> agent streams output
  -> provider emits native tool call or fallback text action
  -> Tool API Gateway validates schema, policy, and scope
  -> approval required for write/execute/network/admin tools
  -> tool runs or is rejected
  -> files/Git evidence captured
  -> trace created
  -> criteria evaluated
  -> user confirms status update
  -> drift optionally reruns
  -> learning engine proposes evidence-backed recommendations
```

## Data Flow: Mobile Approval

```text
Desktop proposes command
  -> backend creates commandId
  -> companion hub signs approval request
  -> mobile verifies desktop signature
  -> user approves/rejects
  -> mobile signs response with device key
  -> companion hub verifies signature, nonce, timestamp
  -> orchestrator resumes or rejects command
```

## Provider Routing

Provider clients:

- Ollama.
- DeepSeek.
- Gemini.
- OpenAI.
- Anthropic.
- OpenRouter.

Routing rules:

- Zero Egress on: only Ollama/local providers allowed.
- Zero Egress off: hosted providers allowed after disclosure.
- Tool-capable hosted providers should use native tool/function calls.
- OpenAI tool-capable workflows should use the Responses API.
- Chat Completions and parsed text actions are compatibility fallbacks.
- Provider adapters must expose streaming, structured output, tool-call, and error capability flags.
- Provider adapters must define retry, timeout, rate-limit, and streaming-normalization behavior before production use.
- Provider health checks should be lightweight.
- Cost estimation should use provider/model pricing where available.

## Deployment Model

Primary deployment is desktop app packaging. Web/mobile are companions and do not replace desktop.

Beta packaging priorities:

1. Windows desktop.
2. Web companion build.
3. Expo mobile build path.
4. macOS/Linux desktop after Windows path is stable.

## Architectural Anti-Patterns to Avoid

- Do not let UI components own domain rules.
- Do not let the agent write outside sandbox.
- Do not let any model, MCP server, or custom skill bypass the Tool API Gateway.
- Do not use text-parsed action blocks as the primary tool execution path when provider-native tools are available.
- Do not make Ruflo or any external swarm framework a hard dependency for core execution.
- Do not let learning mutate prompts, tools, policies, agents, credentials, or billing without explicit user approval.
- Do not use raw plan prose as drift source of truth.
- Do not hide simulator/mock states.
- Do not let companion clients access admin REST credentials.
- Do not mix marketing demo state with production workspace state.
- Do not make billing state client-authoritative.
