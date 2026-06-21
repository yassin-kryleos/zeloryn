# Implementation Roadmap

## Rebuild Strategy

Build domain contracts first, then screens, then advanced workflows. Keep each phase shippable and testable. Avoid starting with a large all-in-one UI rewrite.

## Phase 0 - Repository Reset and Architecture Skeleton

Goal: create a clean app foundation.

Deliverables:

- Monorepo layout confirmed.
- Locked Node/package-manager version.
- Desktop app shell.
- Electron security baseline: `contextIsolation`, `nodeIntegration: false`, restrictive production CSP, IPC validation, blocked untrusted navigation, gated external URL opening.
- Local backend.
- Backend supervisor with readiness checks, stderr capture, child PID tracking, and bounded exponential-backoff restart.
- Main-process broker for backend port handoff.
- Shared types package or shared folder.
- Test runners configured.
- Formatting/linting configured.
- Local session auth baseline.
- Minimal `/health` endpoint that returns status/version only.
- `.kryleos` storage helpers with schema version, atomic writes, fsync where supported, and PID/hostname/start-token lock file.
- Structured local logs with redaction defaults.
- Preload/backend crash diagnostic screen.
- Electron smoke test in CI.

Done when:

- Desktop app launches.
- Backend starts.
- Renderer can call authenticated health endpoint.
- Backend restart preserves renderer connectivity through the main-process broker.
- Storage lock and atomic write tests pass.
- CI runs install, typecheck, lint, unit tests, and Electron smoke test.

## Phase 1 - Project Setup and Workspace Core

Deliverables:

- Project setup screen.
- Project manager.
- Workspace selection.
- Workspace boundary sandbox.
- File list/read/write.
- Git status.
- Local encrypted session DB.
- Provider config shell.

Done when:

- User can create/select project.
- User can browse and edit files inside workspace.
- Attempts outside workspace are rejected.

## Phase 2 - PLAN

Deliverables:

- Scratchbook sessions.
- Plan Workspace storage.
- Summarize and Push extraction.
- Feasibility check.
- Markdown export.
- Existing codebase bootstrap scan.

Done when:

- Chat never auto-mutates plan.
- User-reviewed items persist.
- Bootstrap produces fingerprint and proposed items.

## Phase 3 - CREW

Deliverables:

- Bundled personas.
- Structured review output.
- CREW item parser.
- Push to Flow diff.
- Starter agent pack install.
- Custom agents/skills read/write.

Done when:

- Plan items can be reviewed and pushed to Flow with confirmation.

## Phase 4 - FLOW

Deliverables:

- Today view.
- Kanban.
- Task detail.
- Criteria editor.
- Blockers.
- Category/workspace assignment.
- Break down/estimate actions.

Done when:

- Returning users land in Today.
- Blocked tasks cannot be executed.
- Tasks can be sent to FORGE.

## Phase 5a - Tool API Gateway and Minimal FORGE Execution

Deliverables:

- Tool API Gateway.
- Typed tool registry with JSON schemas.
- Tool approval and redacted audit log.
- Agent orchestrator.
- Workspace rules loading.
- File tools including apply patch.
- Git helpers.
- Command approval.
- Abort handling.
- Response modes.
- At least one provider path wired through the gateway for a simple file/read/write task.

Done when:

- Agent can execute a simple task safely.
- Agent execution uses the Tool API Gateway for file, Git, and command tools.
- Tool invocation log records redacted approvals, arguments, and outcomes.
- Commands pause for approval.
- Reject/abort paths recover.
- Text action fallback validates against the same schemas and policies.

## Phase 5b - Provider Adapters and Native Tool Calling

Deliverables:

- Provider clients.
- Provider capability detection.
- Provider capability matrix with streaming, structured output, native tool calls, retries, rate limits, timeout behavior, and error normalization.
- OpenAI Responses API adapter for tool-capable flows.
- Anthropic/Gemini native tool adapter path.
- Ollama/OpenRouter/DeepSeek native-or-fallback tool path.
- Hosted provider disclosure.
- Zero Egress backend enforcement.

Done when:

- At least one hosted provider uses native tool/function calls end to end.
- Local/Ollama fallback validates actions through the Tool API Gateway.
- Provider streaming, retry, timeout, and error behavior are covered by contract tests.
- Hosted provider disclosure appears before first hosted use.
- Zero Egress blocks hosted calls.

## Phase 5c - MCP and Custom Skill Governance

Deliverables:

- MCP trust model for local stdio process discovery.
- MCP client manager for local stdio and remote HTTP/SSE servers.
- MCP server add/test/discover/allowlist/disable flows.
- MCP credential references and token redaction.
- Custom skill permission declarations and sandbox policy.
- Tool output prompt-injection scan for external/MCP output.
- HTTP/API, browser/Playwright, log, and read-only DB tools behind permission policies.

