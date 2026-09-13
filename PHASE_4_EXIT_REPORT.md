## Exit Report — Phase 4: Generalize agent execution

### Changes made
- **`Desktop-app/src/backend/cliAgentRunner.ts`** [NEW]: Extracted and established the pluggable `CliAgentRunner` architecture:
  - Defined standard interfaces: `CliAgentRunner`, `CliAgentCapabilities`, `CliAgentRunOptions`, `CliAgentResult`, and `CliAgentToolUse`.
  - Implemented `ClaudeCodeRunner` with capability probing (`supportsThinking`, `supportsStreaming`, `supportsSystemPrompt`, `supportsTools`), structured prompt generation, JSON output extraction, buffered execution (`run`), and live PTY streaming execution (`runPty`).
  - Implemented `CodexCliRunner` preview scaffold supporting OpenAI Codex CLI workflows.
  - Implemented `CliAgentRegistry` providing thread-safe agent runner registration, lookup, enumeration, and active default runner management (`register`, `unregister`, `get`, `has`, `list`, `getDefault`, `setDefault`).
  - Re-exported backward-compatible helpers (`claudeCodeRun`, `findClaudeCodeBinary`, `probeClaudeCapabilities`, etc.) so all legacy invocations remain functional.
- **`Desktop-app/src/backend/claudeCodeRunner.ts`** [MODIFIED]: Converted monolithic Claude Code runner module into a clean, backward-compatible re-export module pointing to `cliAgentRunner.ts`.
- **`Desktop-app/src/backend/terminalManager.ts`** [MODIFIED]: Extended PTY session capabilities for agent execution:
  - Updated `TerminalSession` interface to allow nullable WebSocket instances (`ws: WebSocket | null`) for headless or agent-driven sessions.
  - Implemented `createAgentSession(opts: CreateAgentSessionOptions): TerminalSession` allowing agent runners to spawn live streaming PTY sessions with custom command, arguments, environment variables, initial prompt inputs, and real-time chunk interception callbacks.
  - Added null-safety checks on `session.ws` across command blocking and rejection paths.
- **`Desktop-app/src/backend/toolApiGateway.ts`** [NEW]: Implemented centralized Tool API Gateway per `docs/17-tool-api-mcp-provider-integration.md` and `docs/08-agent-and-planning-engine.md`:
  - Defined `ToolDefinition`, `ToolInvocation`, and `ToolExecutionContext`.
  - Implemented permission level classification (`read`, `write`, `execute`, `network`, `admin`).
  - Implemented approval policy engine supporting policies (`never`, `on_write`, `on_execute`, `always`) and automated destructive command detection (`rm -rf`, `git reset --hard`, `mkfs`, `DROP TABLE`, etc.).
  - Implemented Zero Egress validation (`zeroEgressAllowed: false` tools are blocked and audited when `zeroEgressMode: true`).
  - Implemented sensitive parameter redaction (`api_key`, `token`, `secret`, `password`, `authorization`) and persistent JSONL audit trail logging to `.kryleos/tool-invocations.jsonl`.
  - Registered built-in workspace tools (`file.read`, `file.write`, `file.apply_patch`, `file.list`, `file.search`, `git.status`, `command.run`, `code.semantic_index`) delegating to `WorkspaceSandbox`.
  - Added LLM provider schema formatters (`toOpenAiSchema`, `toAnthropicSchema`, `toGeminiSchema`).
- **`Desktop-app/src/backend/mcpClient.ts`** [NEW]: Implemented Model Context Protocol (MCP) client supporting stdio and remote HTTP/SSE:
  - Created `MCPServerConfig`, `MCPTransport` abstraction, `StdioMCPTransport`, and `HttpMCPTransport`.
  - Enforced local stdio workspace trust gating: stdio servers require `workspaceTrust: 'trusted'` before spawning child processes; untrusted workspaces are tagged with `discoveryStatus: 'requires_trust'` and process spawning is blocked.
  - Implemented JSON-RPC 2.0 protocol support (`initialize`, `tools/list`, `tools/call`).
  - Created `MCPClientManager` with server registration, dynamic tool discovery, allow/deny tool filtering, schema adaptation, and registration into `ToolApiGateway` with `zeroEgressAllowed: false`.
- **`Desktop-app/src/backend/server.ts`** [MODIFIED]: Integrated registry, gateway, and MCP client into the backend server:
  - Exposed REST API endpoints:
    - `GET /api/tools`: list registered tools and execution schemas.
    - `POST /api/tools/invoke`: invoke tool with permission, zero egress, and approval checks.
    - `GET /api/mcp/servers`: list configured MCP servers.
    - `POST /api/mcp/servers`: register new stdio or HTTP MCP server.
    - `POST /api/mcp/servers/:id/discover`: trigger tool discovery and register into Tool API Gateway.
    - `DELETE /api/mcp/servers/:id`: disconnect and remove MCP server.
  - Updated `remoteClaudeCodeRunner` to invoke `cliAgentRegistry.getDefault().runPty` using `terminalManager`.
  - Updated WebSocket handler for `execute` messages: when `runner === 'claude-code'` or `cliAgentRegistry.has(runner)` or `useClaudeCode`, delegates execution to `runner.runPty` with live PTY streaming (`terminal_data`), companion updates, and live UI streaming updates (`update` with `streamingContent`).
  - Wired `globalZeroEgressMode` to the `/api/tools/invoke` endpoint.
- **`Desktop-app/src/backend/ccDeviationService.ts`** [MODIFIED]: Fixed Linux git diff parsing and path resolution:
  - Updated `parseUnifiedDiff` regex to accept generic git diff prefixes (`diff --git \S+\/(.*) \S+\/(.*)`) in addition to standard `a/`/`b/` (Git uses mnemonic prefixes on Linux).
  - Ensured reliable path and deviation tracking on Unix platforms.
