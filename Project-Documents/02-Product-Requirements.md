# Product Requirements

## 1. Overview

Kryleos Forge is the only AI coding tool that manages a project from plan to board to execution — through the **Build Loop**: PLAN → CREW → FLOW → FORGE.

The Build Loop stages:
- **PLAN:** Two-area tab: a **Scratchbook** (AI ideation chat) and a **Plan Workspace** (structured staging list). The scratchbook is always ephemeral — chat never auto-updates the spec. When the user has confirmed an idea in conversation, they hit **Summarize & Push**: the AI extracts a structured item from the conversation and presents it for review before it lands in the Plan Workspace. No Build/Ask mode toggle — the scratchbook is always a scratchpad. Session history persists so conversations can be continued. Users can ideate on mobile while the workspace stays clean on Desktop.
  - **Plan Workspace:** a staging list inside the PLAN tab (right pane). Each item: title (AI-generated), description (2–3 sentence AI summary), category tag (AI-inferred: frontend / backend / infra / etc.), status (Draft → Ready for CREW), and a collapsed "from conversation" context block (the chat excerpt that produced the item). Items are user-reviewed before saving. **Check Feasibility** button per item: optional, non-blocking; AI checks against project description + current FLOW board state; returns ✓ Feasible / ⚠ Needs Clarification / ✗ Potential Conflict. Available on all tiers (accuracy improves once FLOW has data). Items are sent to CREW via "Push to CREW" with a diff shown first. Project name persists across all tabs (PLAN → CREW → FLOW → FORGE).
- **CREW:** Specialist agent review. Users send plan content to CREW before execution. Three bundled personas (Technical Reviewer, Scope Guard, Risk Identifier) review the plan and produce a **structured refined plan document** — not just chat messages. A "Push to FLOW" button diffs CREW's output against existing FLOW tasks for user confirmation before FLOW is updated.
  - **CREW output format:** CREW personas write their output as structured Markdown using `### [ITEM] <title>` anchors. Each block includes: `Status` (Accepted / Revised / Flagged), `Category`, `Changes` (plain-text description of what was refined), and `Criteria hint` (a plain-English note the system uses to seed acceptance criteria if the item is new). "Push to FLOW" matches `[ITEM]` blocks to existing FLOW tasks by title (fuzzy match, with ID fallback if the item was originally created in PLAN). Unmatched `[ITEM]` blocks are offered as new tasks to add. The diff is shown to the user as a before/after list before any FLOW task is created or modified.
- **FLOW:** Project management and execution prep. Three agent-assisted actions per item: **Break down** (AI decomposes vague tasks into concrete subtasks with criteria), **Estimate** (AI tags complexity), **Execute** (send to FORGE with full context). FLOW is where the plan gets operationalized — task decomposition happens here; code writing happens only in FORGE. Includes the **Today view** as the default landing: 3–5 unblocked prioritized tasks with one-click Execute.
- **FORGE:** Multi-agent code execution. Agents execute plan items, emit execution traces with acceptance criteria results, and update plan item status.

Supporting capabilities — file tools, Git review, multi-LLM support, BYOK, local models, and cost control — make that loop practical for solo developers and founders without enterprise budgets.

## 2. User Personas

### Solo Developer / Technical Founder

Needs to manage a whole project — not just edit individual files. Has a plan (a doc, a PRD, a checklist) and needs to track whether the code actually matches it. Wants agent execution that ties back to plan items visibly.

### Multi-Repo Builder

Managing a frontend, backend, and infra repo simultaneously. No existing AI tool manages tasks across all three. Needs a single plan that spans repos with per-repo task routing.

### Advanced AI Power User

Needs custom agents, reusable skills, provider selection, and local model support — all configurable per project.

## 3. Key User Stories

