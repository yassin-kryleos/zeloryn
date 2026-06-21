# Quality, Test, and Acceptance Plan

## Test Strategy

The rebuild must test by product risk, not only by code coverage. The highest-risk areas are file access, Tool API execution, command execution, MCP/server integrations, swarm execution, local learning, companion approvals, provider routing, billing gates, and plan/trace correctness.

## Test Layers

### Unit Tests

Cover:

- Path containment.
- Criteria evaluation.
- Drift classification.
- Today scoring.
- CREW parser.
- Trace extraction JSON parser.
- Secret scanner.
- Tier gate helpers.
- Provider routing.
- Provider capability detection.
- Tool schema validation.
- Tool approval policy resolution.
- Tool output sanitization.
- Redaction helpers.
- Command classification.
- Atomic storage writes.
- Storage lock validation and stale-lock handling.
- Local session token validation.
- IPC payload validation.
- Swarm lane planner.
- Learning signal extraction.
- Learning recommendation signatures.
- Learning approval/rejection/rollback helpers.

### Integration Tests

Cover:

- Project setup to workspace persistence.
- Electron main to backend supervisor startup.
- Backend readiness and port broker handoff.
- Authenticated renderer call to local backend.
- Plan item extraction to Plan Workspace.
- CREW push to FLOW.
- FLOW Execute to FORGE context payload.
- Provider-native tool call to Tool API invocation.
- Text action fallback to Tool API invocation.
- MCP server add/test/discover/allowlist/disable.
- Tool invocation audit log redaction.
- Command approval approve/reject/abort.
- Trace creation and status suggestion.
- Swarm session lifecycle and trace metadata.
- Learning recommendation generation from traces and approvals.
- Drift run with cached LLM decisions.
- Git review current/status/stage/revert.
- Billing webhook verification paths.
- Companion pairing and signed approval.

### E2E Tests

Cover:

- First-run setup.
- Electron boot, preload bridge, and authenticated health smoke.
- Existing project bootstrap.
- PLAN to CREW to FLOW to FORGE happy path.
- Rejected command recovery.
- Stop workflow recovery.
- Zero Egress model blocking.
- Mobile/web companion smoke where feasible.
- Preview Deck tabs render.

### Security Tests

Cover:

- Local session required.
- Local session token not exposed through health or companion routes.
- Electron denies untrusted navigation and unsafe window opening.
- Renderer cannot access Node APIs directly.
- Workspace traversal blocked.
- Symlink escape blocked.
- Stale command ID rejected.
- Companion unsigned actions rejected.
- Companion replay nonce rejected.
- Expired pairing code rejected.
- Device revocation blocks reconnect.
- Hosted provider blocked in Zero Egress.
- Webhook signature required in production-like env.
- Generated docs with secrets are blocked.
- Tool invocation with invalid schema is blocked.
- Disabled MCP server cannot be invoked.
- MCP token references are never exposed in route responses/logs.
- Local stdio MCP discovery requires explicit trust/approval before process launch.
- Custom script skills cannot execute outside declared permission and approval policy.
- External tool prompt-injection content cannot trigger follow-up actions without approval.
- Zero Egress blocks remote MCP and network tools involving workspace data.
- Swarm workers cannot bypass Tool API approval or workspace containment.
- Learning memory rejects secret-bearing content.
- Learning recommendations do not apply until approved.

### Accessibility Tests

Cover:

- Keyboard navigation.
- Dialog focus.
- Approval modal labels.
- Color contrast.
- Mobile tap targets.
- No text overlap at common breakpoints.

### Performance Tests

Cover:

- Startup time.
- Workspace scan bounded on large repos.
- File tree lazy loading.
- Drift run budget/defer behavior.
- WebSocket stream responsiveness.
- Large diff rendering.

## Phase Acceptance Matrix

### Phase 0 Acceptance

- Desktop app boots with Electron security baseline enabled.
- Renderer communicates with backend only through typed preload APIs.
- Backend exposes `/health` with status/version only.
- Local API rejects missing or invalid `X-Kryleos-Session`.
- Backend supervisor restarts after safe crash and stops after bounded retries.
- Main-process broker updates renderer when backend port changes.
- `.kryleos` storage writes use atomic write helpers.
- Storage lock includes PID, hostname, and process start token.
- Ambiguous stale locks fail closed with a diagnostic.
- Structured logs are redacted and rotated locally.
- Preload/backend crash shows diagnostic screen, not blank window.
- CI includes install, typecheck, lint, unit tests, and Electron smoke.

### Phase 1 Acceptance

