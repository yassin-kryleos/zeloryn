# API and Integrations

## 1. API Style

The local backend exposes REST endpoints for normal commands and WebSocket events for streaming chat/agent state.

Base local URL during development:

```text
http://localhost:3001
```

## 2. WebSocket

Endpoint:

```text
ws://localhost:3001
```

Primary message types:

- `config` - sends active API keys, model, workspace, sync token, and custom instructions.
- `query` - sends user text, active space, and session ID.
- `update` - streams logs, checklists, active agent, and streaming content back to UI.
- `status` - backend status updates.
- `error` - backend error messages.
- `sync_update` - sync broadcast for matching active account token.
- `command_approval_required` - backend event that sends a pending shell command, tool name, and generated command ID to the UI.
- `approve_command` - resumes or rejects a paused orchestrator after the user responds to a pending shell command.
- `abort_execution` - aborts active streaming/agent execution and terminates active command child processes.
- Enterprise WebSocket state also checks connection authorization levels for collaboration indicators and peer counts.

### Command Approval Messages

Approval payload:

```json
{
  "type": "approve_command",
  "approved": true,
  "commandId": "cmd_123"
}
```

Reject payload:

```json
{
  "type": "approve_command",
  "approved": false,
  "commandId": "cmd_123"
}
```

Abort payload:

```json
{
  "type": "abort_execution"
}
```

The backend rejects stale approvals when the command ID does not match the active pending command. The reviewed implementation does not require a browser-generated cryptographic signature for this WebSocket flow.

## 3. Session Routes

```text
GET /api/sessions?space={space}
GET /api/sessions/:id
DELETE /api/sessions/:id
```

Used for listing, loading, and deleting persisted chat sessions.

## 4. Workspace Routes

```text
GET /api/workspace
POST /api/workspace
POST /api/workspace/revert
GET /api/workspace/graph
```

Used for workspace discovery, changing workspace root, reverting file snapshots, and loading graph data.

Workspace instruction loading also scans `.cursorrules` and `.cursor/rules` from the workspace root and appends compatible rule contents to agent system instructions.

## 5. File Routes

```text
GET /api/files?path={path}
GET /api/files/content?path={path}
POST /api/files/create
POST /api/files/save
DELETE /api/files?path={path}
```

Used by the file browser and factory panels.

## 6. Git Routes

```text
GET /api/git/status
POST /api/git/stage
POST /api/git/commit
POST /api/git/remote
POST /api/git/push
POST /api/git/pull
```

Used for common source-control workflows.

## 7. Credential Routes

```text
GET /api/credentials
POST /api/credentials
```

Stores and retrieves provider credentials and related configuration. Production releases should migrate this to OS-level secure storage.

