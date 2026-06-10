# Technical Design

## 1. Frontend Stack

- React
- TypeScript
- Vite
- Electron renderer
- Lucide icons
- Custom CSS utility classes and theme variables

## 2. Backend Stack

- Node.js
- Express
- WebSocket server
- TypeScript via `tsx`
- Local filesystem APIs
- Git command execution
- Model-provider client modules

## 3. Main Source Areas

- `Desktop-app/src/App.tsx` - top-level app state, routing between spaces, WebSocket lifecycle.
- `Desktop-app/src/components/PlanSpace.tsx` (or equivalent) - PLAN tab with two areas: Scratchbook (ideation chat, always ephemeral) and Plan Workspace (structured staging list). No Build/Ask toggle. Summarize & Push extracts items from chat into workspace.
- `Desktop-app/src/components/ChatConsole.tsx` - streaming log console used within PLAN and FORGE contexts.
- `Desktop-app/src/components/CoworkSpace.tsx` - combined chat/task/workspace/factory experience.
- `Desktop-app/src/components/ProjectBoard.tsx` - task workflow board.
- `Desktop-app/src/components/FileBrowser.tsx` - workspace file operations and Git panel.
- `Desktop-app/src/components/CodebaseGraph.tsx` - graph visualizer.
- `Desktop-app/src/components/CodeReviewPanel.tsx` - coding Review tab for Git-backed working/staged diffs, persisted review status, command/test evidence, risk notes, staging, file preview, and safe revert actions.
- Planned `Desktop-app/src/components/PreviewDeck.tsx` - coding workspace deck for Files, Live Preview, Terminal, Side Chat, Artifacts, and Review summary.
- `Desktop-app/src/backend/server.ts` - REST/WebSocket backend entrypoint.
- `Desktop-app/src/backend/agents.ts` - multi-agent orchestration.
- `Desktop-app/src/backend/tools.ts` - workspace sandbox tools.
- `Desktop-app/src/backend/db.ts` - chat/session persistence.
- `Desktop-app/src/App.tsx` - top-level stop workflow control, command approval state, and WebSocket abort/approval dispatch.
- `Desktop-app/src/components/ChatConsole.tsx` - pending command approval panel rendering.

## 4. State Management

The app currently uses React `useState`, `useEffect`, and refs rather than a global state library. State is split into:

- Provider credentials and model config.
- Active workspace root.
- Active UI space (one of: Plan, Crew, Flow, Forge — the 4-tab Build Loop).
- PLAN Scratchbook session history (persisted, continuable). Plan Workspace items array (persisted per project).
- Agent logs, checklists, and task items.
- Plan items with `id`, `title`, `status`, `category`, `workspace`, `blockedBy[]`, `criteria[]`.
- Acceptance criteria per plan item (two-phase: abstract at creation, enriched after workspace scan).
- Execution traces linking agent runs to plan items with per-criterion results.
- FLOW Today view state (prioritized task list, Execute Next / Execute All Today).
- Sync/account state.
- Subscription tier and role state.
- File preview/editor state.
- Planned Preview Deck state for active tab, preview URL, detected dev servers, terminal evidence, side chat session, artifacts, and review summary.

## 5. Persistence

Current persistence mechanisms:

- Browser `localStorage` for UI/config state.
- Backend JSON/session database for chat sessions.
- Home-directory JSON files for sync/account simulation.
- User schemas in `sync.ts` include tier/role data used for sync permission checks and RBAC simulator indicators.
- Workspace files under `.kryleos/` for local agents and skills.
- Legacy `.matrix/` folders are still read as fallback.

## 6. Agent Role Design

Standard roles:

- **Coordinator/Planner:** decides next action and delegates.
- **Developer/Builder:** edits and writes code.
- **Researcher/Analyst:** reads, searches, and explains code.
- **Debugger/Reviewer:** runs tests/builds and analyzes diagnostics.

The coordinator emits structured action blocks. The orchestrator parses those blocks and invokes the requested tool or agent.

Command execution is approval-gated. When the coordinator schedules a `tool: runCommand` action, the orchestrator enters `commandPendingApproval` state, broadcasts the pending command to the frontend, and pauses until a WebSocket approval or rejection response is received.

