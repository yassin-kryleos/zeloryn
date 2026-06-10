# Test Plan

## 1. Verification Goals

The test strategy should prove that Kryleos Forge can safely and reliably support local AI-assisted development workflows.

## 2. Existing Automated Tests

Current automated coverage includes backend sandbox behavior.

Run:

```bash
cd Desktop-app
npm test
```

Expected result:

- Vitest completes successfully.
- All current backend tests pass.
- Latest reviewed result: 8 test files passed, 52 tests passed.

Note: in restricted sandboxed execution, tests may fail with `EPERM` while creating temporary workspace folders. Rerun with normal project filesystem permissions to verify app behavior rather than sandbox restrictions.

## 3. Build Verification

Run:

```bash
cd Desktop-app
npm run build
```

Expected result:

- TypeScript build succeeds.
- Vite production build succeeds.
- `dist/` output is generated.
- Latest reviewed result: `npm.cmd run build` passes for `Desktop-app`.

## 4. Manual Smoke Test

### Startup

- Launch development app.
- Confirm Electron window opens.
- Confirm backend connects.
- Confirm connection indicator is online.

### Workspace

- Select a workspace.
- Open file browser.
- Preview a source file.
- Create a test file.
- Edit and save file.
- Delete test file.

### PLAN Space

- Open the PLAN space; confirm it defaults to Build mode.
- Send a message in Build mode; confirm spec context accumulates across the session.
- Toggle to Ask mode; confirm the query is treated as ephemeral (no spec change).
- Use `@file` mention; confirm referenced file context affects response.
- Create a plan item from a Build mode message; confirm AI-generated acceptance criteria are shown for review before saving.

### Agents

- Open Crew space.
- Run a coding task.
- Confirm planner/builder/analyst/reviewer logs display.
- Confirm checklist updates where applicable.

### Project Board

- Add task.
- Move task to in progress.
- Move task to done.
- Run task through agent workflow.

### Graph

- Open Forge/code graph view.
- Confirm graph loads.
- Select a node.
- Preview/pin file from graph.

### Planned Preview Deck

When the Preview Deck is implemented:

- Open the Forge/code workspace.
- Confirm the right-side deck shows tabs for Files, Live Preview, Terminal, Side Chat, Artifacts, and Review.
- Confirm the Files tab preserves existing file browser, preview, edit, create, delete, and Git behavior.
- Enter a local dev URL such as `http://localhost:3000` and confirm Live Preview renders it.
- Confirm Live Preview supports refresh and open-external actions.
- Confirm public or remote URLs are treated as untrusted and do not receive secrets.
- Confirm starting a dev server requires command approval rather than silently executing a package script.
- Confirm stopping a dev server only affects tracked Kryleos-started processes.
- Confirm Terminal tab shows recent command history, stdout/stderr evidence, and pending approval state.
- Confirm Side Chat can answer a context question without interrupting the active main workflow.
- Confirm Side Chat cannot silently write files or run commands.
- Confirm Artifacts tab previews generated Markdown/text/HTML outputs.
- Confirm Review summary shows changed file count, risk notes, and latest verification evidence.
- Confirm incomplete capabilities are labeled `Preview`, `Planned`, or `Simulator`.

### Git-Backed Coding Review

- Open a Git workspace with one tracked modified file, one staged file, and one untracked safe file.
- Open the coding section Review tab.
- Confirm Git working and staged changes appear with addition/removal counts.
- Confirm the selected diff renders added and removed lines clearly.
- Confirm staged and working diffs are separated where both exist.
- Confirm the Review tab shows command/build/test evidence after a terminal command runs.
- Confirm risk notes appear for dependency/config files, sensitive-looking text, large changes, or security-adjacent edits.
- Click Open and confirm the file preview modal shows current file contents.
- Click Accept and confirm the accepted status persists after refresh.
- Click Reject and confirm the rejected status persists without reverting the file.
- Click Stage and confirm the file moves into Git staged state.
- Click Unstage and confirm the file returns to working changes.
- Click Revert on a tracked file and confirm Git restore returns it to repository state.
- Click Revert on an untracked file and confirm it is moved to `.kryleos/reverted/`, not permanently deleted.
- Open a non-Git workspace and confirm the Review tab falls back to session-level agent diffs when available.
- Confirm the UI does not imply pull-request review, multi-reviewer approval, or hosted code review integration.

### Desktop Notifications

- Trigger file preview save success and confirm a non-blocking toast appears.
- Trigger a File Browser error and confirm a non-blocking error toast appears.
- Trigger Git stage/commit/push/pull outcomes and confirm they use toast feedback instead of blocking alerts.
- Trigger Review accept/reject/stage/unstage/revert outcomes and confirm toast feedback appears.
- Click Review Revert and confirm an inline confirmation panel appears before the destructive action runs.
- Trigger Config Header Google/workspace status outcomes and confirm toast feedback appears.
- Trigger Cowork specialist/skill import/create/delete outcomes and confirm toast feedback appears.
- Trigger Planning import/report outcomes and confirm toast feedback appears.
- Click Cowork workspace skill delete and confirm an inline confirmation panel appears before deletion.

