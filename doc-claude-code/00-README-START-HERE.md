# Kryleos Forge Development Documentation

## Purpose

This folder is the clean rebuild documentation set for Kryleos Forge. It is written so the app can be rebuilt from scratch in an organized way while preserving the product concept and the feature surface that exists or is already specified.

The current implementation should be treated as reference material, not as the architecture to copy blindly. The intended product is a local-first AI project execution workspace built around the Build Loop:

```text
PLAN -> CREW -> FLOW -> FORGE -> TRACE -> VERIFY -> PLAN
```

## How to Use This Pack

1. Start with this file and `01-product-vision-and-boundaries.md`.
2. Use `02-product-requirements.md` and `15-feature-inventory-and-preservation-checklist.md` to preserve scope.
3. Use `03-user-experience-and-flows.md` and `04-information-architecture.md` before building UI.
4. Use `05-system-architecture.md`, `06-data-model-and-storage.md`, `07-api-and-event-contracts.md`, `08-agent-and-planning-engine.md`, `17-tool-api-mcp-provider-integration.md`, and `18-native-task-swarm-and-suggest-only-learning.md` before writing backend, agent, provider, tool, swarm, or learning code.
5. Use `09-security-privacy-threat-model.md` as a blocking reference for any file, command, model, sync, companion, or billing work.
6. Use `11-implementation-roadmap.md` as the phased build order.
7. Use `12-quality-test-and-acceptance-plan.md` before marking any phase complete.
8. Use `13-deployment-operations-runbook.md` for packaging, release, and local deployment.
9. Give `14-antigravity-2-build-brief.md` to Antigravity 2.0 as the coding handoff.

## Document Map

- `01-product-vision-and-boundaries.md` - product identity, core thesis, target users, and hard boundaries.
- `02-product-requirements.md` - functional and non-functional requirements.
- `03-user-experience-and-flows.md` - first-run, existing-project bootstrap, Build Loop, mobile, web, and review flows.
- `04-information-architecture.md` - app surfaces, navigation model, UI states, and feature status labeling.
- `05-system-architecture.md` - runtime topology and service boundaries.
- `06-data-model-and-storage.md` - data entities, local storage paths, and persistence rules.
- `07-api-and-event-contracts.md` - REST, WebSocket, companion, billing, planning, and provider contracts.
- `08-agent-and-planning-engine.md` - orchestration, plan items, criteria, traces, drift, and specialist routing.
- `09-security-privacy-threat-model.md` - security posture, threat model, privacy rules, and controls.
- `10-monetization-tiers-and-gating.md` - pricing, tier gates, billing states, and upgrade UX.
- `11-implementation-roadmap.md` - phased rebuild plan with dependencies and done criteria.
- `12-quality-test-and-acceptance-plan.md` - test strategy, regression checks, release gates, and acceptance matrix.
- `13-deployment-operations-runbook.md` - environment, build, packaging, release, rollback, and support operations.
- `14-antigravity-2-build-brief.md` - implementation prompt and guardrails for Antigravity 2.0.
- `15-feature-inventory-and-preservation-checklist.md` - feature preservation checklist from the current project state.
- `16-codex-review-and-iteration-workflow.md` - Codex review and testing workflow after Antigravity implementation.
- `17-tool-api-mcp-provider-integration.md` - unified Tool API, MCP, native provider tool calling, and high-value developer integrations.
- `18-native-task-swarm-and-suggest-only-learning.md` - native task swarm orchestration and local suggest-only self-learning.

## Rebuild Principle

Rebuild the product around stable domain contracts first, then implement screens and services against those contracts. Do not start by copying current UI component structure. The current app mixed product definition, simulations, planning, agent execution, billing, and companion surfaces too early; the rebuild should separate them into clear layers.

## Canonical Product Terms

- Product name: Kryleos Forge.
- Short name: Forge, only when Kryleos context is clear.
- Primary loop: Build Loop.
- Main spaces: Plan, Crew, Flow, Forge.
- Product URL: `forge.kryleos.com`.
- Local workspace folder: user-selected project root.
- Internal workspace metadata folder: `.kryleos`.

## Current Scope Position

Target first production-quality milestone: `0.1.0-beta.1` invited beta.

Production-ready for beta:

- Local desktop workspace.
- Plan, Crew, Flow, Forge loop.
- Local file and Git tools.
- Unified Tool API registry.
- MCP server/client integration.
- Native provider tool/function calling.
- Native task swarm orchestration.
- Suggest-only local self-learning from traces and review evidence.
- Model provider configuration.
- Ollama/local model support.
- Command approval and workflow abort.
- Git-backed review.
- Execution traces and drift detection at beta quality.
- Mobile companion pairing and approvals at beta quality.

Explicitly not production infrastructure yet:

- Full enterprise collaboration.
- Real RBAC enforcement across organizations.
- Hosted cloud IDE.
- Real remote container execution.
- Public marketplace.
- Full production billing automation unless explicitly implemented and tested.