## 7. Tool Design

Tool operations include:

- `readFile`
- `writeFile`
- `modifyFile`
- `listDir`
- `grepSearch`
- `runCommand`

Custom script skills can be executed from `.kryleos/skills`. Markdown skills are treated as procedural instructions.

The current marketplace-style agent/skill experience is available to all tiers. It is implemented through on-disk scanning/deletion routes and supports both the rebranded `.kryleos` paths and legacy `.matrix` paths where still present.

`runCommand` supports active child process tracking so `killActiveProcesses()` can terminate long-running or aborted commands. Child processes are removed from tracking when they close or error.

## 8. Git-Backed Review Flow

The coding section includes a Review tab next to Explorer and Visualizer. This is a trust and inspection surface for AI-assisted coding runs, with Git as the primary source of truth where the workspace is a repository.

Implementation references:

- `App.tsx` owns the `appCodeTab` state and passes session `logs` into `CodeReviewPanel`.
- `CodeReviewPanel.tsx` loads Git-backed review state from `/api/review/current`.
- `CodeReviewPanel.tsx` falls back to parsing result logs containing `--- DIFF CONTENT ---` when Git review data is unavailable.
- `agents.ts` appends diff blocks to successful `modifyFile` results.
- `tools.ts` owns quiet internal Git execution, Git diff/status parsing, persistent review state, staging, unstaging, and safe revert behavior.
- `server.ts` exposes `/api/review/current`, `/api/review/status`, `/api/review/stage`, and `/api/review/revert`.
- `/api/workspace/revert` remains available as a session snapshot fallback for non-Git/session-log changes.

Persistent storage:

```text
.kryleos/reviews/review-state.json
```

Safe revert storage for untracked files:

```text
.kryleos/reverted/
```

Current behavior:

1. Review tab calls `/api/review/current`.
2. Backend verifies the workspace is inside a Git repository.
3. Backend reads `git status --porcelain -b`.
4. Backend loads working diffs with `git diff -- <path>` and staged diffs with `git diff --staged -- <path>`.
5. Untracked files render as new-file diffs from current file contents.
6. Review status is merged from `.kryleos/reviews/review-state.json`.
7. The Review tab lists changed files, status, additions/removals, risk notes, and selected diffs.
8. The user can persist `accepted`, `rejected`, `pending`, `staged`, or `reverted` status.
9. The user can stage or unstage files through `/api/review/stage`.
10. The user can revert tracked files through Git restore.
11. Reverting untracked files moves them to `.kryleos/reverted/` instead of deleting them.
12. The Review tab extracts terminal/build/test evidence from session logs.

Current limitation: this is now Git-backed and persistent for workspace file review, but it is still not a full pull-request system. It does not yet provide side-by-side diffs, inline comments, multi-reviewer approval flows, or hosted code review integration.

## 9. Planned Preview Deck Design

The coding workspace should add a `PreviewDeck` that replaces the current file-only right panel with a multi-tab supervision surface.

Planned component split:

```text
PreviewDeck.tsx
PreviewLivePane.tsx
PreviewTerminalPane.tsx
PreviewSideChatPane.tsx
PreviewArtifactsPane.tsx
PreviewReviewSummary.tsx
```

MVP behavior:

1. `PreviewDeck.tsx` owns tab layout and delegates pane rendering.
2. `Files` tab reuses the existing `FileBrowser`.
3. `Live Preview` accepts a local URL and renders it in an iframe/webview.
4. `Terminal` shows session command evidence, stdout/stderr snippets, and pending command approval state.
5. `Side Chat` creates a context-only side conversation that does not interrupt the main agent stream.
6. `Artifacts` lists and previews generated Markdown/text/HTML outputs.
7. `Review` summarizes the existing Git-backed review state and links to the full Review tab.

Security and lifecycle constraints:

- Starting or stopping dev servers must route through the existing approval-gated command model.
- Public URLs and preview content must be treated as untrusted.
- Provider keys, sync tokens, and workspace secrets must not be injected into preview contexts.
- Full browser automation and interactive terminal PTY support are later features, not MVP requirements.

## 10. Workspace Rule Loading

The workspace rule compatibility engine scans:

```text
.cursorrules
.cursor/rules
```