### Git

- Open Git panel in a Git workspace.
- Confirm branch/status display.
- Stage a safe test file.
- Commit with a test message.
- Pull/push only against a safe test repository.

### Custom Agents and Skills

- Create a custom agent under `.kryleos/agents`.
- Create a Markdown skill under `.kryleos/skills`.
- Confirm app loads them.
- Confirm duplicate legacy `.matrix` entries do not override `.kryleos` entries unexpectedly.

### Workspace Rules

- Add `.cursorrules` in the workspace root with a recognizable mock instruction.
- Ask the agent a simple question.
- Confirm the agent system instructions include the rule and behavior reflects it.
- Add `.cursor/rules` and confirm those rules are also loaded.
- Confirm workspace rules cannot bypass command approval.

### Command Approval

- Ask for a task that requires a terminal command, such as `npm run lint`.
- Confirm the agent pauses instead of running the command silently.
- Confirm `ChatConsole.tsx` shows the command approval controls.
- Current reviewed UI labels are `[APPROVE & RUN]` and `[REJECT]`.
- Click approve and confirm stdout/stderr are logged.
- Repeat and click cancel; confirm the command does not execute and the agent loop recovers.
- Confirm approval includes the pending backend `commandId` and stale approvals are rejected.
- Confirm approval logs include `COMMAND APPROVED`.
- Confirm rejection logs include `COMMAND REJECTED BY USER`.
- Confirm stale approval protection logs include `STALE COMMAND APPROVAL BLOCKED`.

### Graceful Interrupt

- Start a long-running workflow or command.
- Confirm `[STOP CURRENT WORKFLOW]` appears while `isStreaming` is active.
- Click stop.
- Confirm active child processes terminate.
- Confirm streaming/approval locks release.
- Confirm a new prompt can be submitted afterward.
- Confirm abort rejects any pending command approval prompt if the agent is paused waiting for approval.
- Confirm abort logs include `WORKFLOW ABORTED BY USER`.
- Confirm abort while waiting for command approval says the pending command was cancelled before execution.

### Build Loop — Acceptance Criteria, Tracing, and Drift

- Create a plan item; confirm Phase 1 abstract criteria are generated and presented for review.
- Run the first workspace scan or agent run on a plan item; confirm Phase 2 criteria enrichment diff is shown for confirmation.
- Complete an agent run on a plan item; confirm an execution trace is created under `.kryleos/traces/`.
- Confirm the trace shows files changed, commands run, and per-criterion pass/fail results.
- Confirm "Auto-complete suggestion" fires only when all criteria pass, and requires user confirmation before persisting.
- Run drift detection; confirm items are classified as Complete / In Progress / Not Started / Diverged / Needs Review.
- Confirm "Diverged" classification uses a targeted LLM call and shows the specific criterion that caused the divergence.

### Build Loop — FLOW and Dependencies

- Open FLOW space; confirm Today view is the default landing with 3–5 prioritized unblocked tasks.
- Confirm Execute Next sends a single task to FORGE.
- Confirm Execute All Today queues tasks in sequence with per-item approval.
- Set a `blockedBy[]` dependency on a plan item; confirm it is greyed in FLOW and "Send to FORGE Agent" is disabled server-side.
- Mark the blocker item Complete; confirm the dependent item auto-unblocks.
- Confirm "What's Left" is gated: Free tier shows max 5 items, Solo 25, Solo Plus 50, Founder unlimited.

### Build Loop — CREW and Onboarding

- Initiate a PLAN→CREW handoff as Free tier; confirm structured .md export is the only option (direct sync blocked server-side).
- Initiate a PLAN→CREW handoff as Solo+ tier; confirm direct sync button is available.
- In CREW, add a specialist persona (Technical Reviewer, Scope Guard, Risk Identifier); confirm all three are auto-suggested on PLAN→CREW handoff.
- Click "Push to FLOW" in CREW; confirm a diff of CREW output vs existing FLOW tasks is shown before any tasks are updated.
- Open the app on a workspace with an existing codebase; confirm bootstrap onboarding: workspace scan → guided PLAN session → free first "What's Left" run.

### Subscription Tiers

