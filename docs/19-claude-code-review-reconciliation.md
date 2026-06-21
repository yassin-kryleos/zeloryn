# Claude Code Review Reconciliation

## Purpose

This document records how the Claude Code review addendum in `doc-claude-code/gstack-findings.md` was reconciled into the canonical `/docs` source of truth.

The addendum is useful review evidence, but it is not the source of truth by itself. The canonical development documents remain the Markdown files in `/docs`.

## Comparison Result

- Every overlapping file in `doc-claude-code/` matched the corresponding `/docs` file before reconciliation.
- The only added document was `gstack-findings.md`.
- The addendum contained valuable Phase 0 and Phase 5 architecture review findings.
- Several findings were marked `FIXED` in the addendum, but the canonical docs had not yet incorporated them.
- The addendum had encoding damage in rendered arrows/checkmarks, so it should not be handed to implementation agents as a polished build document.

## Merged Decisions

The following decisions have been merged into `/docs`:

- Harden Phase 0 before product surfaces expand.
- Use Electron with strict security defaults from the first milestone.
- Generate a per-session local API capability token in Electron main and deliver it only through typed preload APIs.
- Keep `/health` minimal and free of session details.
- Add backend supervisor, readiness checks, bounded restart behavior, and main-process port broker.
- Allow random loopback backend port fallback when the preferred port is unavailable.
- Add `.kryleos` schema versioning, atomic writes, fsync where supported, and PID/hostname/start-token lock files.
- Add structured local logs with redaction, rotation, and future export sanitization.
- Enrich `AcceptanceCriterion` with priority, confidence, timeout, flake status, and evaluator version.
- Enrich `ExecutionTrace` with git SHAs, command results, approval IDs, tool invocation IDs, token/cost metadata, and trace version.
- Split the former large Phase 5 into smaller vertical phases:
  - Phase 5a: Tool API Gateway and minimal FORGE execution.
  - Phase 5b: Provider adapters and native tool calling.
  - Phase 5c: MCP and custom skill governance.
  - Phase 5d: Code intelligence and developer tool depth.
- Treat local stdio MCP discovery as executable-code launch that requires explicit trust/approval.
- Treat custom script skills as executable tools with permission manifests and approval policy.
- Add Phase 0 Electron smoke, storage, auth, supervisor, logging, and diagnostic acceptance tests.

## Updated Canonical Files

- `05-system-architecture.md`
- `06-data-model-and-storage.md`
- `07-api-and-event-contracts.md`
- `09-security-privacy-threat-model.md`
- `11-implementation-roadmap.md`
- `12-quality-test-and-acceptance-plan.md`
- `13-deployment-operations-runbook.md`
- `14-antigravity-2-build-brief.md`
- `17-tool-api-mcp-provider-integration.md`

## Deferred Items

These items remain important but should be refined during the relevant phase:

- Detailed migration runner behavior after real `.kryleos` data exists.
- Exact provider retry/rate-limit constants per provider.
- Full custom skill sandbox implementation strategy.
- Final log retention duration defaults for beta versus production.
- Public/private repository and license policy.
- Long-term mobile companion timeline after Phase 8.

## Handoff Rule

Implementation agents should read `/docs` as canonical. `doc-claude-code/gstack-findings.md` may be used as historical review evidence, but not as a separate implementation spec.