If files are present, their contents are parsed/formatted and appended to the agent system prompt as developer workspace rules.

Recommended instruction precedence:

1. UI custom instructions.
2. `.cursorrules` and `.cursor/rules`.
3. `.kryleosrc.json`, `.matrixcode.json`, `CLAUDE.md`, `.clauderc`, and `INSTRUCTIONS.md`.
4. Built-in role prompts.

## 11. Subscription and Feature Gates

Current tier structure: **Free → Solo ($5) → Solo Plus ($9) → Founder ($15) → Agency/Team ($39)**

Key tier gates:

- **Free:** all 4 Build Loop spaces (PLAN/CREW/FLOW/FORGE), BYOK/Ollama, 7 bundled agent packs. No sync, no execution tracing, no drift detection. Manual PLAN→CREW handoff (.md export only). What's Left: 5 items.
- **Solo:** adds basic execution tracing, PLAN→CREW direct Desktop sync, AI-generated acceptance criteria at item creation, basic drift detection (Not Started / In Progress / Complete).
- **Solo Plus:** adds full drift detection (Diverged + confidence scoring), trace history, mobile/web PLAN with Desktop sync. What's Left: 50 items.
- **Founder:** adds multi-repo plan scope, cross-repo drift, unlimited What's Left + Markdown export, plan versioning, plan item dependencies (blockedBy[]), agent specialization per item.
- **Agency/Team:** adds shared plan editing, team trace visibility, per-member execution history, client handoff packs, branded docs, RBAC simulator indicators.

Implementation references:

- `sync.ts` stores user/tier/role schema behavior and permission checks before sync pushes.
- WebSocket routes check connection authorization levels for collaboration and sync state.
- `tools.ts` handles `runCommand` tier-aware execution banners.
- `ConfigHeader.tsx` contains Google/Apple login SSO entry points and subscription controls.
- `CoworkSpace.tsx` renders Agency/Team collaboration indicators, cloud sync logs, specialists, and skills.
- Planning layer enforces `blockedBy[]` server-side (Founder+ only) and gates "What's Left" report generation by tier.

## 12. Build Loop UX and Behavioral Specifications

### PLAN Tab Layout

The PLAN tab has two areas rendered side by side:

**Left — Scratchbook (AI ideation chat):**
- Always a scratchpad. No Build/Ask mode toggle. Messages never auto-update the plan spec or Plan Workspace.
- Session history persists across sessions so conversations can be continued.
- Project name and workspace context are injected into every Scratchbook system prompt.
- **Summarize & Push** button: fixed at the bottom of the Scratchbook chat area. User clicks when they have confirmed an idea in conversation. Triggers a dedicated structured-output extraction call: the AI reads the conversation and produces one or more `PlanWorkspaceItem` objects for user review. User reviews the generated items in a modal (edit title, description, category) and clicks Confirm — items land in the Plan Workspace. Nothing enters the workspace without user confirmation.
- "Start Building" onboarding flow pre-loads the project description as the first Scratchbook message.

**Right — Plan Workspace (staging list):**
- Persisted list of structured plan items waiting to be sent to CREW.
- Each item schema:
  - `title`: string (AI-generated, user-editable)
  - `description`: string — 2–3 sentence AI summary of the confirmed idea
  - `category`: string — AI-inferred tag (`frontend` / `backend` / `infra` / `testing` / `security` / `docs` / `performance`)
  - `status`: `Draft` | `Ready for CREW`
  - `context`: string — collapsed block containing the relevant chat excerpt that produced this item
- **Check Feasibility** button per item: optional, non-blocking. Fires a single LLM call with inputs: project description + item title/description + current FLOW board task titles. Returns one of three verdicts: `✓ Feasible` (no obvious conflicts), `⚠ Needs Clarification` (ambiguous scope or missing context), `✗ Potential Conflict` (conflicts with existing FLOW item, tech stack, or stated constraints). Verdict stored on the item as a non-blocking badge. Item stays in workspace regardless of result. Available on all tiers; accuracy improves once FLOW board has populated tasks.
- **Push to CREW** button (per item or bulk-select): sends selected workspace items to CREW. Diff shown before any CREW state changes — same pattern as CREW → FLOW push. User confirms before items transfer.
- Items can be edited (title, description, category) or deleted from the workspace at any time.

