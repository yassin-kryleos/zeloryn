# Release Readiness Implementation Strategy

## 1. Purpose

This document defines the implementation strategy for turning Kryleos Forge from a strong personal/prototype app into a release-ready product in a category it can own.

The goal is not to match market leaders feature-for-feature. The goal is to ship the only AI coding tool that manages a project from plan to board to execution — through the **Build Loop** (PLAN → CREW → FLOW → FORGE) — and make that loop so clear and useful that the product sells itself.

For the execution-ready build plan with phase dependencies, sprint order, tests, milestones, and no-go criteria, see `15-Phase-1-to-10-Implementation-Plan.md`.

Primary commercial target:

```text
$2k-$3k/month early MRR
```

Primary product promise:

> The only AI coding tool that manages your project — from plan to board to execution — not just your current file.

**Target launch window: 1–2 months.** Claude Code adding persistent project memory (estimated 6–12 months out) is a race condition that erodes PLAN's differentiator. Ship fast. Lock in early adopters. The durable moat after that window is the visual Build Loop (CREW + FLOW + criteria tracing) — not PLAN alone.

**Mobile companion phasing:** the mobile companion (native iOS/Android, async sync V1, relay-based remote execution trigger) ships as a public beta 4–6 weeks **after** Desktop V1. Do not block the Desktop launch on mobile. Mobile spec: `17-Mobile-Companion.md`.

## 2. Current Reality

Kryleos Forge already has useful foundations:

- Electron desktop shell.
- React frontend.
- Local Express backend.
- WebSocket streaming.
- Multi-agent orchestration.
- Workspace file tools.
- Git helper routes.
- Project board.
- Code graph.
- Git-backed Coding Review tab for working/staged diffs, persistent review status, risk notes, command/test evidence, file preview, stage/unstage, and safe revert.
- Custom local agents and skills.
- Command approval and graceful abort.
- Response modes.
- Voice input MVP.
- Web and Mobile companion MVPs.
- Project documentation folder.

However, the app is not release-ready yet.

The biggest gaps are:

- Simulated features now have initial Desktop/Web/Mobile preview, simulator, or mock labels, but public copy still needs a full release sweep.
- Web and Mobile are companions, not full products.
- Billing is mocked.
- Sync/auth are prototype-level.
- Secure credential storage is not production-grade.
- Docs Autopilot is not yet a polished product workflow.
- Cost Guard is not yet a full user-visible system.
- The coding workspace does not yet have a unified Preview Deck for files, local app preview, terminal evidence, side chat, artifacts, and review status.
- Local model setup needs to be smoother.
- Tests need broader coverage around release-critical flows.
- Onboarding and first-run experience need polish.

## 3. Release Strategy

The release strategy should be phased.

Do not try to implement every imagined enterprise feature before release. Release should focus on the Solo and Solo Plus value proposition first.

Recommended sequence:

1. Stabilize and polish Desktop.
2. Make feature claims honest.
3. Add the coding Preview Deck and workspace panes.
4. Build Docs Autopilot.
5. Build Cost Guard.
6. Improve local model setup.
7. Harden safety/security basics.
8. Make Mobile/Web companion flows reliable.
9. Add Founder workflow templates.
10. Add billing, packaging, launch assets, and support workflows.

## 4. Phase 1 - Desktop Stability and Trust

### Goal

Make the Desktop app stable enough that a solo developer can use it daily without feeling like they are operating a prototype.

### Implementation Work

- Remove or fix corrupted/mojibake UI text.
- Replace blocking `alert()` calls with inline notifications or toast-style status messages.
- Current Phase 1 progress includes shared desktop toasts and alert replacement in the App shell, File Browser, coding Review tab, Config Header, Cowork Space, and Planning Screen.
- Current Phase 1 progress also includes inline confirmation for workspace skill deletion and Review revert actions.
- Current Phase 1 progress includes clearer terminal/log messages for command approval, user rejection, stale approval blocking, and workflow abort outcomes.
- Add loading, empty, error, and offline states for major surfaces.
- Make command approval, rejection, and abort logs visually clear.
- Add and polish a coding Review tab similar in spirit to Codex/Claude review previews:
  - show Git working and staged file diffs,
  - persist accept/reject/reverted/staged review status,
  - show command/build/test evidence,
  - show risk notes,
  - support file preview,
  - support stage/unstage,
  - support Git restore for tracked files,
  - move reverted untracked files into `.kryleos/reverted/`.
- Keep simulated features labeled as Preview or Simulator.
- Make `npm.cmd run build`, `npm.cmd test`, and `npm.cmd run lint` pass without errors.
- Reduce lint config relaxations over time by fixing real code issues instead of hiding them permanently.
- Review public copy for old Matrix-era branding and replace with Kryleos Forge naming.

### Acceptance Criteria

- Desktop build passes.
- Desktop tests pass.
- Lint has no errors.
- No obvious corrupted text appears in primary screens.
- User can open a workspace, chat, inspect files, run a command with approval, and abort safely.
- User can inspect Git working/staged changes in the Review tab before considering the workflow complete.

## 5. Phase 2 - Honest Feature Packaging

### Goal

