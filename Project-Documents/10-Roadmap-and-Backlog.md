# Roadmap and Backlog

## 1. Near-Term Priorities

For the release-focused implementation sequence, see `14-Release-Readiness-Implementation-Strategy.md`.

### Polish and Stability (Phase 2.5 — Sprint 3)

- Add the coding Preview Deck MVP: Files, Live Preview, Terminal evidence, Side Chat, Artifacts, and Review summary.
- Ship `theme-forge` as the default UI theme. Demote `CodeRain` background to an opt-in setting. Clean up tab labels to plain words without bracket/F-key annotation.
- Add Community Agent Starter Packs: bundle at least six pre-built agent definitions and surface them in the CREW space for one-click installation.
- Add three CREW specialist personas: `Technical Reviewer`, `Scope Guard`, `Risk Identifier`. Auto-suggest as a bundle when PLAN→CREW handoff is initiated.
- Add PLAN→CREW handoff actions: Free = structured .md export button in PLAN toolbar. Solo+ = direct sync button sending plan content to CREW without copy-paste.
- Add `Share Agent` Gist export button in the CREW agent management view.
- Add Plan→Flow auto-sync: checklist items from a plan import are offered to the Kanban board automatically.
- Add `Send to FORGE Agent` button on individual plan items in the PLAN space.
- Replace blocking alerts with inline notifications (Phase 1 — done).
- Add loading/error states for all panels.
- Improve visual treatment of command approval, rejection, and abort logs.
- Polish the Git-backed coding Review tab with side-by-side diffs, hunk navigation, clearer verification status, and better large-file handling.

### Build Loop V2 — Project Execution Loop (Phase 2.6 — Sprint 4)

This is the primary differentiator sprint. No competitor delivers this.

- **Chat tab removed:** PLAN absorbs chat via Build mode (spec-building) / Ask mode (ephemeral queries) toggle. Four-tab app: PLAN → CREW → FLOW → FORGE.
- **Two-phase acceptance criteria:** Phase 1 at item creation generates abstract structural criteria (symbol_exists, test_passes, llm_check — no file paths assumed). Phase 2 enriches with concrete file paths after first workspace scan/agent run. User reviews both phases. All tracing and drift evaluates criteria, not raw plan text.
- **CREW→FLOW pipeline:** CREW outputs a structured refined plan document. "Push to FLOW" diffs against existing tasks — user confirms before FLOW updates.
- **Execution tracing:** evaluate acceptance criteria checklist after every agent run, link to originating plan item. Show criteria pass/fail, files changed, commands run. Auto-suggest completion when all pass (user must confirm).
- **Plan drift detection:** Complete / In Progress / Not Started / Diverged / Needs Review based on criteria evaluation. Diverged uses single targeted LLM call. Never silently marks Complete.
- **Plan item dependencies:** `blockedBy[]` array. Blocked items greyed in FLOW. `Send to FORGE Agent` disabled until resolved.
- **Agent specialization + capability fallback routing:** 7 bundled agents (add DevOps Specialist for infra). Capability-map routing hierarchy with visible fallback indicator.
- **"What's Left" summary (tiered):** Free = 5 AI-prioritized items, Solo = 25, Solo Plus = 50, Founder = unlimited + Markdown export.
- **Existing project bootstrap:** workspace scan + guided bootstrap session + free first "What's Left" run — critical for adoption by existing codebases.
- **FLOW Today view:** default landing, 3–5 prioritized tasks, Execute Next / Execute All Today. Mobile companion home screen.
- **Multi-repo plan scope:** workspace field on plan items, FLOW board grouping by repo.
- **Project-setup-first onboarding:** `ProjectSetupScreen.tsx`, first-launch detection, FLOW Today view as default landing.
- **Execution trace persistence:** `.kryleos/traces/` per plan item.

### VS Code Extension (deferred — Phase 3+)

Deferred until the project execution loop is complete and the product identity is established.

- Build `kryleos-forge-vscode` companion extension.
- Workspace sync via POST `/api/workspace` from VS Code open folder.
- `Ask Forge Agent` right-click context menu streaming to VS Code output panel.
- Review sidebar webview polling `/api/review/current` with Accept/Reject controls.
- Backend connection status indicator.
- Package and publish as `.vsix` to VS Code Marketplace.

### Security

- Move secrets to OS secure storage.
- Add Zero Egress Mode toggle: blocks non-Ollama providers, shows `[LOCAL ONLY]` badge, enforced server-side.
- Add one-time data disclosure banner before first non-local provider call.
- Extend command confirmation controls with trust policies, timeout handling, and richer audit history.
- Add secret scanning before sync/publish.
- Add provider data-sharing disclosure.
- Add focused automated WebSocket tests for command approval, stale command IDs, and abort behavior.

### Documentation

- Keep this project documentation current.
- Add screenshots once UI is stable.
- Add a quick-start video/script later.

## 2. Medium-Term Features

### Agent Improvements

- Saved agent templates.
- Workspace-specific agent packs.
- Better action parser validation.
- Agent run summaries.
- User approval gates for high-risk tool calls.
- Command approval history and reusable trust policies.
- Ctrl+C-style keyboard shortcut for graceful workflow interrupt.
- Browser-side command approval signing or a documented decision to keep the simpler local WebSocket approval model.

### Skills Improvements