### CREW Output Format

CREW personas produce their output as structured Markdown. Each plan item reviewed by CREW is represented as a `### [ITEM]` block:

```markdown
### [ITEM] Authentication System
- Status: Revised
- Category: backend
- Changes: OAuth deferred to V2; email/password only for V1.
- Criteria hint: loginEndpoint exists, auth middleware applied to protected routes.

### [ITEM] User Dashboard
- Status: Accepted
- Category: frontend
- Changes: none.
- Criteria hint: DashboardPage component renders without error.
```

"Push to FLOW" matches `[ITEM]` titles to existing FLOW tasks via fuzzy title match (item ID as fallback if synced). Unmatched items are offered as new tasks. The diff is shown as a before/after list before any FLOW state is mutated.

### Execution Trace Extraction

After each FORGE agent run, the orchestrator fires one dedicated structured-output extraction call — separate from the main agent stream — using this prompt structure:

```
Based on the work just completed, output a JSON object:
{
  "filesChanged": ["path/to/file"],
  "commandsRun": ["npm test"],
  "criteriaResults": [
    {"criterionId": "...", "result": "pass"|"fail", "evidence": "one sentence"}
  ],
  "summary": "one sentence"
}
Plan item: [item title and description]
Criteria: [serialized criteria list]
Session log: [last 60 lines of agent output]
```

Structural criteria (`file_exists`, `symbol_exists`, `git_grep`, `test_passes`) are evaluated by actual code/test checks before this call — their results are pre-populated. Only `llm_check` criteria use LLM evaluation. Use function/tool calling on models that support it; use `<json>` delimiters with tolerant extraction on others.

### FLOW Today View Score Algorithm

Score per eligible (unblocked) plan item:

```
score = 0
score += 10  if status == "in_progress" and has active trace
score += 5   if any blocker was marked Complete in last 24h
score += 3 * count(items where this item is in their blockedBy[])
score += min(daysSinceCreation, 7)
```

Top 3–5 items by score appear in Today view. Ties broken by creation order. Recalculates deterministically on every FLOW open — no AI call, no network request.

### What's Left Prioritization Prompt

Single LLM call over the full unresolved item list:

```
You are a software project advisor. Score each item 1-10 on:
- Blocking potential: how many other items depend on this directly or transitively?
- Delivery risk: if undone, how likely to delay the project?
- Execution readiness: can it start now with no missing info or unresolved blockers?

Return ONLY a JSON array of the top [N] items ordered by combined score descending:
[{"id": "...", "title": "...", "reason": "one sentence why this is highest priority now"}]

Items: [serialized array of {id, title, status, category, blockedBy[], estimatedComplexity}]
```

N = tier limit (5/25/50/unlimited). The `reason` is displayed to the user in the What's Left panel.

### ProjectSetupScreen Field Spec

Four fields, one screen, target under 60 seconds to complete:

1. **Project name** — text input, required.
2. **Workspace folder** — folder picker, required. If skipped, defaults to `~/Documents` with a "file tools limited" warning banner in PLAN.
3. **What are you building?** — multiline textarea, label: "Describe your project in 2–3 sentences. This seeds your PLAN." Pre-loaded as the first Scratchbook message on submit.
4. **Model provider** — if no API key configured: inline note "You'll need an API key or Ollama — set up in CONFIG →" with a skip option.

CTA: "Start Building" → PLAN Scratchbook with description pre-loaded. No additional survey fields.

### In-App Upgrade Flow (Pre-Stripe)

1. User hits a tier gate → inline nudge below the locked action (feature name + unlocking tier + price + "Upgrade →" button). Not a blocking modal.
2. "Upgrade →" opens an in-app modal: two-column tier comparison highlighting the specific locked feature, CTA button "Get [Tier] for $X/mo →" opens Gumroad/Lemon Squeezy in the system browser.
3. User pays externally, receives license key via email.
4. CONFIG panel has a "License Key" input field. On entry, the app validates via a local hash check (bundled key format — no server call needed). Tier state updates immediately.
5. Post-launch: replace license key entry with a Stripe checkout modal. Same entry points, no UX redesign.