Prevent user trust damage by making all simulated features explicit.

### Implementation Work

- Create a single feature status map in code:
  - `production`
  - `preview`
  - `simulator`
  - `mock`
  - `planned`
- Current Phase 2 progress includes `Desktop-app/src/shared/featureStatus.ts` and `Desktop-app/src/components/FeatureBadge.tsx`.
- Current Phase 2 progress applies shared badges to Desktop subscription, account sync, collaboration, RBAC, billing, and remote container surfaces.
- Web companion pricing, sandbox, settings sync, collaboration, semantic cache, rollback, RBAC, telemetry, keychain, and billing surfaces now include maturity badges.
- Mobile companion sync, collaboration, semantic cache, rollback, RBAC, and account billing surfaces now include maturity badges.
- Keep using the same labels across Desktop, Web, Mobile, docs, and pricing UI.
- Rename user-facing feature claims:
  - Remote Container Execution -> Remote Container Preview.
  - Hosted Cloud IDE -> Cloud IDE Preview.
  - Team Collaboration -> Collaboration Preview.
  - Enterprise RBAC -> RBAC Simulator.
  - Billing Integration -> Mock Billing until Stripe is live.
- Update plan comparison UI to match the Growth and Pricing Strategy.

### Acceptance Criteria

- No UI claims production remote containers, production RBAC, or full production collaboration.
- Subscription and pricing language matches `13-Growth-and-Pricing-Strategy.md`.
- Users can distinguish production features from previews.

## 6. Phase 2.5 - Preview Deck, UI Professionalization, Community Agents, and Plan Sync

### Goal

Make the coding section feel closer to modern AI coding workspaces (file inspection, local app preview, terminal evidence, side chat, artifacts, and review status in one right-side deck), ship UI polish that presents the product professionally to first-time users, and add the community agent and Plan→Flow workflow features that anchor the project-level positioning.

Detailed Preview Deck strategy: `16-Preview-Deck-and-Workspace-Panes.md`.

### Implementation Work

**Preview Deck:**

- Replace the current coding right-side file-only panel with a `PreviewDeck`.
- Keep the existing File Browser as the first tab.
- Add tabs for Files, Live Preview, Terminal, Side Chat, Artifacts, and Review.
- Start with a fixed right-side deck before adding drag-and-drop/dockable pane layout.
- Add Live Preview MVP: user-entered local URL, refresh, open externally, detected dev-server candidates where possible.
- Add Terminal Evidence MVP: command history, stdout/stderr snippets, pending approval state.
- Add Side Chat MVP: context questions that do not derail the main agent workflow; no silent file writes.
- Add Artifacts MVP: generated Markdown/text preview, hooks for Docs Autopilot outputs.
- Add Review summary: changed file count, risk notes, verification evidence, link to the full Review tab.

**UI Professionalization:**

- Ship `theme-forge` as the default UI theme. Keep `theme-matrix` as a user preference toggle.
- `theme-forge` must use a dark background with matrix green as an accent colour for active states, status indicators, and highlights — not as primary body text colour.
- Demote `CodeRain.tsx` from the default background to an opt-in setting.
- Clean up tab labels to four plain words — `Plan`, `Crew`, `Flow`, `Forge` — removing bracket/function-key annotation from the primary visual. Chat tab is removed; PLAN absorbs it via Build/Ask mode toggle. Keyboard shortcut hints may remain as tooltips.
- Add PLAN Build/Ask mode toggle: persistent segmented control at the top of the PLAN input. Build mode = green accent border + "building spec…" label. Ask mode = neutral styling + "ephemeral — won't affect spec" label. Default to Build on every fresh PLAN open.

**Community Agent Starter Packs:**

- Bundle **seven** pre-built agent definitions: `React Expert`, `Security Auditor`, `Test Writer`, `Documentation Writer`, `Performance Reviewer`, `Python Backend Specialist`, `DevOps Specialist`.
- Surface them in the CREW space with one-click install into `.kryleos/agents/`.
- Add a `Share Agent` control that exports the selected agent JSON as a GitHub Gist via `/api/artifacts/publish`.

**Plan→Flow Task Sync:**

- When a user imports a plan via the PLAN space, checklist items parsed from the plan must be automatically offered for population into the FLOW Kanban board.
- Add a `Send to FORGE Agent` button on individual plan items in the PLAN space.

### Acceptance Criteria

- User can open the Preview Deck from the coding workspace.
- Existing file browser behavior remains intact.
- User can preview a local dev URL inside the app.
- User can see terminal evidence and pending command approval state in the deck.
- User can ask a side question without interrupting the active main workflow.
- Generated artifacts can be previewed from the deck.
- Review summary reflects the existing Git-backed review state.
- Unimplemented capabilities are labeled `Preview`, `Planned`, or `Simulator`.
- App ships with `theme-forge` as default and CodeRain disabled by default.
- Tab labels read as plain words without bracket/F-key annotation.
- User can install a community agent starter pack with one click.
- User can share a custom agent as a Gist from inside the app.
- Importing a plan offers its checklist items to the FLOW Kanban board.
- A plan item can be sent directly to the FORGE agent.

### Current V1 Progress