- **`Desktop-app/src/backend/__tests__/ccDeviationService.test.ts`** [MODIFIED]: Fixed test temp directory isolation (`os.tmpdir()`) to prevent git from resolving the outer `Kryleos-Forge` git repo and handled untracked file inclusion in test snapshots.
- **`Desktop-app/src/backend/__tests__/cliAgentRunner.test.ts`** [NEW]: Unit tests covering `CliAgentRegistry` (registration, lookups, fallback, listing), `ClaudeCodeRunner` capability probing, command building, and `CodexCliRunner` stub (9 tests).
- **`Desktop-app/src/backend/__tests__/toolApiGateway.test.ts`** [NEW]: Unit tests covering tool registration, permission checks (`read`, `write`, `execute`), approval policies (`always`, `on_write`, `destructive command detection`), Zero Egress blocking, secret redaction in audit logs, and schema conversions for OpenAI, Anthropic, and Gemini (14 tests).
- **`Desktop-app/src/backend/__tests__/mcpClient.test.ts`** [NEW]: Unit tests covering MCP client manager server lifecycle, workspace trust gating (stdio blocked if untrusted), allow/deny tool filtering, and tool registration into Tool API Gateway (6 tests).

---

### Deviations from plan
None. All Phase 4 requirements from `docs/open-sorce-startegy.md` were implemented as specified:
1. `CliAgentRunner` pluggable interface and `CliAgentRegistry` implemented with Claude Code as default.
2. Claude Code transitioned from buffered `execFile` to live PTY session streaming via `terminalManager`.
3. Tool API Gateway and MCP Client (stdio + HTTP) implemented with permissions, approval policies, Zero Egress gating, and JSONL audit logging.
4. Pre-existing test failures in `ccDeviationService.test.ts` resolved, bringing the Desktop-app test suite to 100% passing.

---

### Tests run
1. **Desktop App Backend Unit Tests (New Phase 4 Tests)**:
   - `npx vitest run src/backend/__tests__/cliAgentRunner.test.ts` → **Pass** (9/9 tests passed).
   - `npx vitest run src/backend/__tests__/toolApiGateway.test.ts` → **Pass** (14/14 tests passed).
   - `npx vitest run src/backend/__tests__/mcpClient.test.ts` → **Pass** (6/6 tests passed).
2. **Desktop App Full Test Suite**:
   - `npm test` in `Desktop-app` → **Pass** (55 test files passed, 1 skipped, 499 tests passed, 0 failures).
3. **Desktop App TypeScript Build & Packaging**:
   - `npm run build` in `Desktop-app` (`tsc -b && vite build && esbuild src/backend/server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist-backend/server.cjs`) → **Pass** (0 TypeScript errors, bundle complete).
4. **Web App Test Suite**:
   - `npm test` in `Web-app` → **Pass** (3 test files passed, 17 tests passed).
5. **Mobile App Test Suite & Typecheck**:
   - `npm test` in `Mobile-app` → **Pass** (5 test files passed, 46 tests passed).
   - `npx tsc --noEmit` in `Mobile-app` → **Pass** (0 TypeScript errors).

---

### Known gaps / follow-ups
1. **Phase 5 PM-Workflow Enhancements**:
   - Preview Deck multi-PTY live preview pane polish deferred to Phase 5 per strategy.
   - VS Code extension live verification deferred to Phase 5 per strategy.
   - Dependency-aware scheduling, worktree isolation per card, and exportable audit trail deferred to Phase 5.
   - Remote mobile companion access via user-configured tunnels (Tailscale / Cloudflare Tunnel) deferred to Phase 5.
2. **Additional Agent Runner Implementations**:
   - `GeminiCliRunner` and `AiderRunner` can now be registered directly into `cliAgentRegistry` using the `CliAgentRunner` interface when needed.

---

### Verification needed from reviewer
1. **Verify Pluggable Agent Architecture**:
   - Review [cliAgentRunner.ts](file:///home/yassin/Kryleos-Projects/Kryleos-Forge/Desktop-app/src/backend/cliAgentRunner.ts) and [claudeCodeRunner.ts](file:///home/yassin/Kryleos-Projects/Kryleos-Forge/Desktop-app/src/backend/claudeCodeRunner.ts).
   - Confirm third-party terminal agent registration via `cliAgentRegistry.register(...)` satisfies project architecture goals.
2. **Verify PTY Live Streaming**:
   - Review `createAgentSession` in [terminalManager.ts](file:///home/yassin/Kryleos-Projects/Kryleos-Forge/Desktop-app/src/backend/terminalManager.ts) and the execution handler in [server.ts](file:///home/yassin/Kryleos-Projects/Kryleos-Forge/Desktop-app/src/backend/server.ts#L670-L750).
   - Confirm terminal output streams in real-time to both xterm.js (`terminal_data`) and chat/companion streams (`update` with `streamingContent`).
3. **Verify Tool API Gateway & MCP Client**:
   - Review [toolApiGateway.ts](file:///home/yassin/Kryleos-Projects/Kryleos-Forge/Desktop-app/src/backend/toolApiGateway.ts) and [mcpClient.ts](file:///home/yassin/Kryleos-Projects/Kryleos-Forge/Desktop-app/src/backend/mcpClient.ts).
   - Confirm permission levels (`read`, `write`, `execute`, `network`, `admin`), approval policies, Zero Egress blocking, and stdio workspace trust gating.
4. **Preserved Security Boundaries**:
   - Confirm `LOCAL_SESSION_SECRET`, companion pairing (`COMPANION_AUTH_TOKEN`, `/api/companion/pairing-code`, `companionHub`), and `OS_FINGERPRINT` remain intact and untouched.