## 8. Auth and Sync Routes

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/subscribe
POST /api/sync/push
GET /api/sync/pull
```

Used for current account, subscription, and sync simulation flows.

Tier behavior:

- Free users are blocked from cross-device sync and PLAN→CREW direct sync.
- Solo users unlock WebSocket-powered state synchronization, automated backups, and PLAN→CREW direct Desktop sync.
- Solo Plus users inherit Solo behavior and unlock cross-device PLAN sync (mobile/web → Desktop).
- Founder users inherit Solo Plus behavior and unlock multi-repo plan scope, plan item dependencies, and unlimited What's Left reports.
- Agency/Team users inherit Founder behavior and unlock collaboration/RBAC simulator indicators.
- `/api/auth/subscribe` currently mocks checkout/subscription mapping and toggles active tier state dynamically.

## 9. Google Routes

```text
GET /api/google/auth-url
GET /api/google/callback
GET /api/google/status
POST /api/google/sync
POST /api/google/import-folder
```

Used for Google authorization and Drive import/export.

## 10. Artifact Routes

```text
POST /api/artifacts/publish
```

Publishes a selected file as a GitHub Gist when supported.

Planned Preview Deck artifact routes:

```text
GET /api/artifacts
GET /api/artifacts/content?path={path}
```

These should list and preview generated workspace artifacts such as Markdown, text, HTML, and future Docs Autopilot outputs.

## 11. Build Loop — Planning and Execution Routes

### Acceptance Criteria Routes

```text
POST  /api/plan/items/:id/criteria       — Phase 1: generate abstract criteria at item creation
PATCH /api/plan/items/:id/criteria       — Phase 2: enrich criteria with real file paths (after workspace scan)
GET   /api/plan/items/:id/criteria       — retrieve criteria for a plan item
```

### Execution Trace Routes

```text
POST /api/traces                         — create a trace record after an agent run
GET  /api/traces/:itemId                 — retrieve all traces for a plan item
```

### Plan Drift Routes

```text
GET /api/plan/drift                      — run drift detection across all plan items (evaluates criteria against codebase)
```

Drift detection runs entirely on local codebase signals. No external API calls. Classifies each item as: Complete / In Progress / Not Started / Diverged / Needs Review. Diverged uses a targeted LLM call (criterion + code diff). Gate: full report is Founder+ only; per-item classification is available from Solo.

### What's Left Route

```text
GET /api/plan/whats-left                 — return AI-prioritized list of unresolved items (tier-gated: Free=5, Solo=25, Solo Plus=50, Founder=unlimited)
```

### PLAN→CREW Handoff Routes

```text
GET  /api/plan/export                    — export PLAN as structured .md (Free tier)
POST /api/crew/sync                      — push PLAN content directly to CREW space (Solo+ only, blocked server-side for Free)
```

### GitHub Issues Integration (Phase 3)

```text
GET /api/integrations/github/issues      — list importable GitHub issues (requires OAuth)
POST /api/integrations/github/import     — import selected issues as plan items with AI-generated criteria
```

### WebSocket — New Build Loop Message Types

Additional WebSocket messages beyond the existing set:

- `criteria_enriched` — backend notifies frontend that Phase 2 criteria enrichment is available for user review (payload: `planItemId`, `enrichedCriteria[]`).
- `trace_complete` — backend notifies frontend that an execution trace is ready (payload: `traceId`, `planItemId`, `allCriteriaPassed`).
- `drift_result` — backend streams per-item drift classification during a drift detection run.

## 13. Planned Preview Routes

The planned coding Preview Deck may need these local routes:

```text
GET /api/preview/servers
POST /api/preview/server/start
POST /api/preview/server/stop
```

Expected behavior:

- `GET /api/preview/servers` returns detected local dev-server candidates from common ports, package scripts, and recent terminal logs where possible.
- `POST /api/preview/server/start` should not silently execute commands. It must route server-start commands through the existing command approval model.
- `POST /api/preview/server/stop` should stop only processes started or tracked by Kryleos Forge.
- The Preview Deck should also allow user-entered local URLs without requiring backend server management.

Security notes:

- Treat previewed pages as untrusted content.
- Do not expose model keys, sync tokens, or workspace secrets to preview contexts.
- Browser automation/clicking is not part of the MVP route design.

## 12. Model Providers

Supported provider modules:

- DeepSeek
- Gemini
- OpenAI
- Anthropic
- OpenRouter
- Ollama

Free-tier users can use Ollama and bring-your-own-key hosted model access. Paid tiers do not change provider availability; they unlock sync, backup, execution, and collaboration feature gates.

## 14. Tier-Gated Integration Map

| Feature | Tier | Backend | Frontend |
|---|---|---|---|
| Collaboration Preview | Agency/Team | WebSocket authorization-level checks. | Peer count indicators and cloud sync logs in `CoworkSpace.tsx`. |
| RBAC Simulator | Agency/Team | User schema and push permission checks in `sync.ts`. | OWNER/role indicators in Crew dashboard surfaces. |
| Hosted Cloud IDE Simulation | Founder / Agency/Team | WebSocket sync engine linking Electron files. | Google/Apple SSO portal in `ConfigHeader.tsx`. |
| Remote Container Execution Simulation | Founder / Agency/Team (future roadmap) | `runCommand` in `tools.ts` emits tier-aware banners. | Secure shell vs local host execution banners in stdout. |
| Execution Tracing + AI Criteria | Solo+ | `POST /api/traces`, `GET /api/traces/:itemId`, `POST /api/plan/items/:id/criteria`. | Execution trace panel in FORGE, criteria checklist in PLAN. |
| Full Drift Detection (Diverged + confidence) | Solo Plus+ | `GET /api/plan/drift` full classification. | Drift status badges on FLOW board items. |
| Plan Item Dependencies (`blockedBy[]`) | Founder+ | Server-enforces `blockedBy[]` — blocks `Send to FORGE Agent` server-side. | Greyed blocked items in FLOW, dependency indicators. |
| "What's Left" Report | Free=5 / Solo=25 / Solo Plus=50 / Founder=unlimited | `GET /api/plan/whats-left` gated by tier. | What's Left panel in PLAN with tier-appropriate item count. |
| PLAN→CREW Direct Sync | Solo+ | `POST /api/crew/sync` blocked server-side for Free. | Sync button in PLAN toolbar (hidden/disabled for Free). |
| Multi-Repo Plan Scope | Founder+ | Workspace field on plan items, per-workspace sandbox activation. | FLOW board grouped by repo. |
| Agents/Skills Marketplace | All Tiers | File deletion and scanning routes for `.kryleos` and legacy `.matrix` skill/agent folders. | Specialists tab and Workspace Skills Factory. |
| Mock Billing | Premium Tiers | `/api/auth/subscribe` tier mapping. | Dynamic upgrade state and config/database push. |
| Command Approval and Graceful Interrupt | All Tiers | `agents.ts`, `server.ts`, and `tools.ts` pause `runCommand`, validate the active `commandId`, and terminate tracked child processes on abort. | `App.tsx` stores pending command state and `ChatConsole.tsx` renders approval/rejection controls. |
| Preview Deck | All tiers (MVP available to all) | Planned preview/artifact routes plus existing file/review/session logs. Server start/stop must reuse command approval. | Planned right-side deck with Files, Live Preview, Terminal, Side Chat, Artifacts, and Review. |

## 15. Integration Risks

- Hosted model APIs require valid keys and may change models over time.
- Google API OAuth flow requires real production credentials before public release.
- GitHub publishing requires careful handling of tokens and private content.
- Local Ollama requires a running local service.
- Billing, hosted IDE, remote container execution, team collaboration, and RBAC are currently simulated/mocked unless backed by production services.
- Embedded preview pages and public URLs are untrusted and must not receive secrets or privileged local backend access.