- `theme-forge` is the default, and Matrix Rain is opt-in via the `matrix` theme.
- Primary navigation now uses `Plan`, `Crew`, `Flow`, and `Forge`.
- FORGE now has a Preview Deck with Files, Live Preview, Terminal, Side Chat, Artifacts, and Review tabs.
- Files tab preserves File Browser and Code Graph access.
- Artifacts tab is backed by local artifact listing/content routes.
- CREW includes bundled starter agents and planning personas with one-click install.
- PLAN includes Build/Ask mode and parsed checklist handoff controls for FLOW/FORGE.

## 6b. Phase 2.6 - Planning Layer V2 — Project Execution Loop

### Goal

Build the complete Build Loop capabilities that make Forge the only AI coding tool operating at the project level. This is the primary differentiator sprint — no competitor has this. The VS Code extension sprint that was previously here is deferred to Phase 2.7 because it fights on Cursor's home turf without establishing Forge's own category first.

### Implementation Work

**AI-Generated Acceptance Criteria — Two-Phase (foundation for all tracing and drift):**

- **Phase 1 (at item creation):** generate abstract structural criteria with no file path assumptions — `symbol_exists`, `test_passes`, `llm_check`. Present for user review before saving. Never auto-apply.
- **Phase 2 (on workspace selection):** run background workspace scan and enrich Phase 1 criteria with real file paths (`file_exists: src/auth/LoginForm.tsx`). Surface a non-blocking banner when ready — user reviews diff and bulk-confirms or edits per item. Phase 2 also re-runs after first agent run.
- Store criteria per plan item. All tracing and drift detection evaluates these criteria — not raw plan text.
- New backend routes: `POST /api/plan/items/:id/criteria`, `PATCH /api/plan/items/:id/criteria`, `GET /api/plan/items/:id/criteria`.

**Execution Tracing:**

- When an agent run completes, fire a dedicated post-run structured-output extraction call (separate from the main agent stream). Evaluate structural criteria (`file_exists`, `symbol_exists`, `git_grep`, `test_passes`) with real code/test checks before the call. Use function/tool calling on capable models; `<json>` delimiters with tolerant parsing on others. Result: `ExecutionTrace` JSON with `filesChanged`, `commandsRun`, `criteriaResults[]`, `summary`.
- Store trace under `.kryleos/traces/{timestamp}-{itemId}.json`.
- In the PLAN space, link the trace to its originating plan item: show criteria checklist, files changed, outcome summary, and suggested status.
- Auto-suggest marking the item complete when all criteria pass. Require user confirmation before persisting.
- The Preview Deck Terminal tab must surface the active trace in real time during execution.

**Plan Drift Detection:**

- Implement a `checkPlanDrift()` function that evaluates each item's acceptance criteria against codebase signals and classifies:
  - **Complete:** all criteria pass.
  - **In Progress:** some criteria pass, others fail.
  - **Not Started:** no criteria pass, no traces.
  - **Diverged:** criteria fail in a conflicting way — evaluated with a single targeted LLM call (criterion + code diff). LLM call fires only if at least one structural criterion fails. Results cached per item with git commit hash; unchanged items skipped on re-runs. Max 10 LLM-evaluated items per drift run with "X items deferred" notice.
  - **Needs Review:** low-confidence, insufficient signals.
- Never mark Complete without user confirmation.
- Surface the drift report in the PLAN space with per-item badges and a summary (e.g. "8 complete · 3 in progress · 4 not started · 1 diverged").
- Run drift detection automatically after every agent run that closes a task.
- Expose a manual "Check Plan Drift" button in the PLAN space toolbar.

**Plan Item Dependencies:**

- Add `blockedBy[]` array to the plan item data model.
- Grey blocked items in FLOW. Disable `Send to FORGE Agent` on blocked items.
- Auto-unblock when the blocking item is marked Complete.
- Add UI to view and edit blocker relationships.

**Agent Specialization per Plan Item:**

- AI-tag each plan item with a category at creation: `frontend`, `backend`, `testing`, `security`, `docs`, or `infra`. User can override.
- Route `Send to FORGE Agent` to the specialist agent matching the item's category.

**"What's Left" Summary (Founder tier):**

- Add "What's Left" button in PLAN toolbar, gated to Founder tier.
- Runs full drift evaluation and returns per-item classification with gap detail. Exportable as Markdown.

**Multi-Repo Plan Scope:**

- Allow plan items to carry a `workspace` field referencing a directory path.
- In the PLAN import flow, parse workspace assignments from plan syntax (e.g. `[repo: frontend]`).
- In the FLOW board, group or badge tasks by their workspace assignment.
- When the user sends a plan item to the FORGE agent, activate the item's assigned workspace sandbox for that execution.
- Persist workspace assignments across sessions.

**Project-Setup-First Onboarding:**

- On first launch (no workspace configured, no plan items), open to `ProjectSetupScreen` — not the chat console.
- Four fields only: (1) Project name, (2) Workspace folder picker, (3) "What are you building?" multiline textarea (seeds first Build mode message), (4) model provider inline prompt if no key configured.
- CTA "Start Building" → PLAN Build mode with description pre-loaded.
- No survey fields, GitHub URL prompts, or feature selection — every extra field reduces completion rate.
- Returning users land on FLOW Today view, not PLAN or a chat console.

