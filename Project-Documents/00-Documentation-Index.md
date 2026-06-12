# Kryleos Forge Documentation Index

This folder contains the working project documentation for Kryleos Forge.

Kryleos Forge is a desktop AI project execution tool that manages the full **Build Loop**: PLAN → CREW → FLOW → FORGE. Users define what they're building in PLAN, refine it with specialist agent personas in CREW, manage execution on the FLOW Kanban board, and run AI agents in FORGE — with execution tracing, acceptance criteria, and plan drift detection connecting every step back to the original plan. Local-first, BYOK, multi-repo capable.

## Document Map

- `01-Project-Brief.md` - concise project identity, goals, users, and product scope.
- `02-Product-Requirements.md` - functional and non-functional requirements.
- `03-System-Architecture.md` - high-level architecture and runtime topology.
- `04-Technical-Design.md` - implementation design across frontend, backend, agents, and tools.
- `05-API-and-Integrations.md` - REST/WebSocket routes and third-party integrations.
- `06-Data-and-Storage.md` - app state, local files, sessions, sync data, and storage concerns.
- `07-Security-and-Privacy.md` - key handling, workspace access, execution risks, and mitigations.
- `08-Test-Plan.md` - verification strategy and regression checklist.
- `09-Operations-and-Release.md` - development, build, release, and troubleshooting notes.
- `10-Roadmap-and-Backlog.md` - future improvements and prioritization.
- `11-Subscription-and-Feature-Tiers.md` - subscription plans, gated features, and implementation mapping.
- `12-Developer-Workflow-Safety.md` - command approvals, rules overrides, graceful interrupts, and sandbox permission UX.
- `13-Growth-and-Pricing-Strategy.md` - market positioning, pricing ladder, target customers, and revenue strategy.
- `14-Release-Readiness-Implementation-Strategy.md` - phased implementation plan for missing features and release readiness.
- `15-Phase-1-to-10-Implementation-Plan.md` - execution-ready plan, dependencies, tests, milestones, and no-go criteria for phases 1-10.
- `16-Preview-Deck-and-Workspace-Panes.md` - planned coding workspace preview deck inspired by the best file, browser, terminal, side chat, artifact, and review patterns from modern AI coding tools.
- `17-Mobile-Companion.md` - full spec for the native iOS/Android mobile companion: platform, sync model, remote execution trigger, screens, tier gating, technical architecture, and V1 acceptance criteria.
- `18-Codex-Agent-Delegation-Optimization.md` - tactical guide for model tier selection, reasoning intensity, and safe subagent delegation during large engineering projects.
- `User-Guide.md` - user-facing guide for operating the app.
- `Project-Brochure.md` - short product brochure/overview for sharing.

## Maintenance Notes

Update these documents whenever a feature changes user workflows, backend APIs, file formats, sync behavior, security assumptions, or release steps.

Prefer small, factual edits. Keep product naming consistent as **Kryleos Forge** and the canonical product URL as `forge.kryleos.com`.
