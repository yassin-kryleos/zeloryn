# Project Brief

## Product Name

**Kryleos Forge**

## Product Category

AI project execution tool — manages the full loop from implementation plan to Kanban board to agent-driven code execution.

## Short Description

Kryleos Forge is the only AI coding tool that manages your project from plan to board to execution. Define what you're building, track it on a Kanban board, execute with AI agents, and watch your plan close against real code changes — all in a local-first desktop app.

## Primary Goals

- Own the project-level execution loop — **the Build Loop**: PLAN (AI-assisted ideation) → CREW (specialist agent refinement) → FLOW (Kanban board) → FORGE (agent code execution) → verified completion.
- Make the connection between a plan item and a code change visible and automatic through execution tracing with AI-generated acceptance criteria.
- Detect when a codebase has drifted from its plan and surface the gap without the user having to check manually.
- Support multi-repo and multi-workspace projects so founders and teams can plan across an entire product, not just a single file or repo.
- Open with a project-setup experience so the user's first action is defining what they're building, not typing into a chat box.
- Support model choice across hosted and local providers (BYOK + Ollama).
- Support repeatable workflows through custom agents, workspace skills, and CREW specialist personas.
- Keep the product identity aligned with the Kryleos app family.

## Target Users

- Solo developers and technical founders building multi-file, multi-repo products who need more than a per-file AI assistant.
- Builders who have a plan (a doc, a PRD, a checklist) and want to track execution against it without switching between tools.
- Developers who want to know whether their code matches their plan — not just whether it compiles.
- Power users who want configurable AI agents and skills tied to their project context.
- Teams that may later need shared sync, history, and workspace conventions.

## Core Value Proposition

Kryleos Forge is the only AI coding tool that operates at the project level — not the file level.

Cursor edits files. Claude Code runs tasks. Codex executes jobs. None of them know what you're building, track whether it's done, or surface the gap between your plan and your code.

Forge does all three: you define the plan, it populates your board, agents execute tasks, and the app shows you which plan items closed against real code changes. The loop from "what I'm building" to "what got built" is visible and automatic.

Supporting capabilities — local-first operation, BYOK model support, Ollama/local models, Zero Egress Mode, custom agents and skills, Git-backed review, multi-LLM provider choice, and cost control — exist to make that loop practical for solo developers and small teams without enterprise budgets.

## Current Product Shape

The current app is a Vite/React/Electron desktop app with a local Express backend. It uses WebSockets for live streaming updates, REST endpoints for file/Git/session operations, and pluggable AI model clients for multiple providers.

The app has four primary spaces (the Build Loop): **PLAN** (AI ideation, Build + Ask modes), **CREW** (specialist agent review), **FLOW** (project management + Today view), **FORGE** (code execution). Chat is not a separate tab — PLAN in Ask mode replaces it.

## In Scope

**Project execution loop (primary identity):**
- Project-setup-first onboarding: the first-run experience opens to a project setup screen, not a chat box. User defines what they're building before anything else.
- Plan→Flow task auto-sync: implementation plan items automatically populate the Kanban board.
- Execution tracing: when an agent run completes, link the result back to the originating plan item — show which files changed, which tests ran, and auto-update item status.
- Plan drift detection: after agent runs and on demand, compare the current codebase state against the active plan and surface items that are complete, in progress, or missing from the code.
- Multi-repo plan scope: a single plan can span multiple workspace directories, with per-repo task assignment visible in the FLOW board and FORGE execution.
- `Send to FORGE Agent` on individual plan items routes the item directly to the multi-agent orchestrator.

**Workspace and execution:**
- Local desktop app shell.
- AI chat and multi-agent orchestration.
- Workspace file browser, preview, edit, create, delete.
- Git status/stage/commit/push/pull helpers.
- Codebase dependency graph.
- Planned coding Preview Deck for files, local app preview, terminal evidence, side chat, artifacts, and review status.
- Project/task Kanban board (FLOW).
- Custom agents and skills stored under `.kryleos/`.
- Community Agent Starter Packs bundled with the app for one-click agent installation.
- Share Agent export via GitHub Gist for community sharing.