**Existing Project Bootstrap:**

- Detect existing codebase on workspace selection (README, package files, git log, test dir present).
- Phase 1: workspace scan → project fingerprint shown to user.
- Phase 2: guided PLAN Build mode session — AI generates Phase 1 structural criteria AND evaluates them against the scan (no `llm_check` during bootstrap). Items where all structural criteria pass → "Likely Complete (bootstrap)" badge for user confirmation. Bootstrap scan stored as execution trace.
- Phase 3: free first "What's Left" run regardless of tier, immediately after bootstrap confirmation.

**CREW Structured Output:**

- CREW personas produce `### [ITEM] <title>` Markdown blocks with Status, Category, Changes, and Criteria hint fields.
- "Push to FLOW" matches `[ITEM]` titles to existing FLOW tasks (fuzzy match, ID fallback). Unmatched blocks offered as new tasks. Diff shown before any FLOW state mutates.

**FLOW Today View:**

- Score per item: +10 if in-progress with active trace, +5 if blocker completed in last 24h, +3 × dependency fan-out, +1 × days since creation (capped at 7). Top 3–5 by score appear in Today. No AI call — deterministic, recalculates on every FLOW open.

### Dependencies

- Phase 2.5 (stable backend, Plan→Flow sync) must be complete.
- Agent Orchestrator must accept a `planItemId` context payload and emit a structured result after each run.
- New backend routes required: `POST /api/traces`, `GET /api/traces/:itemId`, `GET /api/plan/drift`.

### Acceptance Criteria

- After an agent run triggered from a plan item, the user sees the trace linked to that item in the PLAN space.
- Drift check correctly classifies at least one item as Complete based on file evidence.
- A plan with multi-repo assignments routes execution to the correct workspace.
- A new user lands on the project setup screen (4-field spec) and reaches PLAN Build mode before any other surface.
- Returning user lands on FLOW Today view.
- Existing codebase user is offered the bootstrap flow and sees a "Likely Complete" item pre-marked after confirmation.
- Phase 2 criteria enrichment banner appears after workspace selection with a diff for review.
- Execution trace extraction uses a dedicated structured-output call — not stream parsing — and persists under `.kryleos/traces/`.
- CREW output uses `[ITEM]` anchor format; "Push to FLOW" shows diff before mutating FLOW.
- FLOW Today view scores items deterministically; top 3–5 appear without AI call.
- "What's Left" for Free tier returns 5 AI-prioritized items with `reason` field from a single LLM call.
- In-app upgrade nudge appears inline at tier gate; license key entry in CONFIG updates tier immediately.

### Current Sprint 1 Status

Phase 2.6 has started with a foundation slice, not the full Build Loop.

Implemented:

- Planning V2 backend service for criteria, traces, and drift checks.
- Build Loop task fields on `ProjectTask`.
- REST routes for criteria, traces, and drift.
- Trace persistence under `.kryleos/traces/`.
- FLOW board upgraded with category, drift, criteria, workspace, blocker, and trace indicators.
- Task execution now sends `planItemId` context so FORGE runs can be traced to FLOW items.
- FLOW criteria review panel for editing, saving, and enriching acceptance criteria.
- Deterministic Phase 2 file criteria enrichment through `POST /api/plan/items/:id/criteria/enrich`.

### Current Sprint 2 Status

Sprint 2 extended the Build Loop from FLOW into PLAN and replaced log-scraping with a model-driven trace extraction.

Implemented:

- PLAN-side **Build Loop** view (segmented toggle alongside the plan draft) driven by `GET /api/plan/drift`.
- PLAN-side **Phase 2 enrichment banner**: detects plan items with abstract Phase 1 criteria but no concrete `file_exists` criterion, batch-enriches via `POST /api/plan/items/:id/criteria/enrich`, and shows a reviewable diff with per-criterion discard through `PATCH /api/plan/items/:id/criteria`.
- PLAN-side **trace cards**: per-item criteria checklist, files changed, commands run, outcome summary, and suggested status, with a user-confirmed "Confirm Complete" action (never auto-completes).
- **Structured post-run extraction call**: `PlanningV2Service.extractTraceWithLLM` fires a dedicated, non-streaming structured-output call after each FORGE run. Structural criteria (`file_exists`, `symbol_exists`, `git_grep`) are evaluated with real code checks first and remain authoritative; the model only refines the summary and resolves criteria left `unknown` (e.g. `test_passes`), grounded in run evidence. Tolerant `<json>`/fenced parsing with deterministic fallback when no client or output is available. Covered by `planningV2.test.ts`.
- **FLOW Today view**: deterministic priority scoring (`src/shared/todayScore.ts`, no AI call) surfaced as a collapsible Today panel at the top of the FLOW board. Score = +10 in-progress with active trace, +5 blocker completed in last 24h, +3 × dependent fan-out, +1 × days since creation (capped at 7); top 5 non-done items. `Execute Next` runs the top unblocked item (traced); `Execute All Today` dispatches the unblocked items as a sequential batch directive. Covered by `todayScore.test.ts`.
- **Dependency editor**: per-task blocker editor in FLOW (Link icon on each card) to view/select which tasks must finish first. Cycle-safe — candidates that would create a circular dependency are disabled (`src/shared/dependencies.ts`, covered by `dependencies.test.ts`). Persists `blockedBy` through the existing task-save path; blocked items stay greyed and non-runnable, and auto-unblock when their blockers complete.
- **`diverged` drift classification**: `checkDrift(client)` runs a single targeted LLM call (`classifyDivergence`) per candidate — non-complete, non-blocked items with at least one failing **structural** criterion (`file_exists`/`symbol_exists`/`git_grep`). Decisions are cached in `.kryleos/drift-cache.json` keyed by git commit hash + criteria signature, so unchanged items are skipped on re-runs; capped at 10 LLM calls per run with `deferred`/`llmEvaluated` counts in the report and a "X diverged / Y deferred" FLOW notice. REST routes reach the configured provider via a module-level `getModelClient()`; falls back to deterministic status when no client/key is available. Covered by `planningV2.test.ts`.

