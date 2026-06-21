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
- Swarm lane planner.
- Learning signal extraction.
- Learning recommendation signatures.
- Learning approval/rejection/rollback helpers.

### Integration Tests

Cover:

- Project setup to workspace persistence.
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

### Phase 1 Acceptance

- Create/select project works.
- File tools constrained to workspace.
- Git status loads.
- Encrypted DB created.
- Provider config saves without plaintext localStorage.

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

### Phase 5 Acceptance

- Agent streams updates.
- Tool registry lists built-in tools with JSON schemas.
- Agent uses the Tool API Gateway for file, Git, command, and test tools.
- OpenAI Responses API or another hosted provider completes one native tool-call round trip.
- Anthropic or Gemini native tool/function path is covered where configured.
- Ollama/local fallback validates text actions against registered schemas.
- MCP server can be added, tested, discovered, allowlisted, invoked, and disabled.
- Tool invocation log records redacted arguments, approval decision, status, and summary.
- Command approval blocks execution.
- Reject does not run command.
- Abort kills active command and clears state.
- Zero Egress blocks hosted provider calls.
- Zero Egress blocks disallowed network and remote MCP calls.

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