**Build Loop (primary):**
- As a new user, I am guided to set up my project first — not dropped into a chat box — so my first action is defining what I'm building.
- As a user, I can ideate freely in the PLAN space using any of my configured AI providers, and the conversation builds a refinable project spec across sessions.
- As a Free user, I can export my PLAN as a structured .md file and manually import it into CREW for specialist review.
- As a paid user, my PLAN syncs directly to CREW on Desktop without manual export or copy-paste.
- As a user, I can send my plan to CREW specialist agents (Technical Reviewer, Scope Guard, Risk Identifier) for refinement before moving to FLOW.
- As a user, I can import or generate a plan and have its items automatically populate my FLOW Kanban board.
- As a user, when a plan item is created, the app automatically generates structured acceptance criteria (file_exists, symbol_exists, test_passes, git_grep, or llm_check conditions) that I can review and edit before saving.
- As a user, I can send any plan item directly to the FORGE agent with one click and watch it execute.
- As a user, after an agent run completes, I can see which plan item it came from, which acceptance criteria were met, which files changed, and whether the item should be marked done — without manually checking.
- As a user, I can run a plan drift check that evaluates each item's acceptance criteria against the current codebase and shows me which items are complete, in progress, not started, or diverged.
- As a user managing multiple repos, I can have a single plan with tasks assigned to specific workspace directories so agent runs target the right repo automatically.
- As a user, I can mark plan items as blocked by other items so I can see dependencies and avoid sending blocked tasks to FORGE before their prerequisites are done.
- As a Founder tier user, I can generate a "What's Left" report — a full drift state summary with one click — showing every plan item's classification and the gap between my plan and my code.

**Workspace and execution:**
- As a user, I can select a workspace directory so the app knows which project to operate on.
- As a user, I can ask coding questions and get streamed AI responses.
- As a user, I can reference files using `@path` so the assistant has exact context.
- As a user, I can create tasks and assign them to specialist roles.
- As a user, I can inspect and edit files without leaving the app.
- As a user, I can use a coding Preview Deck to switch between files, live app preview, terminal evidence, side chat, artifacts, and review status.
- As a user, I can view project file relationships in a graph.
- As a user, I can review AI-applied code changes in a dedicated Review panel with diffs, risk notes, command evidence, and revert actions.
- As a user, I can configure multiple model providers.
- As a user, I can create/import custom agents and skills for repeatable workflows.
- As a user, I can check Git status and stage/commit/sync changes.
- As a user, I can approve or cancel AI-proposed shell commands before they run.
- As a user, I can stop an active agent workflow with a visible stop control.
- As a user, I can place Cursor-compatible rules in `.cursorrules` or `.cursor/rules` and have the agent respect them.
- As a user, I can install a community agent starter pack with one click and immediately use it in my workflow.
- As a user, I can share a custom agent as a GitHub Gist from inside the app.
- As a user, I can enable Zero Egress Mode to guarantee no workspace data leaves my machine.
- As a Free user, I can use local workspace tools, Ollama, and BYOK model access without cross-device sync.
- As a Pro user, I can see and use Remote Container Execution simulation states.
- As an Enterprise user, I can see team collaboration and RBAC simulator indicators.

## 4. Functional Requirements

### Workspace Configuration

- Allow selecting or entering a local workspace directory.
- Persist selected workspace across sessions.
- Reject unsafe file operations outside the workspace boundary.

### Chat Console

- Provide a streaming chat interface.
- Support standard chat mode.
- Support agent-assisted workflows.
- Preserve session history by workspace area where possible.
- Support file mentions with `@file/path`.

### Multi-Agent Orchestration

- Provide coordinator/planner behavior.
- Delegate implementation tasks to a builder role.
- Delegate search/context tasks to an analyst role.
- Delegate test/debug tasks to a reviewer role.
- Allow custom agents from UI and local files.
- Pause the orchestration loop when a `runCommand` action requires user approval.
- Resume pending command execution when the frontend sends `approve_command` with `approved: true`.
- Cancel pending command execution when the frontend sends `approve_command` with `approved: false`.
- Support graceful abort of active workflows, pending approval locks, and tracked command child processes.

### File Tools

- List directories.
- Read files.
- Create files/folders.
- Save edited files.
- Preview file contents.
- Render CSV previews in table form.
- Ignore common generated folders where appropriate.

### Workspace Rules

- Scan workspace root for `.cursorrules`.
- Scan workspace root for `.cursor/rules`.
- Append discovered rule content to agent system instructions.
- Preserve compatibility with existing Kryleos and legacy workspace instruction files.