- **"What's Left" report (tiered)**: `PlanningV2Service.whatsLeft(client, limit)` runs drift, then a single LLM call (`prioritizeWhatsLeft`) ranks open items with a one-line reason each; deterministic status-weighted fallback when no client. Tier caps via `GET /api/plan/whats-left?tier=` — free=5, Solo(basic)=25, Solo Plus(pro)=50, Founder(enterprise)=unlimited + Markdown export. Surfaced in the PLAN Build Loop view with an AI-ranked list, tier-cap "N more hidden — upgrade" notice, and a Founder-only `EXPORT MD` download. Covered by `planningV2.test.ts`.

- **AI-generated Phase 1 criteria**: `generateCriteria(client, taskId)` produces abstract, structural criteria (`symbol_exists`/`test_passes`/`llm_check`, no file paths) via one LLM call through `POST /api/plan/items/:id/criteria/generate`. Returned to the FLOW criteria editor as a **draft for review — never auto-saved** (user edits then SAVE). Pure parse/validate in `parsePhase1Criteria` (invalid types coerced to `llm_check`, empty rows dropped); deterministic `titleToCriteria` fallback when no client/output. Covered by `planningV2.test.ts`.

- **Project-setup-first onboarding + bootstrap fingerprint**: `ProjectSetupScreen.tsx` (4 fields — name, workspace folder, "what are you building?", provider hint) shows on first launch (`matrix_setup_done` flag); `Start Building` sets the workspace and opens PLAN Build mode with the description pre-loaded. Returning users now land on **FLOW Today** (the project board), not PLAN. Existing codebases are fingerprinted via `GET /api/plan/bootstrap` → `fingerprintWorkspace` (README/git/tests/package-managers/languages/file-count, pure + covered by `fingerprint.test.ts`) and surfaced as an "Existing codebase detected" panel in setup.

- **Existing-project deep bootstrap**: `bootstrapEvaluate(client)` (`POST /api/plan/bootstrap/evaluate`, FLOW "BOOTSTRAP" button) ensures each task has Phase 1 criteria (llm_check dropped per bootstrap rule), evaluates structural criteria against the workspace scan, and flags items whose structural criteria all pass with `bootstrapLikelyComplete` → a **"likely complete"** badge on the FLOW card for user confirmation (never auto-done). Stores a bootstrap execution trace per flagged item. `isLikelyComplete` is pure + covered by `planningV2.test.ts`. Bootstrap also grants one free unlimited "What's Left" run via `?bootstrap=1` (tier cap bypassed).

Phase 2.6 (Planning Layer V2 — Project Execution Loop) is now functionally complete: two-phase criteria (deterministic + AI-drafted), structured post-run trace extraction, drift detection incl. targeted `diverged`, dependency editor, FLOW Today, tiered "What's Left", project-setup onboarding, and existing-project bootstrap. 89 backend/shared tests pass; Desktop build is green.

## 6c. Phase 2.7 - VS Code Extension (deferred from Phase 2.6)

### Goal

Let VS Code users invoke Forge's planning layer, agent, and review workflow directly from their editor. Deferred until Phase 2.6 has established the project-level identity.

### Implementation Work

- Create the `kryleos-forge-vscode/` package in the monorepo.
- Implement workspace sync: detect the VS Code open folder and POST it to `/api/workspace`.
- Implement `Ask Forge Agent` context menu item on files and selections.
- Stream agent responses into a dedicated VS Code output panel.
- Implement a VS Code sidebar webview polling `/api/review/current` with Accept/Reject controls.
- Add a connection status indicator in the VS Code status bar.
- V1 must not implement inline autocomplete or copilot-style suggestions.
- Package and publish as `.vsix` to the VS Code Marketplace.

### Dependencies

- Phase 2.6 (Planning Layer V2) must be complete so the extension has the full project-level backend to expose.
- Existing `/api/workspace`, `/api/review/current`, `/api/review/status` routes must be stable.

### Acceptance Criteria