- Confirm Free tier can use all 4 Build Loop spaces, local workspace tools, Ollama, and BYOK model calls.
- Confirm Free tier cannot push/pull cross-device sync or use PLAN→CREW direct sync.
- Confirm Solo tier unlocks WebSocket-powered sync, execution tracing, and AI-generated acceptance criteria.
- Confirm Solo Plus tier unlocks full drift detection (Diverged classification) and cross-device PLAN sync.
- Confirm Founder tier unlocks plan item dependencies, multi-repo scope, and unlimited What's Left.
- Confirm Agency/Team tier displays online peer count indicators and cloud sync logs in `CoworkSpace.tsx`.
- Confirm Agency/Team tier displays RBAC/OWNER role indicators in the Crew dashboard.
- Confirm Free/Solo/Solo Plus tiers display `[WARNING: LOCAL HOST EXECUTION ACTIVE]` for command execution.
- Confirm `/api/auth/subscribe` changes tier state dynamically and pushes configuration changes to storage.
- Confirm subscription UI labels mock billing with a `mock` badge.
- Confirm Cloud Sync surfaces display a `preview` badge.
- Confirm Agency/Team collaboration surfaces display `preview` and RBAC `simulator` badges.
- Confirm no Desktop UI claims production remote containers, production RBAC, or full production collaboration.
- Confirm Web companion pricing, chat sandbox, sync, collaboration, semantic cache, rollback, RBAC, telemetry, keychain, and billing areas show the correct production/preview/simulator/mock badges.
- Confirm Mobile companion sync, collaboration, semantic cache, rollback, RBAC, and account billing areas show preview/simulator/mock badges.
- Confirm Web and Mobile companion copy describes collaboration/RBAC/rollback as preview or simulator behavior, not production enterprise infrastructure.

## 5. Regression Checklist

- [ ] Build passes.
- [ ] Tests pass.
- [ ] App opens.
- [ ] Workspace selection works.
- [ ] Chat streaming works.
- [ ] File read/write works.
- [ ] Git status works.
- [ ] Project board works.
- [ ] Graph loads.
- [ ] Planned Preview Deck shows Files, Live Preview, Terminal, Side Chat, Artifacts, and Review tabs once implemented.
- [ ] Coding Review tab shows Git working/staged diffs, persistent status, evidence, risk notes, file preview, stage/unstage, and safe revert behavior.
- [ ] Core App shell, File Browser, Review, Config Header, Cowork, and Planning actions use non-blocking toast notifications.
- [ ] Config modal saves settings.
- [ ] No old Matrix-Coding public branding appears.
- [ ] PLAN Build mode accumulates spec across sessions; Ask mode is ephemeral.
- [ ] Acceptance criteria generated at plan item creation (Phase 1 abstract).
- [ ] Phase 2 criteria enrichment diff shown for user confirmation after workspace scan.
- [ ] Execution traces stored under `.kryleos/traces/` after agent runs.
- [ ] Drift detection classifies all 5 statuses correctly.
- [ ] FLOW Today view shows 3–5 prioritized unblocked tasks.
- [ ] `blockedBy[]` enforced server-side — blocked items cannot be sent to FORGE.
- [ ] What's Left gated by tier (5/25/50/unlimited).
- [ ] PLAN→CREW direct sync blocked server-side for Free tier.
- [ ] CREW "Push to FLOW" shows diff before updating tasks.
- [ ] Tier-specific sync, execution, collaboration, and RBAC indicators behave as expected.
- [ ] Preview/simulator/mock feature labels appear on high-risk Desktop, Web, and Mobile subscription and collaboration surfaces.
- [ ] Command approvals block silent shell execution.
- [ ] Workflow stop button aborts active agent work cleanly.
- [ ] `.cursorrules` and `.cursor/rules` are loaded into system instructions.
- [x] Latest reviewed build passes.
- [x] Latest reviewed automated test suite passes.

## 6. Future Automated Tests

- REST route tests.
- WebSocket protocol tests.
- Agent action parser tests.
- File mention resolution tests.
- Graph generation tests.
- Review panel parsing tests for Git review API data, fallback diff logs, evidence logs, and risk notes.
- Review panel interaction tests for accept/reject persistence, stage/unstage, open preview, and revert API calls.
- Backend Git review tests for status, diff, persistent review state, stage, unstage, and safe revert behavior.
- Credential storage tests.
- Subscription tier transition tests.
- Sync permission tests by tier.
- Remote execution banner tests.
- Enterprise RBAC indicator tests.
- Command approval WebSocket tests.
- Abort execution WebSocket tests.
- Child process tracking and abort termination tests.
- Stale command ID rejection tests.
- Workspace rule loading tests.
- UI component tests for key workflows.
- Preview Deck component tests for tab switching, local URL preview state, terminal evidence rendering, artifact preview, and review summary.
- Preview route tests for server discovery and approval-gated server start/stop.
- Acceptance criteria generation tests (Phase 1 abstract, Phase 2 enrichment diff).
- Execution trace creation, retrieval, and per-criterion result tests.
- Drift detection classification tests for all 5 statuses (including Diverged LLM call path).
- `blockedBy[]` enforcement tests — server-side rejection when dependencies unresolved.
- "What's Left" tier gate tests (5/25/50/unlimited).
- PLAN→CREW direct sync tier gate test (blocked for Free).
- FLOW Today view ordering algorithm tests (in-progress → high-priority → recently unblocked).
- Existing project bootstrap tests (workspace scan → pre-marked Complete items → free first What's Left run).
- Agent specialization routing tests (exact match → capability overlap → general fallback with indicator).