**Privacy and model support:**
- Zero Egress Mode: server-side local-only enforcement that blocks hosted providers and displays a persistent `[LOCAL ONLY]` badge.
- Model configuration and API key management across DeepSeek, Gemini, OpenAI, Anthropic, OpenRouter, and Ollama.
- BYOK hosted model support.
- Local model support via Ollama.

**Platform:**
- Cursor-compatible workspace rules through `.cursorrules` and `.cursor/rules`.
- User approval gates for AI-proposed shell commands.
- Graceful workflow abort that clears pending approvals and terminates tracked command processes.
- Professional `theme-forge` UI default replacing the Matrix-era green glow aesthetic as the shipped default.
- Optional Google and sync flows.
- Subscription tiers for Free, Solo, Solo Plus, Founder, and Agency/Team.
- Tier-gated sync, backup, docs generation, founder workflows, agency handoff packs, remote execution simulation, team collaboration indicators, and RBAC simulator indicators.
- VS Code extension (deferred to Phase 3+) that connects to the local Forge backend for workspace sync, agent invocation, and review sidebar.

## Out of Scope for the Current Version

- Production-grade full team collaboration beyond current Enterprise simulator indicators.
- Production-grade enterprise role-based access controls beyond current RBAC simulator indicators.
- Hosted cloud IDE.
- Real remote container infrastructure beyond current Pro/Enterprise simulation banners.
- Marketplace for third-party agents/skills.
- Formal billing production integration beyond current mocked subscription mapping.
- Browser-side cryptographic command signing. The reviewed implementation validates the active command ID and user decision over the WebSocket approval flow.
- Full competitor-grade pane layout, autonomous browser control, remote preview tunnels, and multiple interactive terminal PTYs are out of scope until the Preview Deck MVP is stable.

## Latest Reviewed Patch Status

The latest debugging pass reviewed the command approval, graceful interrupt, and workspace rules patch. Production build and automated tests pass for the desktop app. The approval flow now sends the backend-generated `commandId` from the UI, stale approvals are rejected, cancellation uses `approve_command` with `approved: false`, and abort handling rejects pending command approvals while terminating active sandbox child processes.

## Subscription Tiers

Pricing philosophy: users bring their own AI (BYOK + Ollama). Forge charges only for the workflow layer that makes AI useful across a whole project.

- **Free ($0):** full access to all four Build Loop spaces (PLAN, CREW, FLOW, FORGE), local tools, Ollama/local models, BYOK hosted model usage, community agent starter packs. No artificial item caps. No sync, no execution tracing, no drift detection. Manual PLAN→CREW handoff via structured .md export and copy-paste. Single workspace.
- **Solo ($5/mo):** everything Free plus basic execution tracing, PLAN→CREW direct Desktop sync, AI-generated acceptance criteria at plan item creation, basic drift detection (Not Started / In Progress / Complete).
- **Solo Plus ($9/mo):** everything Solo plus full drift detection (Diverged + confidence scoring), trace history, mobile/web PLAN space with Desktop sync.
- **Founder ($15/mo):** everything Solo Plus plus multi-repo plan scope, cross-repo drift detection, "What's Left" summary report, plan versioning, plan item dependencies (blockedBy), agent specialization per plan item.
- **Agency/Team ($39/mo):** everything Founder plus shared plan editing, team trace visibility, per-member execution history, client handoff packs, branded exported docs, collaboration preview indicators, RBAC simulator indicators, priority support.
- **Early Lifetime ($99–$149 one-time):** limited-time early-adopter offer at Solo Plus or Founder level, via Gumroad or Lemon Squeezy. Launches only after the Preview Deck and execution tracing are both working. Not a permanent business model.

## Brand Direction

Use **Kryleos Forge** as the full product name. Use **Forge** only as a short internal/product shorthand when the Kryleos context is clear.

Recommended domain: `forge.kryleos.com`.