- VS Code extension connects to the Forge backend over `localhost:3001`.
- Workspace path syncs automatically when VS Code opens a folder.
- Agent responses stream into the VS Code output panel.
- Review sidebar renders Git-backed review state with Accept/Reject controls.
- Extension can be installed from a `.vsix` file.

### Current Status

Phase 2.7 is complete. The VS Code extension was built, packaged as a `.vsix`, and integrated with the Forge backend.

## 6d. Phase 2.8 - PLAN Tab Redesign: Scratchbook + Plan Workspace

### Goal

Separate ideation from commitment in the PLAN tab. Replace the Build/Ask mode toggle with a unified scratchbook (ephemeral chat) and an explicit Plan Workspace (structured staging list). Make it possible to ideate freely without fear of polluting the plan, and to push confirmed ideas into a clean, reviewable workspace before they reach CREW. Support continuous ideation throughout the project lifecycle — new features can be pushed at any point, even while the project is already running in FORGE.

### Implementation Work

**Remove Build/Ask mode toggle:**

- Delete the Build/Ask segmented control from `PlanSpace.tsx`.
- Remove all Build mode accumulation logic — no messages auto-update the spec or create plan items.
- Remove "Add to spec?" chip heuristic.
- PLAN chat becomes a single unified scratchbook; session history persists and is continuable.
- Inject project name and workspace context into every Scratchbook system prompt so the AI has full project awareness.

**Add Summarize & Push:**

- Add a **Summarize & Push** button fixed at the bottom of the Scratchbook chat area.
- On click: fire a dedicated structured-output extraction call (`POST /api/plan/workspace/extract`) with the current conversation as input.
- Model returns one or more `PlanWorkspaceItem` objects: `{ title, description, category, context }`.
- Present items in a review modal — user can edit title, description, and category per item before confirming.
- On confirm: items are appended to the Plan Workspace. Nothing enters the workspace without explicit user confirmation.
- New backend route: `POST /api/plan/workspace/extract`.

**Add Plan Workspace panel:**

- Add a right-side Plan Workspace panel to the PLAN tab.
- Each item renders: title, category badge, status chip (Draft / Ready for CREW), and a collapsed "From conversation" context block.
- Item actions: Edit (title/description/category), Delete, Check Feasibility, move to "Ready for CREW".
- Workspace items are persisted per project in the local app state / `.kryleos/plan-workspace.json`.

**Add Check Feasibility:**

- Add **Check Feasibility** button per workspace item.
- On click: fire `POST /api/plan/workspace/feasibility` with inputs: project description, item title + description, current FLOW board task titles.
- Model returns `{ verdict: "feasible" | "needs_clarification" | "potential_conflict", reason: string }`.
- Verdict displayed as a non-blocking badge on the item: ✓ Feasible / ⚠ Needs Clarification / ✗ Potential Conflict.
- Item stays in workspace regardless of verdict. User decides next action.
- Available on all tiers. Badge shows a note on Free tier: "Accuracy improves once FLOW board has tasks."
- New backend route: `POST /api/plan/workspace/feasibility`.

**Push to CREW:**

- Add **Push to CREW** action (per item and bulk-select) in the Plan Workspace.
- Diff shown before any CREW state changes — same pattern as CREW → FLOW push.
- User confirms before items transfer to CREW.
- On Free tier: export as structured `.md` for manual copy-paste into CREW. Solo+: direct push.

**Update onboarding:**

- "Start Building" CTA pre-loads the project description as the first Scratchbook message (not a Build mode message).
- Bootstrap guided session opens in the Scratchbook (same as before, but no mode labeling).

### Dependencies

- Phase 2.6 (Planning Layer V2) and Phase 2.7 (VS Code Extension) must be complete.
- `POST /api/plan/workspace/extract`, `POST /api/plan/workspace/feasibility` are new routes.
- Plan Workspace state must persist in `.kryleos/plan-workspace.json` alongside existing plan data.

### Acceptance Criteria

- PLAN tab renders with Scratchbook (left) and Plan Workspace (right) — no Build/Ask toggle visible.
- User can chat freely in the Scratchbook without anything appearing in the Plan Workspace.
- Clicking Summarize & Push opens a review modal with AI-extracted items; user confirms before items land in workspace.
- Plan Workspace items show title, description, category badge, status, and collapsed context.
- Check Feasibility returns a verdict badge within 5 seconds; item remains editable and pushable regardless.
- Push to CREW shows a diff first; user confirms; items transfer to CREW without modifying FLOW or workspace directly.
- Session history persists and is continuable across sessions.
- Project name is visible in PLAN header and consistent across all four tabs.
- A project already running in FORGE can receive new items via Scratchbook → Push → Workspace → CREW → FLOW without disrupting in-progress tasks.

## 7. Phase 3 - Docs Autopilot

### Goal

Turn project documentation into the product's strongest differentiator.

### Implementation Work

Add a Docs Autopilot workspace with workflows:

- Generate Project Brief.
- Generate PRD.
- Generate Architecture Document.
- Generate Technical Design.
- Generate API/Integration Notes.
- Generate Security/Privacy Notes.
- Generate Test Plan.
- Generate Release Checklist.
- Generate User Guide.
- Generate Project Brochure.
- Update Docs From Latest Patch.
- Create Founder Build Summary.
- Create Client Handoff Pack.

