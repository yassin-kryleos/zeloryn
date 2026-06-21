# Codex Review and Iteration Workflow

## Purpose

This document defines how ChatGPT/Codex should review Antigravity 2.0 implementation work and help test Kryleos Forge phase by phase.

## Collaboration Model

Use this loop for every implementation phase:

```text
Antigravity implements phase slice
  -> Codex reviews diff against docs
  -> Codex runs tests and targeted manual checks
  -> Codex writes findings
  -> Antigravity fixes
  -> Codex verifies
  -> phase is accepted or blocked
```

## Codex Review Responsibilities

Codex should check:

- Whether implementation matches the relevant docs.
- Whether the feature preserves the product core.
- Whether domain rules are in services/shared logic rather than scattered in UI.
- Whether security boundaries are enforced server-side.
- Whether all model-callable actions pass through the Tool API Gateway.
- Whether provider-native tool calls, MCP tools, custom skills, and fallback text actions share the same schema/approval/audit path.
- Whether MCP servers are disabled/allowlisted and cannot bypass workspace or Zero Egress policy.
- Whether swarm workers cannot bypass Tool API, workspace, approval, blocker, or Zero Egress policy.
- Whether learning remains suggest-only, local-only, evidence-backed, and reversible.
- Whether tier gates cannot be bypassed client-side.
- Whether tests cover the risky behavior.
- Whether simulator/mock/preview features are labeled.
- Whether existing documented features were accidentally removed.

## Review Inputs

For each review, provide Codex:

- Current branch/diff.
- Phase name from `11-implementation-roadmap.md`.
- Any Antigravity notes.
- Known failing tests.
- Screenshots or reproduction steps if UI-related.

Codex should compare implementation against:

- `02-product-requirements.md`
- `05-system-architecture.md`
- `06-data-model-and-storage.md`
- `07-api-and-event-contracts.md`
- `08-agent-and-planning-engine.md`
- `09-security-privacy-threat-model.md`
- `12-quality-test-and-acceptance-plan.md`
- `15-feature-inventory-and-preservation-checklist.md`

## Review Output Format

Codex should lead with findings:

```text
Findings
- [P0] Blocking correctness/security issue...
- [P1] Major product or regression issue...
- [P2] Important but non-blocking issue...

Test Results
- Command: ...
- Result: pass/fail

Acceptance Decision
- Accepted / Accepted with follow-up / Blocked
```

## Severity Guide

P0:

- Workspace escape.
- Unauthorized command execution.
- Secrets stored or exposed.
- Zero Egress bypass.
- Tool API bypass.
- MCP server bypasses permissions or leaks tokens.
- Tool output prompt injection can trigger write/execute/network/admin actions.
- Swarm worker bypasses approval or workspace containment.
- Learning recommendation mutates behavior without approval.
- Secret-bearing or prompt-injected content enters learning memory.
- Companion unsigned approval accepted.
- Billing gate bypass.
- Data loss.

P1:

- Build Loop state mutation without user confirmation.
- Plan/trace/drift broken.
- Command reject/abort unrecoverable.
- Major tier gate mismatch.
- Packaged app cannot launch.

P2:

- Missing labels.
- Incomplete tests.
- UX friction that does not block core flow.
- Performance issue with workaround.

P3:

- Copy, minor layout, naming, or cleanup.

## Phase Acceptance Rules

Codex should accept a phase only when:

- Phase acceptance criteria in `12-quality-test-and-acceptance-plan.md` pass.
- No P0 or P1 findings remain.
- Any P2 findings are documented and assigned.
- Tests relevant to the phase pass.
- Manual smoke path works.

## Required Regression Focus by Phase

Phase 1:

- Workspace containment.
- Encrypted local DB.
- Project setup.
- File tools.

Phase 2:

- Scratchbook does not auto-mutate Plan Workspace.
- User confirmation before saving plan items.
- Bootstrap scan and export.

Phase 3:

- CREW parser.
- Diff confirmation.
- Starter packs.

Phase 4:

- Today scoring.
- Blocker enforcement.
- Task execution context.

Phase 5:

- Tool API Gateway.
- Tool schema validation.
- Provider-native tool calls.
- Text action fallback policy.
- MCP add/test/discover/allowlist/disable.
- Tool audit log redaction.
- Command approval.
- Abort.
- Provider disclosure.
- Zero Egress.

Phase 6:

- Criteria evaluation.
- Trace storage.
- Drift classification.
- What's Left tier limits.

Phase 6.5:

- Swarm lane planning.
- Swarm timeline.
- Swarm stop/abort.
- Swarm trace metadata.
- Learning signal extraction.
- Learning recommendation approve/reject/rollback.
- Learning secret scan and Zero Egress.

Phase 7:

- Git review.
- Safe revert.
- Preview Deck approval safety.
- GitHub PR/checks/actions Preview integration.
- Sentry evidence import trust labeling.

Phase 8:

- Pairing.
- Signed companion actions.
- Device revoke.
- Offline note sync.

Phase 9:

- Billing webhooks.
- License validation.
- Server-side tier gates.

Phase 10:

- Secret scanning.
- Founder/Agency gates.
- Export correctness.

## Manual Smoke Script

Use this smoke script before declaring beta readiness:

1. Launch desktop app.
2. Create a new project.
3. Configure Ollama or hosted provider.
4. Add project description.
5. Generate Plan Workspace item.
6. Push through CREW.
7. Push to FLOW.
8. Execute from Today.
9. Approve one safe command.
10. Reject one proposed command.
11. Stop one active workflow.
12. Review changed files.
13. Confirm trace.
14. Run drift.
15. Pair mobile.
16. Approve/reject from mobile.
17. Enable Zero Egress and verify hosted calls are blocked.