## 13. Build Loop Data Models

### PlanItem

```typescript
interface PlanItem {
  id: string;
  title: string;
  description?: string;
  status: 'not_started' | 'in_progress' | 'complete' | 'diverged' | 'needs_review';
  category: 'frontend' | 'backend' | 'testing' | 'security' | 'docs' | 'infra' | string;
  workspace?: string;           // path for multi-repo assignment
  blockedBy: string[];          // plan item IDs that must be Complete first (Founder+)
  criteria: AcceptanceCriterion[];
  createdAt: string;
  updatedAt: string;
}
```

### AcceptanceCriterion

```typescript
type CriterionType = 'file_exists' | 'symbol_exists' | 'test_passes' | 'git_grep' | 'llm_check';

interface AcceptanceCriterion {
  id: string;
  type: CriterionType;
  value: string;        // path/symbol/suite name/grep pattern/description
  phase: 1 | 2;        // Phase 1 = abstract (no paths), Phase 2 = enriched with real paths
  result?: 'pass' | 'fail' | 'pending';
}
```

Phase 1 criteria are generated at plan item creation with no file path assumptions. Phase 2 enrichment runs after the first workspace scan or agent run, resolves real file paths, and is shown to the user as a diff for confirmation before saving.

### ExecutionTrace

```typescript
interface ExecutionTrace {
  id: string;
  planItemId: string;
  agentRole: string;
  startedAt: string;
  completedAt?: string;
  filesChanged: string[];
  commandsRun: string[];
  criteriaResults: { criterionId: string; result: 'pass' | 'fail' }[];
  allCriteriaPassed: boolean;   // true triggers auto-complete suggestion (user must confirm)
}
```

Traces are stored under `.kryleos/traces/<planItemId>/`. Never sent to external services unless explicitly exported.

### Agent Specialization — Capability Map

Agent routing for FORGE execution follows a three-tier fallback:

1. Exact match: item `category` = agent's primary category.
2. Capability overlap: item `category` in agent's `capabilities[]` array.
3. General orchestrator fallback with visible FLOW card indicator: "No [category] specialist — using general agent."

Bundled agents (7): React Expert (frontend), Python Backend Specialist (backend), Security Auditor (security+backend), Test Writer (testing+frontend+backend), Performance Reviewer (performance+frontend+backend+infra), Documentation Writer (docs), DevOps Specialist (infra: Docker, CI/CD, GitHub Actions, deployment).

## 13. Command Approval and Interrupt Flow

Implementation references:

- `agents.ts` owns `commandPendingApproval`, pending command state, and `killActiveProcesses()`.
- `agents.ts` exposes `abortExecution()` to reject pending approvals and terminate tracked command processes.
- `server.ts` maps WebSocket messages `approve_command` and `abort_execution`.
- `ChatConsole.tsx` renders the current approval controls `[APPROVE & RUN]` and `[REJECT]`.
- `App.tsx` renders `[STOP CURRENT WORKFLOW]` while `isStreaming` is active.

Expected flow:

1. Agent proposes `tool: runCommand`.
2. Orchestrator broadcasts pending command with a generated `commandId` and pauses.
3. Frontend renders approval/cancel controls.
4. User approves or rejects.
5. Frontend sends `approve_command` with `approved` and `commandId`.
6. Backend rejects stale approvals, resumes command execution, or returns a cancellation result.
7. If user clicks stop during streaming, backend aborts active workflow, rejects pending approval, kills child processes, and clears locks.

Current implementation note: the repository includes cryptographic signing helpers in `security.ts`, but the reviewed UI flow does not perform browser-side signature generation. The active safety check is user approval over WebSocket plus command ID matching.

## 13. Error Handling

Current error handling is practical but lightweight:

- UI alerts for some file/sync failures.
- Backend JSON error responses.
- Agent log entries for terminal errors.
- Try/catch around optional workspace files.

Future improvement: centralize user-facing error states and replace most blocking alerts with inline notifications.

## 14. Compatibility Notes

The app was rebranded from an earlier Matrix-themed prototype. Some internal CSS/localStorage key names still use lowercase `matrix-*` for compatibility. User-facing product copy should use **Kryleos Forge**.