Docs Autopilot should:

- read current workspace context,
- use existing `Project-Documents` conventions,
- preview document changes before writing, ideally through the same Review tab/diff preview pattern used in the coding section,
- support Markdown export,
- keep generated docs under `.kryleos/docs` or a configured docs folder,
- offer templates for solo apps, SaaS apps, mobile apps, agency/client apps, and internal tools.

### Plan Mapping

- Free: limited docs generation.
- Solo: basic docs generation.
- Solo Plus: richer Docs Autopilot.
- Founder: PRD, architecture, release, investor/founder summaries.
- Agency/Team: client handoff packs and branded exported docs.

### Acceptance Criteria

- User can generate a full documentation pack from a workspace.
- User can update docs after a patch.
- User sees a diff/preview before files are changed.
- Documentation updates appear in the Review tab or an equivalent docs-specific diff preview before acceptance.
- Docs workflows are clearly tied to plan entitlements.

## 8. Phase 4 - Cost Guard and Prompt Optimization

### Goal

Make Kryleos Forge visibly cheaper and more controlled than using several AI tools blindly.

### Implementation Work

Add a Cost Guard panel that shows:

- estimated prompt size,
- estimated response size,
- model/provider selected,
- estimated cost where model pricing is known,
- context size by source,
- files included in the prompt,
- token savings from concise mode,
- warning when a request is too large.

Prompt optimization should support:

- concise mode,
- critical mode,
- brutal audit mode,
- minimal context mode,
- docs-heavy mode,
- code-only mode,
- summarize previous logs before sending,
- truncate repeated context,
- ask user before sending large file context.

### Plan Mapping

- Solo: basic Cost Guard and concise/critical modes.
- Solo Plus: Cost Guard history and prompt optimization controls.
- Founder/Agency: workflow-specific optimization for docs, release notes, and handoff packs.

### Acceptance Criteria

- User can see what context is being sent.
- User can choose minimal context before model calls.
- Large prompts produce warnings.
- Concise mode demonstrably reduces prompt/reply verbosity.

## 9. Phase 5 - Local Model and BYOK Setup

### Goal

Make local-first and BYOK setup painless enough for non-expert solo developers.

### Implementation Work

- Add first-run provider setup wizard.
- Detect local Ollama availability.
- Show installed Ollama models.
- Recommend local models by task:
  - small chat,
  - code review,
  - docs generation,
  - cheap planning,
  - high-quality hosted fallback.
- Add provider health checks.
- Add clear error messages for invalid keys or offline local services.
- Add "local-only mode" badge.
- Add documentation for when data leaves the machine.

### Acceptance Criteria

- User can configure at least one provider in under five minutes.
- App clearly shows whether a model call is local or hosted.
- Ollama setup errors are understandable.
- BYOK keys are not silently sent anywhere except the selected provider.

## 10. Phase 6 - Security and Privacy Hardening

### Goal

Reach a safe baseline for public release.

### Implementation Work

- Move credentials to OS-backed secure storage:
  - Windows Credential Manager.
  - macOS Keychain.
  - Linux Secret Service.
- Add provider data-sharing disclosure before first hosted model call.
- Add secret scanning before sync, publish, or external export.
- Add command timeout and output-size limits.
- Add command approval history.
- Add trusted command policy only after explicit user configuration.
- Add workspace boundary tests.
- Add destructive file operation confirmations.
- Implement Zero Egress Mode:
  - Toggle in the config header.
  - Server-side enforcement: non-Ollama provider calls must be blocked in the backend model routing layer, not only in the frontend toggle state.
  - Persistent `[LOCAL ONLY]` badge in the app header when enabled.
  - Session log records `All model calls are local — no data sent to external providers` when enabled.
  - Available on all subscription tiers.

### Acceptance Criteria

- No API keys are stored only in plain localStorage for production release.
- User is warned before hosted providers receive workspace content.
- Secret-like files are flagged before export/publish/sync.
- Commands cannot run silently from agent output.

## 11. Phase 7 - Web and Mobile Companion Reliability

### Goal

Make Web and Mobile honest companions rather than incomplete full IDE replacements.

### Implementation Work

Web should support:

- backend URL configuration,
- backend online/offline state,
- real chat through Desktop backend where available,
- fallback simulator clearly labeled,
- settings sync preview,
- docs/planning preview.

Mobile should support:

- voice notes,
- planning prompts,
- monitor active desktop session,
- approve/reject commands,
- stop active workflow,
- sync queued planning notes,
- view project health summary.

Mobile should not be marketed as full coding.

### Acceptance Criteria

- Mobile can connect to a desktop backend over LAN.
- Mobile clearly explains when it is offline or using simulator fallback.
- Web companion can send a real backend query.
- Voice input failures are understandable.

## 12. Phase 8 - Founder and Agency Workflows

### Goal

Create higher-value workflows that justify Founder and Agency/Team pricing without making solo pricing expensive.

### Founder Workflows

- PRD generator.
- Architecture document generator.
- Roadmap/backlog generator.
- Release checklist.
- Pricing-page copy.
- Changelog/release notes.
- Investor/founder summary.
- Monthly project health report.
- Update docs from latest patch.