- Skill metadata files.
- Skill input schemas.
- Skill execution logs.
- Skill enable/disable controls.
- Skill marketplace concept under Kryleos.

### Workspace Improvements

- Upgrade the Review tab beyond the implemented Git-backed baseline with side-by-side diff mode, inline review notes, commit grouping, and hosted PR integration.
- Build Preview Deck slices in order: deck shell, local URL preview, terminal evidence pane, side chat, artifacts pane, review summary.
- Add local dev-server detection and approval-gated start/stop controls.
- Search across file content and symbols.
- Safer bulk file operations.
- Better code graph clustering.
- Project indexing cache.
- Autocomplete for `@` file mentions, commands, skills, agents, and workspace symbols.
- Richer `.cursorrules` and `.cursor/rules` parsing/precedence UI.

### Sync Improvements

- Real user authentication.
- Encrypted cloud sync.
- Device list and session management.
- Selective sync categories.

### Billing and Tier Improvements

- Launch Early Lifetime deal ($99–$149 one-time) via Gumroad or Lemon Squeezy — **only after Preview Deck and execution tracing are both working**. Do not launch paid tiers before execution tracing is functional.
- Replace mocked checkout with production Stripe billing.
- Add subscription webhooks.
- Add billing portal and cancellation flow.
- Add tier audit logs.
- Add server-side feature entitlement checks.
- Tier model is now: Free/Solo ($5)/Solo Plus ($9)/Founder ($15)/Agency/Team ($39). Replace all remaining Free/Basic/Pro/Enterprise references in mocked billing flows.

### Enterprise Improvements

- Replace RBAC indicators with enforced permissions.
- Add organization/team management.
- Add invitations and member lifecycle.
- Add audit logs for team actions.
- Replace collaboration indicators with real team presence and shared session behavior.

### Remote Execution Improvements

- Replace remote execution simulation with real isolated containers.
- Add execution environment selection.
- Add command policies by tier.
- Add workspace snapshotting for remote runs.

## 3. Long-Term Vision

The long-term vision is a project execution platform, not a chat interface with file tools.

- **Plan versioning and history:** track how a plan evolved across the project lifecycle, with diffs between plan versions and the code that was shipped.
- **Automated progress reports:** generate a weekly summary of what plan items closed, what drifted, and what was skipped — from execution traces, not manual input.
- **Team plan coordination:** multiple developers working from the same plan, with task assignment, conflict detection, and merge coordination built in.
- **GitHub Issues integration (Phase 3, V1 — import only):** import GitHub issues as plan items, preserve issue IDs, AI generate acceptance criteria from issue bodies, optional comment-back on plan item completion. OAuth required. No bi-directional sync in V1.
- **Linear integration (Phase 5–6):** same import-only pattern. Bi-directional sync in V2.
- **GitHub/GitLab PR integration (Phase 8+):** plan items linked to PRs. Closing a PR auto-progresses plan items. Opening a PR generates a summary from execution traces.
- **Notion/Jira integration (Phase 8+):** import-only V1. Bi-directional V2.
- **Community plan templates:** shareable project plan structures for common app types (SaaS, mobile, API, CLI tool) so new projects start with a plan, not a blank chat.
- **VS Code extension V1** (Phase 2.7/M4) with workspace sync, `Ask Forge Agent`, and review sidebar.
- **VS Code extension V2:** inline plan item indicators in the editor showing which lines of code relate to which plan items.
- **JetBrains extension** following the same backend-bridge architecture.
- Kryleos app-family integration.
- Hosted optional companion service for sync and mobile monitoring.
- Community agent pack registry and sharing platform.
- Local model-first privacy mode (Zero Egress Mode already implemented in Phase 6).

**Offline scope (for clarity):**
- Desktop + Ollama: full offline PLAN ideation and FORGE execution. Supported.
- Mobile offline: PLAN note-taking and prompt queuing only. LLM execution requires connectivity. Out of scope for mobile offline coding.

## 4. Backlog Ideas

- Command palette.
- Drag-and-drop pane layout after the Preview Deck MVP is stable.
- Full interactive terminal PTY with lifecycle controls.
- Browser preview session persistence for selected local apps.
- Rich artifact previews for PDFs, images, videos, spreadsheets, and slides.
- Keyboard shortcut editor.
- Conversation export.
- PR description generator.
- Changelog generator.
- Dependency risk scanner.
- Test coverage assistant.
- Architecture diagram generator.
- In-app documentation browser.

## 5. Known Technical Debt

- Some internal CSS/localStorage names still use legacy lowercase `matrix` naming for compatibility.
- Several backend features need production-grade security hardening.
- Current auth/sync implementation should be treated as prototype-level until replaced.
- Current billing, remote execution, Hosted Cloud IDE, team collaboration, and RBAC behavior should be treated as simulated or mocked until production infrastructure exists.
- Current coding Review tab is Git-backed and persistent for local workspace review, but it is not yet a full pull-request or multi-reviewer code review system.
- The Preview Deck is planned. Current file preview, graph preview, and review preview are separate surfaces and should not be marketed as a unified Codex/Claude/Antigravity-style pane system yet.
- Command approvals and abort handling need broader automated WebSocket and child-process tests.
- Latest reviewed implementation already includes baseline command ID validation and active child process termination.
- Existing generated Word docs under `Desktop-app/docs` are legacy artifacts and may not match the current Kryleos Forge docs.