- Create/select project works.
- File tools constrained to workspace.
- Git status loads.
- Encrypted DB created.
- Provider config saves without plaintext localStorage.
- Existing-project bootstrap respects `.gitignore`, max file size, binary detection, cancellation, and progress reporting.

### Phase 2 Acceptance

- Scratchbook persists.
- Summarize and Push creates review modal.
- Plan Workspace persists confirmed items.
- Feasibility check stores verdict.
- Markdown export includes all selected items.

### Phase 3 Acceptance

- CREW personas run.
- Structured output parser extracts item blocks.
- Push to FLOW shows accurate diff.
- Confirm mutates tasks; cancel does not.

### Phase 4 Acceptance

- Today shows 3-5 tasks.
- Blockers disable execution.
- Criteria editor saves.
- Execute sends correct task context.

### Phase 5a Acceptance

- Agent streams updates.
- Tool registry lists built-in tools with JSON schemas.
- Agent uses the Tool API Gateway for file, Git, command, and test tools.
- Tool invocation log records redacted arguments, approval decision, status, and summary.
- Command approval blocks execution.
- Reject does not run command.
- Abort kills active command and clears state.
- Text action fallback validates against registered schemas and policies.

### Phase 5b Acceptance

- OpenAI Responses API or another hosted provider completes one native tool-call round trip.
- Anthropic or Gemini native tool/function path is covered where configured.
- Ollama/local fallback validates text actions against registered schemas.
- Provider capability matrix covers streaming, structured output, native tool calls, retries, rate limits, timeouts, and errors.
- Zero Egress blocks hosted provider calls.

### Phase 5c Acceptance

- MCP server can be added, tested, discovered, allowlisted, invoked, and disabled.
- Local stdio MCP discovery requires explicit trust/approval before launch.
- Disabled MCP server cannot be invoked.
- MCP credential references are never exposed to model context, renderer responses, or logs.
- Custom script skills declare permissions and execute only through Tool API policy.
- External/MCP prompt-injection content is sanitized or quoted before model reuse.
- Zero Egress blocks disallowed network and remote MCP calls.

### Phase 5d Acceptance

- Symbol search, references, AST search, and dependency graph tools return bounded workspace-scoped evidence.
- Test/build/package tools require command approval and capture exit codes.
- Log tools redact secrets before display or model reuse.
- Bootstrap indexing respects `.gitignore`, size limits, binary detection, cancellation, and progress reporting.

### Phase 6 Acceptance

- Trace is stored after run.
- Criteria are evaluated.
- Drift report classifies items.
- What's Left respects tier limit.
- Complete suggestion requires confirmation.

### Phase 6.5 Acceptance

- Swarm lane planner selects coordinator, builder, reviewer, and relevant conditional lanes.
- `Run with Swarm` starts a persisted swarm session.
- Stop workflow aborts active lanes and marks the session aborted.
- Swarm trace groups lane evidence.
- Learning signals are created only from evidence-backed events.
- Pending recommendations require approve/reject.
- Approved patterns affect future prompts only as local hints.
- Rejected recommendations do not repeat by signature.
- Rollback disables approved patterns.
- Zero Egress blocks cloud/cross-user learning.

### Phase 7 Acceptance

- Review shows Git changes.
- Review status persists.
- Safe revert works.
- Preview Deck panes render and do not bypass approval.
- GitHub PR/checks/actions Preview integration cannot bypass Tool API permissions.
- Sentry evidence import is labeled Preview and treated as untrusted tool output.

### Phase 8 Acceptance

- Mobile pairs.
- Signed approval works.
- Unsigned approval fails.
- Offline notes sync after pairing.
- Device revoke blocks action.

### Phase 9 Acceptance

- Checkout starts for selected provider.
- Webhooks update tier only after verification.
- Client cannot forge paid tier.
- Upgrade UX appears at locked actions.

## Release Gates

Before beta:

- Typecheck passes.
- Unit tests pass.
- Integration tests pass.
- E2E smoke passes.
- Security suite passes.
- Packaged app launches.
- No plaintext secrets in localStorage.
- No known unlabeled simulator/mock claims.
- Install guide validated on a clean machine.

## Manual QA Checklist

- New project flow.
- Existing project bootstrap.
- Ollama-only offline flow.
- Hosted provider disclosure.
- Zero Egress.
- Plan extraction.
- CREW review.
- Flow Today.
- Forge command approval.
- Stop workflow.
- Git review.
- Drift check.
- Mobile pairing.
- Billing gate.
- Docs export secret scan.