### Agency/Team Workflows

- Client handoff pack.
- Scoped implementation plan.
- Branded project brochure.
- Architecture summary for clients.
- QA/test checklist.
- Delivery checklist.
- Collaboration Preview indicators.
- RBAC Simulator indicators.
- Priority support workflow.

### Acceptance Criteria

- Founder user can generate a product-readiness pack.
- Agency user can generate a client handoff pack.
- Workflow outputs are better than generic chat responses.
- Preview/simulator features remain honestly labeled.

## 13. Phase 9 - Billing, Packaging, and Entitlements

### Goal

Replace mocked subscriptions with real packaging once core value is strong.

### Pre-Stripe Early Revenue (Phases 3–4)

Do not wait until Phase 9 to start collecting revenue. **But do not launch paid tiers before execution tracing is working.** The product promise is the Build Loop — launching before it is demonstrable makes the sales case dishonest. Once the Preview Deck (Phase 2.5) and execution tracing (Phase 2.6) are both working and demonstrable, launch an Early Lifetime deal:

- Platform: Gumroad or Lemon Squeezy (no Stripe integration required).
- Price: $99–$149 one-time for Solo Plus or Founder-level access.
- Mechanism: License key checked locally, bypassing mocked billing tier.
- Scope: Limited by time or seat count. Must be removed when the product reaches general availability on Stripe.
- Purpose: Start MRR-equivalent revenue and validate willingness-to-pay before billing infrastructure is complete.

### Full Stripe Integration

- Integrate Stripe or equivalent billing provider.
- Add plan definitions:
  - Free.
  - Solo.
  - Solo Plus.
  - Founder.
  - Agency/Team.
  - Early Lifetime (grandfathered from pre-Stripe sales).
- Add billing portal.
- Add cancellation flow.
- Add subscription webhooks.
- Add server-side entitlement checks.
- Add local grace-period behavior when offline.
- Add clear in-app upgrade prompts.

### Acceptance Criteria

- User can subscribe, cancel, and update payment method.
- Entitlements are enforced server-side for sync/docs/founder workflows.
- Free/Solo users are not blocked from core local-first value.
- Safety features remain available across all plans.

## 14. Phase 10 - Launch Readiness

### Goal

Prepare the product for a small public launch.

### Implementation Work

- Create landing page for `forge.kryleos.com`.
- Create product screenshots.
- Create short demo videos:
  - open workspace,
  - run agent workflow,
  - approve command,
  - generate docs pack,
  - use Cost Guard,
  - capture mobile voice note.
- Write quick-start guide.
- Add onboarding checklist inside app.
- Add support contact and bug report flow.
- Add changelog.
- Add privacy policy and terms.
- Add release notes template.

### Acceptance Criteria

- New user can understand product value in one page.
- User can reach first useful result in under ten minutes.
- Support and bug-report paths are obvious.
- Release package can be installed and launched on target OS.

## 15. Recommended Milestone Sequence

### Milestone 1 - Private Release Candidate

Focus:

- Desktop polish.
- honest labels.
- Preview Deck MVP.
- provider setup.
- command safety.
- tests.

Exit criteria:

- 5-10 trusted users can use the app without handholding.

### Milestone 2 - Solo Developer Beta

Focus:

- Docs Autopilot basic.
- Cost Guard basic.
- local model setup.
- onboarding.
- artifact preview integration from the Preview Deck.

Exit criteria:

- users can open a repo, ask for help, generate docs, and run a safe workflow.

### Milestone 3 - Paid Solo Launch

Focus:

- Solo/Solo Plus packaging.
- basic billing.
- annual plans.
- mobile companion preview.

Exit criteria:

- first paying users can subscribe and receive clear value.

### Milestone 4 - Founder Workflow Launch

Focus:

- PRD, architecture, roadmap, release checklist, founder summaries.

Exit criteria:

- founders can generate launch-ready project documentation packs.

### Milestone 5 - Agency/Team Preview

Focus:

- handoff packs,
- branded docs,
- collaboration preview,
- RBAC simulator,
- priority support workflow.

Exit criteria:

- small agencies can use Kryleos Forge for client delivery materials.

## 16. Release Blockers

Do not launch publicly until these are solved:

- Credentials are stored securely or clearly labeled as local development storage.
- Simulated features are labeled honestly.
- Billing copy matches real entitlements.
- Core Desktop flow is stable.
- Build and tests pass.
- New users can configure a model provider without reading source code.
- Command approval cannot be bypassed by normal agent output.
- App copy no longer contains confusing legacy or corrupted text.

## 17. Success Metrics

Track:

- activation: user opens workspace and completes first useful request,
- provider setup success rate,
- docs pack generation rate,
- command approval completion rate,
- Cost Guard usage,
- mobile companion connection rate,
- Free-to-Solo conversion,
- Solo-to-Solo Plus conversion,
- Founder workflow usage,
- churn reasons,
- monthly recurring revenue.

Early goal:

```text
$2k-$3k/month MRR
```

Commercial success does not require beating market leaders. It requires serving a narrow user base well enough that they stay subscribed.