Done when:

- MCP server can be added, discovered, allowlisted, invoked, and disabled.
- Local stdio MCP discovery does not launch untrusted commands without explicit user trust/approval.
- Disabled MCP servers cannot be invoked.
- MCP token references are never exposed to models, renderer responses, or logs.
- Prompt-injection content from external/MCP output cannot trigger follow-up actions without approval.
- Zero Egress blocks disallowed network and remote MCP calls.

## Phase 5d - Code Intelligence and Developer Tool Depth

Deliverables:

- Code intelligence tools: symbol search, references, AST search, dependency graph.
- Test/build/package tools.
- Log readers with redaction.
- Workspace bootstrap indexing budgets for max file size, `.gitignore`, binary detection, cancellation, and progress.
- Package-manager and framework fingerprinting.

Done when:

- Code intelligence tools return bounded, redacted, workspace-scoped evidence.
- Existing-codebase bootstrap respects `.gitignore`, size limits, binary exclusions, and cancellation.
- Test/build/package tools require command approval and produce trace evidence.

## Phase 6 - Trace and Drift

Deliverables:

- Criteria generation.
- Criteria enrichment.
- Trace extraction.
- Trace storage.
- Drift classification.
- What's Left report.
- User-confirmed auto-complete.

Done when:

- A FORGE run creates a trace.
- Drift report classifies tasks from criteria.
- Completion suggestions require confirmation.

## Phase 6.5 - Native Task Swarm and Suggest-Only Learning

Deliverables:

- Native Swarm Orchestrator.
- Deterministic lane planner.
- `Run with Swarm` Flow action.
- Swarm timeline in Forge.
- Swarm trace metadata and grouped lane evidence.
- Stop/abort behavior for active swarm sessions.
- Learning Engine.
- Local learning signal extraction.
- Learning Review recommendations.
- Approve/reject/rollback recommendation flow.
- Approved local learning hints for future prompts.

Done when:

- Swarm runs reuse Tool API, workspace, command approval, blocker, and Zero Egress enforcement.
- Swarm sessions and lane records persist under `.kryleos/swarm`.
- Traces can reference swarm session and lane evidence.
- Learning signals and recommendations persist under `.kryleos/learning`.
- Recommendations do not affect future behavior until approved.
- Rejected recommendations do not repeat by signature.
- Rollback disables approved learning patterns.
- Learning remains local-only.

## Phase 7 - Review and Preview Deck

Deliverables:

- Git-backed review panel.
- Persistent review statuses.
- Safe revert.
- Preview Deck tabs.
- Live preview URL.
- Terminal evidence.
- Side chat.
- Artifacts.
- Review summary.
- Preview GitHub Pull Request, Checks, and Actions integration through the Tool API.
- Preview Sentry issue/event evidence import through the Tool API.

Done when:

- User can inspect changed files and evidence without leaving Forge.
- External evidence is clearly labeled Preview and cannot bypass Tool API approval or Zero Egress.

## Phase 8 - Companion Channels

Deliverables:

- Companion WebSocket server.
- Pairing code/secret.
- Device registry.
- Signed mobile actions.
- Session update broadcast.
- Mobile Today and approvals.
- Offline note queue.
- Web companion pairing/planning sync.

Done when:

- Mobile pairs securely.
- Mobile approves/rejects command with signatures.
- Offline notes sync to desktop.

## Phase 9 - Billing, Sync, and Tier Gates

Deliverables:

- Entitlement model.
- Stripe checkout/webhooks.
- Razorpay checkout/webhooks.
- License key flow.
- Server-side feature gates.
- Sync preview.
- Upgrade UX.

Done when:

- Tier gates cannot be bypassed client-side.
- Billing webhooks are verified in non-mock environments.

## Phase 10 - Founder/Agency Workflows

Deliverables:

- Founder docs/workflows.
- Agency export workflows.
- Secret scan before write/export.
- Branded docs.
- Client handoff pack.

Done when:

- Workflows are gated and secret-scanned.

## Phase 11 - QA Hardening and Beta Packaging

Deliverables:

- E2E tests.
- Accessibility tests.
- Security regression suite.
- Packaged app QA.
- Release notes.
- Install guide.
- Rollback guide.

Done when:

- Release gate checklist passes.
- Windows beta package is installable.
- Known simulator/mock features are labeled.

## Later Phases

- VS Code extension.
- GitHub Issues import.
- Linear import.
- Production team collaboration.
- Production RBAC.
- Real remote containers.
- Public marketplace.
- Hosted cloud IDE.