### Git Tools

- Detect Git repository state.
- Show modified, staged, and untracked files.
- Stage files.
- Commit staged files.
- Push and pull current branch.
- Configure remote URL/token where supported.

### Project Board

- Add tasks.
- Assign tasks to roles.
- Move tasks through todo, in-progress, and done lanes.
- Run a task through the agent workflow.
- Show lightweight achievement/progress indicators.

### Codebase Graph

- Generate a workspace graph from project files.
- Render nodes and edges in an interactive visualizer.
- Allow file preview/pinning from graph interactions.

### Git-Backed Code Review

- Add a Review tab inside the coding section alongside Explorer and Visualizer.
- Use Git status and Git diffs as the primary source of truth for changed files.
- Persist review status under the workspace `.kryleos/reviews/` area.
- Display working and staged diffs separately where possible.
- Show command, build, lint, and test evidence from terminal/session logs.
- Highlight simple risk notes for sensitive files, dependency/config changes, large edits, and security-adjacent behavior.
- Allow users to mark a change as accepted or rejected persistently.
- Allow users to stage or unstage reviewed files from the Review tab.
- Allow users to revert tracked files through Git restore.
- Move untracked reverted files into `.kryleos/reverted/` rather than deleting them outright.
- Allow users to open the current file preview from a review item.
- Fall back to session-log diffs when the workspace is not a Git repository.
- Treat the Review tab as the primary pre-commit trust surface, while Git remains the final source-control authority.

### Preview Deck and Workspace Panes

- Add a right-side coding Preview Deck inspired by the strongest practical workflow patterns from Claude Code, Codex, and Antigravity.
- The first version must be a fixed deck rather than a full drag-and-drop pane system.
- Include tabs for Files, Live Preview, Terminal, Side Chat, Artifacts, and Review.
- Reuse the existing File Browser in the Files tab.
- Live Preview must support a user-entered local development URL.
- Live Preview should support refresh, open externally, and common local dev-server suggestions where possible.
- Terminal MVP must show command history, stdout/stderr evidence, and pending command approval state.
- A full interactive terminal/PTT is not required for MVP and should not bypass existing command approval gates.
- Side Chat must allow context questions without interrupting the main agent workflow.
- Side Chat must not silently write files or run commands.
- Artifacts must preview generated Markdown, text, and HTML outputs, with later support for richer docs and media previews.
- Review summary must surface changed file count, risk notes, and latest verification evidence from the existing Git-backed Review tab.
- Incomplete panes must be labeled `Preview`, `Planned`, or `Simulator`.

### UI Professionalization

- Ship `theme-forge` as the default UI theme replacing `theme-matrix` as the app default.
- `theme-forge` must retain a dark background and use matrix green as an accent colour for active states, status indicators, and highlights — not as primary body text colour.
- `CodeRain.tsx` must be demoted from the default background to an opt-in setting. Users who want the matrix rain animation can enable it; it must not ship as the default experience.
- **Tab labels must be four clean words: `Plan`, `Crew`, `Flow`, `Forge`.** Chat is removed as a separate tab. PLAN contains the Scratchbook (ideation chat) and Plan Workspace (staging list). No Build/Ask mode toggle. No bracket/function-key annotation in the primary visual label. Keyboard shortcut hints may appear as tooltips.
- The `theme-matrix` theme remains available as a user preference toggle.

### Community Agent Starter Packs

- Bundle at least **seven** pre-built agent definitions with the desktop app: `React Expert`, `Security Auditor`, `Test Writer`, `Documentation Writer`, `Performance Reviewer`, `Python Backend Specialist`, `DevOps Specialist`.
- Starter packs must be installable with one click into the user's `.kryleos/agents/` directory.
- The CREW space must surface starter packs prominently when no custom agents are installed.
- A `Share Agent` control must export the selected agent JSON as a GitHub Gist using the existing `/api/artifacts/publish` route.

### CREW Agent Personas

Three specialist agent personas must be bundled and auto-suggested whenever a user sends a plan to CREW:

- **Technical Reviewer:** reviews the plan for technical feasibility, architecture consistency, and implementation risk.
- **Scope Guard:** identifies scope creep, ambiguous requirements, and over-specified items that could delay delivery.
- **Risk Identifier:** flags security, dependency, and operational risks embedded in the plan before execution begins.

These personas must appear as a suggested bundle when the user initiates a PLAN→CREW handoff, with individual install into `.kryleos/agents/`. They are available on all tiers.

### Plan to Flow Task Sync

- When a user imports a plan via the PLAN space, checklist items parsed from the plan must be automatically offered for population into the FLOW Kanban board.
- A `Send to FORGE Agent` control on any plan item must route that item as a query to the multi-agent orchestrator in the FORGE space.
- The loop from PLAN → FLOW → FORGE must be visible and navigable without manual copy-paste.

### Planning Layer V2 — Execution Tracing

- When an agent run completes, the app must link the run result back to the plan item that originated it.
- The linked result must show: which plan item was targeted, which files were changed, which commands ran and their outcomes, and whether the item is auto-closeable based on the evidence.
- A plan item must be auto-marked as complete when an agent run changes the files expected by the item and passes any associated test or build check.
- The user must be able to review the linked evidence before accepting auto-completion; auto-close must not be silent.
- Execution traces must be stored persistently under `.kryleos/traces/` so the user can audit them after the session.
- After each FORGE agent run, the orchestrator must make a dedicated structured-output extraction call (separate from the main agent stream) to produce the `ExecutionTrace` JSON: files changed, commands run, and per-criterion pass/fail results. Structural criteria (`file_exists`, `symbol_exists`, `git_grep`, `test_passes`) are evaluated by real code/test checks before this call; only `llm_check` criteria use LLM evaluation. On models that support function/tool calling, use structured output. On others, wrap the extraction request in `<json>` delimiters and parse tolerantly.

### Planning Layer V2 — Plan Drift Detection

- The app must provide a "Check Plan Drift" action that compares the current codebase state against the active plan.
- Drift detection must classify each plan item as: Complete (evidence found in code), In Progress (partial evidence found), Not Started (no evidence found), or Diverged (evidence conflicts with plan expectation).
- Drift detection must use file existence, Git commit messages, and symbol presence as evidence signals — not only the user's manual status updates.
- **Diverged LLM call throttling:** structural criteria (`file_exists`, `symbol_exists`, `git_grep`, `test_passes`) are evaluated first with real code checks — zero LLM cost. A Diverged LLM call fires only if at least one structural criterion fails or is ambiguous. Results are cached per item alongside the git commit hash of relevant files; on subsequent drift runs, items whose relevant files have not changed since the last evaluation are skipped. Maximum 10 LLM-evaluated items per drift run; remaining items queue for the next run with a visible "X items deferred" notice.
- The drift report must be shown in the PLAN space with per-item classification and a summary count.
- Drift detection must run automatically after every agent run that closes a task, and must be available on demand.

### Planning Layer V2 — Multi-Repo Plan Scope

- A single plan must be able to reference multiple workspace directories (repos).
- Each plan item must optionally carry a workspace assignment (which repo it targets).
- When the user sends a plan item to the FORGE agent, the agent must activate the assigned workspace directory for that item's execution.
- The FLOW Kanban board must group or label tasks by workspace assignment so the user can see which repo each task targets.
- Workspace assignments in plans must persist across sessions.

### Planning Layer V2 — AI-Generated Acceptance Criteria (Two-Phase)

Acceptance criteria generation uses a two-phase approach to avoid the cold-start problem (AI not knowing the project's file structure at item creation time).

**Phase 1 — Abstract criteria (on demand from FLOW criteria editor):**
- When the user opens the criteria editor for a FLOW task and hits "Generate", the app generates *abstract structural criteria* that do not depend on specific file paths: `symbol_exists: "authenticateUser"`, `test_passes: "auth suite"`, `llm_check: "login flow handles invalid credentials"`.
- These are durable — they survive file renames and internal refactors.
- The user reviews and edits before saving. The app must never auto-apply criteria silently.

**Phase 2 — Enriched criteria (semi-automatic, triggered by workspace availability):**
- When the user selects a workspace, the app runs a background scan and queues Phase 2 enrichment for all plan items that have only Phase 1 criteria. This runs silently.
- When enrichment is ready, a non-blocking banner appears: "Criteria enriched for X plan items — review?" The user can review the diff (Phase 1 abstract vs Phase 2 with real paths) per item or bulk-confirm.
- If the user never selects a workspace, Phase 1 criteria remain active indefinitely and are still valid for drift detection — just less precise.
- Phase 2 also re-runs after the first agent run on any item (picks up newly created files).

**Evaluation rules:**
- All execution tracing and drift detection evaluates acceptance criteria — not raw plan text.
- For `Diverged` classification: a single targeted LLM call evaluates the failing criterion + relevant code diff. All other classifications are programmatic.
- The app must never mark an item Complete without user confirmation, even when all criteria pass.
- Acceptance criteria must persist with the plan item across sessions.

### Planning Layer V2 — Plan Item Dependencies

- Plan items must support a `blockedBy[]` array referencing other plan item IDs.
- Items with unresolved blockers must be visually greyed out in the FLOW Kanban board.
- The `Send to FORGE Agent` control must be disabled on items with unresolved blockers.
- Users must be able to add and remove blocker relationships from the plan item UI.
- Blocked status must be computed dynamically: when a blocking item is marked complete, blocked dependents must be automatically unblocked.

### Planning Layer V2 — Agent Specialization per Plan Item

- When a plan item is created or edited, the app must AI-tag it with a category: `frontend`, `backend`, `testing`, `security`, `docs`, or `infra`.
- Users must be able to override the AI-assigned category.
- When `Send to FORGE Agent` is triggered, routing follows a capability-map hierarchy:
  1. Exact match: item category = agent's declared primary category.
  2. Capability overlap: any installed agent with the item's category in its `capabilities[]` array.
  3. General orchestrator fallback: no match found — route to default orchestrator with category as a system prompt context hint.
- If fallback to general orchestrator occurs, the FLOW card must display a visible indicator: "No [category] specialist — using general agent."
- Capability map for bundled agents: Security Auditor covers `security` + `backend`; Test Writer covers `testing` + `frontend` + `backend`; Performance Reviewer covers `frontend` + `backend` + `infra`; DevOps Specialist covers `infra`; Documentation Writer covers `docs`; React Expert covers `frontend`; Python Backend Specialist covers `backend`.
- Category tags must be stored with plan items and persist across sessions.

### Planning Layer V2 — "What's Left" Summary (Tiered)

- "What's Left" runs a drift evaluation across plan items using acceptance criteria and returns a structured classification report.
- Item limits by tier: Free = 5 items (AI prioritizes the 5 most critical unresolved items), Solo = 25 items, Solo Plus = 50 items, Founder = unlimited + Markdown export.
- Free tier sees AI-prioritized 5 items (most impactful unresolved gaps), not random 5. Prioritization uses a single LLM call over the full item list with scoring criteria: blocking potential (fan-out count), delivery risk (how much delays other work), and execution readiness (no unclear requirements or unresolved blockers). The call returns a JSON array of `{id, reason}` ordered by combined score. The `reason` field is shown to the user — it's the "why this matters now" explanation.
- The report must include: count of Complete / In Progress / Not Started / Diverged / Needs Review items, and the specific classification and gap for each item shown.
- Markdown export is Founder tier only.
- "What's Left" must display a visible upgrade prompt when a user hits their tier item limit.

### PLAN → CREW Handoff

- Free users must be able to export their PLAN as a structured .md file to use as input for CREW manually.
- Solo tier and above must support direct PLAN→CREW sync on Desktop: plan content is sent directly to CREW without manual export or copy-paste.
- CREW→PLAN return path: Free users generate a CREW summary and copy-paste it back to PLAN. Paid users can sync CREW refinements back to PLAN directly.
- Mobile/web PLAN ideation syncs to Desktop CREW for paid (Solo Plus and above) users.
- The PLAN→CREW handoff must never require the user to leave the app on paid tiers.

### Project-Setup-First Onboarding (New Projects)

- On first launch (no existing workspace selected, no plan items), the app must open to a `ProjectSetupScreen` — not the chat console.
- The setup screen must collect exactly four fields:
  1. **Project name** — text input, required.
  2. **Workspace folder** — folder picker dialog, required. If skipped, defaults to `~/Documents` with a persistent "file tools limited" banner in PLAN.
  3. **What are you building?** — multiline text area, labeled "Describe your project in 2–3 sentences. This seeds your PLAN." Pre-loaded as the first Scratchbook message on submit.
  4. **Model provider** — if no API key is configured, show an inline prompt: "You'll need an API key or Ollama to use AI features. Set up in CONFIG →" with a skip option.
- CTA: "Start Building" → navigates to PLAN Scratchbook with the description pre-loaded as a pending message.
- No additional onboarding survey fields (GitHub URL, team size, use-case, feature selection). Every extra field reduces completion rate.
- After project setup, the app must offer to generate or import a plan and populate the FLOW board before showing any other surface.
- Returning users with an existing workspace must land on the FLOW Today view, not PLAN or the old chat console.

### Existing Project Bootstrap Onboarding

When a user connects a workspace that already contains code, the app must detect this and run a three-phase bootstrap flow:

**Phase 1 — Workspace scan (automatic):**
- Scan README, package files, git log (last 30 commits), test directory, existing docs.
- Produce a project fingerprint shown to the user: "Detected: Next.js + Express + PostgreSQL. 47 commits. 3 test suites."

**Phase 2 — Bootstrap session (guided PLAN Scratchbook chat):**
- Open a special one-time guided session: "Tell me what this project does and what's already done."
- AI generates Phase 1 structural criteria for each plan item described (no file paths assumed yet).
- The bootstrap immediately evaluates structural criteria (`file_exists`, `symbol_exists`, `git_grep`) against the workspace scan already in memory. `llm_check` criteria are skipped during bootstrap to keep it fast and free.
- Items where all structural criteria pass → status "Likely Complete (bootstrap)" shown with a distinct badge. Items with partial passes → In Progress. Items with no passes → Not Started.
- User reviews: "These N items appear already implemented — confirm?" They can reject any item back to Not Started.
- The bootstrap workspace scan is stored as the execution trace for pre-marked Complete items — so criteria ARE evaluated against real evidence, not assumed.

**Phase 3 — First "What's Left" run (free, regardless of tier):**
- After bootstrap confirmation, run "What's Left" immediately and show the first real drift report.
- This is the first meaningful product moment for an existing project user.
- This one-time bootstrap run is free regardless of subscription tier.

### FLOW Today View

- The default FLOW landing for returning users must be the Today view, not the full Kanban board.
- Today view shows 3–5 unblocked tasks selected by a deterministic priority score. Score per item: +10 if In Progress with an active trace; +5 if a blocker was marked Complete in the last 24 hours (recently unblocked); +3 × the count of other items that have this item in their `blockedBy[]` (dependency fan-out); +1 × days since creation (capped at 7, for aging). Top 3–5 by score appear in Today. Ties broken by creation order. No AI call required — recalculates in milliseconds on every FLOW open.
- "Execute Next" sends the top item to FORGE with one click.
- "Execute All Today" queues the Today items to FORGE in sequence, asking for approval before each run.
- User can manually swap items in/out of Today.
- **Mobile:** Today view is the mobile companion home screen. Shows the same 3–5 tasks. One-tap approve/reject when a FORGE run completes on Desktop.
- Full Kanban board remains accessible from Today view via a tab or expand button.

### Minimum Recommended Model

The app must display a model recommendation at provider setup and in the Build Loop feature surfaces:

| Feature | Minimum (functional) | Recommended |
|---|---|---|
| FORGE coding execution | Any model with tool use (Qwen2.5-coder, DeepSeek-Coder-V2, Ollama) | DeepSeek V3, Claude Sonnet, GPT-4o |
| Acceptance criteria generation | Gemini Flash 2.0, Claude Haiku, GPT-4o-mini | Claude Sonnet, Gemini Pro, GPT-4o |
| CREW persona review | Gemini Flash 2.0, Claude Haiku, GPT-4o-mini | Claude Sonnet, GPT-4o |
| Diverged drift classification | Claude Haiku, GPT-4o-mini | Claude Sonnet |
| Bootstrap session | Claude Haiku, Gemini Flash | Claude Sonnet |

- When a user selects a model below the minimum threshold for Build Loop features, show a non-blocking warning: "Build Loop features (acceptance criteria, CREW review, drift detection) may produce low-quality results with this model. Recommended: Claude Sonnet, Gemini Pro, DeepSeek V3, or GPT-4o."
- The warning must not block usage — it informs. User can proceed with any model.

### Zero Egress Mode

- Add a Zero Egress Mode toggle in the config header.
- When enabled, Zero Egress Mode must block all non-Ollama provider calls.
- When enabled, a persistent `[LOCAL ONLY]` badge must appear in the app header.
- When enabled, the session log must record `All model calls are local — no data sent to external providers`.
- Zero Egress Mode must be available on all subscription tiers.
- A one-time data disclosure banner must appear before the first non-local provider call per provider, regardless of Zero Egress Mode state.

### VS Code Extension

- Provide a `kryleos-forge-vscode` extension package in the repository.
- The extension must connect to the running Forge desktop backend on `localhost:3001`.
- The extension must detect the folder currently open in VS Code and POST it to `/api/workspace` to sync the workspace path without manual entry.
- The extension must provide a right-click context menu item on files and selections: `Ask Forge Agent` — pre-fills a query with the `@filename` mention and sends it to the backend WebSocket.
- Agent responses must stream into a VS Code output panel.
- The extension must provide a VS Code sidebar webview that polls `/api/review/current` and renders the Git-backed review state with Accept and Reject controls that call `/api/review/status`.
- The extension must show a connection status indicator when the Forge backend is offline.
- V1 of the extension must not attempt inline autocomplete or copilot-style suggestions. Those are later scope.
- The extension must be clearly labeled as a companion to the Forge desktop app, not a standalone tool.

### Custom Agents and Skills

- Store new custom assets under `.kryleos/agents` and `.kryleos/skills`.
- Load legacy `.matrix` folders as a migration fallback.
- Support JSON/Markdown agent definitions.
- Support JavaScript/TypeScript/Markdown skill files.
- Keep the Specialists tab and Workspace Skills Factory available across all subscription tiers.

### Integrations

- Support multiple model providers: DeepSeek, Gemini, OpenAI, Anthropic, OpenRouter, and Ollama.
- Support optional Google Drive import/export flows.
- Support optional Kryleos Sync account state.

### Subscription Tiers

- Support Free, Solo, Solo Plus, Founder, Agency/Team, and Early Lifetime tier states.
- Free tier must have no artificial item caps. Gate on workflow features (tracing, sync, drift detection), not on project or task counts.
- Free PLAN→CREW handoff uses structured .md export + manual copy-paste. No automatic sync.
- Solo ($5/mo): unlock basic execution tracing, PLAN→CREW direct Desktop sync, AI acceptance criteria generation, and basic drift detection.
- Solo Plus ($9/mo): unlock full drift detection (Diverged + confidence scoring), trace history, cross-device sync, mobile/web PLAN with Desktop sync.
- Founder ($15/mo): unlock multi-repo plan scope, cross-repo drift, "What's Left" summary, plan versioning, plan item dependencies, agent specialization, and Founder docs workflows.
- Agency/Team ($39/mo): unlock shared plan editing, team trace visibility, per-member execution history, client handoff packs, branded docs, collaboration/RBAC previews.
- Early Lifetime ($99–$149 one-time): launches only after Preview Deck and execution tracing are both working.
- Support mocked billing upgrade behavior through the subscription route until production Stripe billing is added.
- **Pre-Stripe upgrade flow (early launch):** when a user hits a tier gate, show an inline upgrade nudge (not a blocking modal) immediately below the locked action — showing the feature name, tier that unlocks it, and price. The nudge includes an "Upgrade →" button that opens an in-app modal with a two-column tier comparison highlighting the specific locked feature, plus a CTA button that opens the Gumroad/Lemon Squeezy page in the system browser. After external payment, the user receives a license key via email; a "License Key" input field in CONFIG validates it locally (hash check against a bundled key format — no server call required for early launch) and updates the active tier state immediately.

### Tier-Gated Feature Representation

- Agency/Team collaboration must render live online peer count indicators and cloud sync logs in the coworking surface.
- Agency/Team RBAC must show role indicators such as OWNER in the Crew specialist dashboard.
- Founder/Agency/Team remote execution (future roadmap) must show `[REMOTE CONTAINER SIMULATOR ACTIVE]`.
- Free/Solo/Solo Plus local execution must show `[WARNING: LOCAL HOST EXECUTION ACTIVE]`.
- Hosted Cloud IDE simulation must be represented through connected account and WebSocket sync behavior for Founder/Agency/Team tiers.

### Command Approval and Interrupt UX

- Proposed shell commands must be visible before execution.
- `ChatConsole.tsx` must render approval controls for pending commands.
- The current approval control renders `[APPROVE & RUN]`.
- The current cancellation control renders `[REJECT]`.
- `App.tsx` must render `[STOP CURRENT WORKFLOW]` while `isStreaming` is active.
- Abort behavior must terminate active child processes and reset streaming/approval locks.
- Approval messages must carry the active backend-generated `commandId` so stale approvals can be rejected.

### Latest Reviewed Patch Requirements

- `command_approval_required` must include `tool`, `command`, and `commandId`.
- `App.tsx` must preserve the pending `commandId` in `commandPendingApproval`.
- `approve_command` must include `approved` and the pending `commandId`.
- Rejecting a command must not execute the shell command and must allow the orchestrator loop to recover.
- `abort_execution` must call the orchestrator abort path rather than only toggling a flag.
- The sandbox must track child processes started by `runCommand` and remove them from tracking on `close` or `error`.

## 5. Non-Functional Requirements

- The app should run locally on a developer machine.
- UI should remain responsive during streaming.
- File operations should be constrained to the selected workspace.
- User-facing text must avoid copyright-sensitive Matrix-era naming.
- Build must pass TypeScript and Vite production compilation.
- Test suite should pass before release.
- Tier gates must not advertise simulated capabilities as production infrastructure without clear labels.
- AI-generated shell commands must require explicit approval before execution.
- Active workflow interrupts must leave the app in a recoverable state.
- Users must be able to review applied AI file changes and verification evidence before treating an agent run as complete.
- Users must be able to inspect files, local app preview, terminal evidence, side chat context, artifacts, and review status from one coding workspace surface once the Preview Deck is implemented.
- **Offline (Desktop):** Ollama local models enable offline PLAN ideation and FORGE execution on Desktop. This is a supported and valid use case.
- **Offline (Mobile):** Mobile offline coding is out of scope. Mobile offline PLAN ideation (note-taking) is the limit — execution requires connectivity to a Desktop backend or hosted model.

## 6. Success Metrics

**Project execution loop (primary):**
- A new user is guided to set up their project before seeing the chat console.
- User can import a plan and see its items on the FLOW board in under 60 seconds.
- After an agent run, the user can see which plan item was executed and which files were affected — without leaving the app to check manually.
- Plan drift check correctly classifies at least one plan item as complete based on code evidence, not user input.
- User can assign a plan item to a specific repo and have the agent activate that repo for execution.

**Existing baselines:**
- User can open a workspace and complete a coding task end to end.
- User can inspect and edit project files from the app.
- User can configure at least one model provider successfully.
- Tier state changes correctly update available features and visible indicators.
- Build and test commands pass reliably.
- User can inspect changed files, risk notes, and command/test evidence from the coding Review tab.
- User can use the Preview Deck to inspect file, preview, terminal, side-chat, artifact, and review context without leaving the coding workspace.
- User can install a community agent starter pack and begin using it without editing config files.
- User can enable Zero Egress Mode and confirm all model calls are local.
- Current reviewed verification: `npm.cmd run build` passes and `npm.cmd test` passes with 44 Vitest tests.
