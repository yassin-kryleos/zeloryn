# Phase 1-10 Implementation Plan

## 1. Purpose

This document turns the release-readiness strategy into an execution plan for implementing Kryleos Forge from its current MVP state into the only AI coding tool that manages a project from plan to board to execution — through **the Build Loop**: PLAN → CREW → FLOW → FORGE.

The plan has a clear priority order: stabilize the desktop, make feature claims honest, ship the Build Loop (execution tracing, drift detection with acceptance criteria, multi-repo scope, plan item dependencies, agent specialization), then build supporting capabilities. The Build Loop is the primary differentiator and gets Sprint 4 before provider setup, cost guard, or VS Code extension work.

Primary target:

```text
Own the project-level AI execution category. Be the tool users describe as "it manages my whole project, not just my files."
```

Commercial target:

```text
$2k-$3k/month early MRR
```

## 2. Execution Principles

- Ship in small vertical slices that users can actually try.
- Keep Desktop as the primary product until it is stable.
- The Build Loop (PLAN → CREW → FLOW → FORGE → trace → verify) is the product identity. Every sprint either builds it or supports it.
- Label preview, simulator, mock, and planned features honestly.
- Keep safety features available across all plans.
- Treat Git, local files, and user approval as trust boundaries.
- Do not market simulated Enterprise features as production features.
- Add automated tests around release-critical flows before expanding scope.
- Do not sprint on VS Code extension until the project execution loop is complete and visible. A companion extension to an unclear product is not useful.

## 3. Current Baseline

Already implemented foundations:

- Electron desktop app.
- React/Vite frontend.
- Local Express backend.
- WebSocket streaming.
- Multi-agent orchestration.
- Workspace file tools.
- Git helper routes.
- Git-backed coding Review tab.
- Persistent review status under `.kryleos/reviews/`.
- Safe untracked-file revert into `.kryleos/reverted/`.
- Command approval and graceful abort.
- Response modes.
- Voice input MVP.
- Web and Mobile companion MVPs.
- Project documentation pack.
- Subscription tier simulation.

Current blockers before public release:

- **Build Loop not yet built:** execution tracing with acceptance criteria, plan drift detection, plan item dependencies, agent specialization per item, and multi-repo task routing do not exist. This is the primary differentiator and the highest-priority build item after Phase 2.5.
- Simulated features need consistent labels.
- Blocking alerts need replacement.
- First-run experience opens to chat, not project setup — must be reversed.
- Secure credential storage is not production-grade.
- Billing is mocked.
- Sync/auth are prototype-level.
- Docs Autopilot is not productized.
- Cost Guard is not yet a full user-visible system.
- The coding workspace does not yet have a unified Preview Deck for files, local app preview, terminal evidence, side chat, artifacts, and review status.
- Local model setup needs smoother onboarding.
- Web/Mobile companions need clearer scope and reliability.
- Release packaging, support, legal, and launch assets are incomplete.

## 4. Recommended Milestone Order

| Milestone | Main Outcome | Phases Covered |
|---|---|---|
| M1 Private Release Candidate | Stable daily-use desktop app with honest feature labels, UI professionalization, community agents, Plan→Flow sync, and a usable coding Preview Deck. | 1, 2, 2.5 |
| M2 Project Execution Loop | Execution tracing, plan drift detection, multi-repo task routing, project-setup-first onboarding. This is the product identity milestone. | 2.6 |
| M3 Solo Developer Beta | Docs Autopilot, Cost Guard, provider setup. Early Lifetime deal launches alongside Docs Autopilot. | 3, 4, 5, 6 |
| M4 Paid Solo Launch | Packaging, Stripe billing, Solo/Solo Plus entitlements. VS Code extension (Phase 2.7) also ships here. | 7, 2.7, 9, 10 partial |
| M5 Founder Workflow Launch | Founder documentation/product workflows. | 8 |
| M6 Agency/Team Preview | Handoff packs, branded docs, collaboration/RBAC previews. | 8, 10 |

## 5. Phase 1 - Desktop Stability and Trust

### Goal

Make Desktop reliable enough for real daily solo-dev use.

### Implementation Work

1. Replace blocking `alert()` calls with a shared notification/toast system.
2. Add consistent loading, empty, offline, and error states to primary panels:
   - Chat Console.
   - File Browser.
   - Code Review.
   - Config/Header.
   - Project Board.
   - Planning screen.
   - Cowork space.
3. Polish command approval UX:
   - clear proposed command display,
   - approve/reject status,
   - stale approval handling,
   - terminal evidence after execution.
4. Polish graceful abort UX:
   - visible stop state,
   - clear aborted logs,
   - no locked input after abort.
5. Finish Review tab polish:
   - persistent status display,
   - working/staged diff clarity,
   - refresh state,
   - safer revert confirmation,
   - large diff truncation.
6. Remove corrupted/mojibake UI copy.
7. Sweep user-facing Matrix-era naming and replace with Kryleos Forge.
8. Fix real lint issues where reasonable instead of permanently relaxing lint rules.

### Dependencies

- Existing Review tab and command approval implementation.
- Existing backend tool routes.

### Tests

- `npm.cmd run build`
- `npm.cmd test`
- `npm.cmd run lint`
- Manual workspace smoke test.
- Manual command approval/abort test.
- Manual Review tab Git test.

### Exit Criteria

- Desktop build passes.
- Tests pass.
- Lint has no errors.
- User can open a repo, ask for a change, approve a command, review Git diffs, stage/revert safely, and continue working.

## 6. Phase 2 - Honest Feature Packaging

### Goal

Prevent trust damage by making feature maturity explicit.

### Implementation Work

1. Add a shared feature status registry:

```ts
type FeatureStatus = 'production' | 'preview' | 'simulator' | 'mock' | 'planned';
```

2. Create one source of truth for feature labels:
   - Desktop UI.
   - Web UI.
   - Mobile UI.
   - Subscription/pricing UI.
   - Documentation.
3. Rename user-facing claims:
   - Remote Container Execution -> Remote Container Preview.
   - Hosted Cloud IDE -> Cloud IDE Preview.
   - Team Collaboration -> Collaboration Preview.
   - Enterprise RBAC -> RBAC Simulator.
   - Billing Integration -> Mock Billing until Stripe is live.
4. Add small status badges in feature surfaces.
5. Update pricing/tier screens to match the growth strategy.

### Dependencies

- Subscription tier definitions.
- Feature surfaces in Config/Header, Cowork, tools, and docs.

### Tests

- Snapshot/manual UI review for plan labels.
- Search code/docs for forbidden production claims.
- Verify all simulated features have preview/simulator/mock labels.

### Exit Criteria

- No public UI claims production remote containers, production RBAC, full production collaboration, or live billing unless actually implemented.

## 7. Phase 2.5 - Preview Deck, UI Professionalization, Community Agents, and Plan Sync

### Goal

Ship four deliverables in one sprint: (1) the coding Preview Deck, (2) a professional default UI theme, (3) community agent starter packs, and (4) Plan→Flow task sync. These are the strongest differentiating surface-level changes that can be completed before the VS Code extension work begins.

Detailed Preview Deck strategy: `16-Preview-Deck-and-Workspace-Panes.md`.

### Implementation Work

**Preview Deck:**

1. Add `PreviewDeck.tsx` to the coding workspace.
2. Move the existing right-side File Browser into the deck as the `Files` tab.
3. Add tabs: `Files`, `Live Preview`, `Terminal`, `Side Chat`, `Artifacts`, `Review`.
4. Add Live Preview MVP: URL input, local dev URL iframe/webview, refresh, open externally, detected server suggestions from common ports and recent terminal logs.
5. Add Terminal Evidence MVP: latest commands, stdout/stderr snippets, pending command approval status. No full interactive PTY in V1.
6. Add Side Chat MVP: context-only side questions, separate side chat session state, no silent file writes or command execution.
7. Add Artifacts MVP: list generated Markdown/text/HTML outputs, preview selected artifact content, prepare integration point for Docs Autopilot.
8. Add Review summary: changed file count, risk notes, latest verification evidence, link to the full Review tab.
9. Add honest status labels for tabs that are not fully implemented.
10. Keep the first release as a fixed right deck; drag-and-drop panes can wait.

**UI Professionalization:**

11. Set `theme-forge` as the app default CSS class, replacing `theme-matrix` as the initial theme.
12. `theme-forge` must use a dark background with matrix green as an accent colour (active states, status indicators, highlights) — not as primary body text colour.
13. Demote `CodeRain.tsx` from the default background to an opt-in setting accessible via preferences.
14. Clean tab labels to plain words: `Chat`, `Plan`, `Crew`, `Flow`, `Forge`. Remove bracket/function-key annotation from primary visual labels. Keyboard shortcut hints may remain as tooltips.

**Community Agent Starter Packs:**

15. Bundle at least six agent definitions with the app binary: `React Expert`, `Security Auditor`, `Test Writer`, `Documentation Writer`, `Performance Reviewer`, `Python Backend Specialist`.
16. Store packs as static JSON/Markdown files inside the binary.
17. Surface one-click install into `.kryleos/agents/` in the CREW space, shown prominently when no custom agents are installed.
18. Add a `Share Agent` button that exports the selected agent as a GitHub Gist via `/api/artifacts/publish`.

**Plan→Flow Task Sync:**

19. When a user imports a plan via the PLAN space, auto-parse checklist items and offer them for population into the FLOW Kanban board.
20. Add a `Send to FORGE Agent` button on individual plan items that routes the item as a query to the multi-agent orchestrator.
21. The PLAN → CREW → FLOW → FORGE loop must be navigable without manual copy-paste.

**CREW Agent Personas:**

22. Bundle three specialist CREW personas as pre-built agent definitions: `Technical Reviewer`, `Scope Guard`, `Risk Identifier`.
23. When a user initiates a PLAN→CREW handoff, auto-suggest these three personas as a bundle before CREW opens.
24. Install behavior: one-click install into `.kryleos/agents/`, available on all tiers, no network request required.
25. Free tier PLAN→CREW handoff: export plan as structured .md file with one-click export action in the PLAN toolbar. User manually copies the output and pastes into CREW.
26. Solo tier and above: add direct PLAN→CREW sync button that sends plan content to CREW without export/copy-paste.

### Dependencies

- Existing File Browser.
- Existing Git-backed Review tab.
- Existing session logs and command approval state.
- Feature status badge system.
- Future Docs Autopilot artifact outputs.
- `/api/artifacts/publish` route for Gist sharing.
- Planning import route (`/api/planning/import`) for Plan→Flow sync.

### Tests

- Desktop build/test/lint.
- Manual Files tab regression test.
- Manual local URL preview test with a Vite or static dev server.
- Manual command approval state visibility in the Terminal tab.
- Manual Side Chat test to confirm the main workflow is not interrupted.
- Manual artifact preview test for Markdown/text files.
- Manual Review summary test in a Git workspace with changed files.
- Verify `theme-forge` is the default on fresh launch.
- Verify CodeRain is not displayed by default.
- Verify tab labels show plain words without bracket annotation.
- Install a community agent starter pack and confirm it appears in CREW.
- Import a plan and confirm checklist items are offered to FLOW.
- Use `Send to FORGE Agent` on a plan item.

### Exit Criteria

- Coding workspace includes a visible Preview Deck.
- Existing file browsing/editing still works.
- User can render a local app URL inside the app.
- Terminal tab shows command evidence and approval state.
- Side Chat can answer context questions without derailing active work.
- Artifacts tab previews generated outputs.
- Review summary reflects current Git-backed review state.
- Unfinished capabilities are labeled `Preview`, `Planned`, or `Simulator`.
- App launches with `theme-forge` as the default and no CodeRain background.
- Tab labels are plain words without F-key annotation.
- Six community agent starter packs are available for one-click install.
- Plan import offers Kanban tasks automatically.

## 8. Phase 2.6 - Planning Layer V2 — Project Execution Loop

### Goal

Build the three capabilities that establish Forge as the only AI coding tool operating at the project level. This is the product identity sprint. No competitor has execution tracing, plan drift detection, or multi-repo task routing.

### Implementation Work

**AI-Generated Acceptance Criteria — Two-Phase (root solution for tracing and drift accuracy):**

1. **Phase 1 (at item creation):** generate abstract structural criteria that don't depend on file paths: `symbol_exists: "authenticateUser"`, `test_passes: "auth suite"`, `llm_check: "login flow handles invalid credentials"`. These never block on workspace state and survive refactors.
2. Present Phase 1 criteria to the user for review and edit before saving. Never auto-apply silently.
3. Store Phase 1 criteria in the plan item data model.
4. **Phase 2 (after first workspace scan or first agent run):** scan the workspace and enrich abstract criteria with concrete evidence: `file_exists: src/features/auth/LoginForm.tsx`. Show the user a diff: "We found these files — do these match your intent?" User confirms or edits. Phase 2 runs automatically post-first-agent-run or on manual workspace re-scan trigger.
5. All execution tracing and drift detection evaluates the accepted criteria (Phase 1 or Phase 2) — never raw plan text.
6. Add backend routes: `POST /api/plan/items/:id/criteria`, `PATCH /api/plan/items/:id/criteria` (enrichment), `GET /api/plan/items/:id/criteria`.

**Execution Tracing:**

6. Modify `AgentOrchestrator.handleUserQuery()` to accept an optional `planItemId` context payload.
7. After each run, emit a structured `ExecutionTrace` object: `{ planItemId, filesChanged[], commandsRun[], outcomes[], criteriaResults[], timestamp }`.
8. Persist traces under `.kryleos/traces/{timestamp}-{planItemId}.json`.
9. In the PLAN space, after a run completes, render a trace card on the originating plan item: criteria checklist (✓/✗ per criterion), files changed, commands run, suggested status.
10. Auto-suggest marking the item complete when all criteria pass. Require user click to confirm — do not auto-close silently.
11. Surface active trace progress in real time in the Preview Deck Terminal tab.

**Plan Drift Detection:**

12. Implement `checkPlanDrift(planItems, workspacePath)` in the planning layer.
13. For each plan item, evaluate its acceptance criteria against codebase signals:
    - **Complete:** all criteria pass.
    - **In Progress:** some criteria pass, others fail.
    - **Not Started:** no criteria pass, no traces.
    - **Diverged:** criteria fail in a way that conflicts with plan expectation — evaluated using a single targeted LLM call (criterion + code diff). Never mark Complete without user confirmation.
    - **Needs Review:** low-confidence case, insufficient signals — catch-all to avoid false Complete labels.
14. Expose `GET /api/plan/drift` backend route returning per-item classifications.
15. Render drift badges on plan items in the PLAN space.
16. Show a summary bar: "8 complete · 3 in progress · 4 not started · 1 diverged."
17. Run drift detection automatically after every agent run that closes a task.
18. Add a manual "Check Plan Drift" button in the PLAN space toolbar.

**Multi-Repo Plan Scope:**

19. Allow plan items to carry a `workspace` field (directory path).
20. Parse workspace assignments from imported plans (e.g. `[repo: frontend]` syntax).
21. In the FLOW board, group or badge tasks by workspace assignment.
22. When `Send to FORGE Agent` is triggered, activate the item's assigned workspace sandbox.
23. Persist workspace assignments in the plan data model.

**Plan Item Dependencies:**

24. Add `blockedBy[]` array to the plan item data model (list of plan item IDs).
25. Items with unresolved blockers must be visually greyed out in the FLOW board.
26. The `Send to FORGE Agent` control must be disabled on blocked items.
27. Blocking items that become Complete must automatically unblock their dependents.
28. Add UI to view and edit blocker relationships on any plan item.

**Agent Specialization per Plan Item:**

29. When a plan item is created, AI-tag it with a category: `frontend`, `backend`, `testing`, `security`, `docs`, or `infra`.
30. Store the category. Allow user override.
31. Routing hierarchy when `Send to FORGE Agent` triggers: (a) exact match on primary category, (b) capability overlap match (check `capabilities[]` on all installed agents), (c) general orchestrator fallback with category as context hint.
32. If fallback to general orchestrator, show visible FLOW card indicator: "No [category] specialist — using general agent."
33. Add 7th bundled agent: `DevOps Specialist` (primary: infra — Docker, CI/CD, GitHub Actions, deployment scripts).
34. Capability map for bundled agents: SecurityAuditor→security+backend; TestWriter→testing+frontend+backend; PerformanceReviewer→frontend+backend+infra; DevOpsSpecialist→infra; DocumentationWriter→docs; ReactExpert→frontend; PythonBackendSpecialist→backend.
35. Category tags displayed as small labels on FLOW cards and PLAN items.

**"What's Left" Summary (Tiered):**

33. Add a "What's Left" button in the PLAN/FLOW toolbar.
34. Item limits: Free = 5 (AI-prioritized most critical), Solo = 25, Solo Plus = 50, Founder = unlimited + Markdown export.
35. Free tier: AI selects the 5 most impactful unresolved items to show — not random 5.
36. Founder tier: full report, all items, Markdown export.
37. When a user hits their tier item limit, show a visible upgrade prompt with the limit count.
38. The report includes: counts by classification and per-item gap detail.

**Project-Setup-First Onboarding (new projects):**

37. Detect first-launch state (no workspace configured).
38. On first launch, open to `ProjectSetupScreen.tsx`.
39. Setup screen collects: what the user is building, workspace directory, and optional plan/PRD import.
40. After setup, generate or import a plan, populate FLOW board, open to FLOW Today view.
41. Returning users with a configured workspace land on FLOW Today view.
42. Chat tab is removed. PLAN absorbs chat via Build/Ask mode toggle in the PLAN toolbar.

**Existing Project Bootstrap Onboarding:**

43. When a user connects a workspace that already contains code (files + git history detected), detect this automatically and offer the bootstrap flow.
44. Phase 1 — workspace scan: scan README, package files, git log (last 30 commits), test directory, existing docs. Show user a project fingerprint.
45. Phase 2 — bootstrap session: open a guided PLAN Build mode session. AI cross-references user input with workspace scan and generates a bootstrapped plan. Items inferred as already done get status Complete and acceptance criteria that pass against the current codebase. Items described as in-progress → In Progress. Items described as next steps → Not Started with abstract acceptance criteria generated.
46. User reviews the generated plan item by item. Can reject any Complete back to Not Started.
47. Phase 3 — first "What's Left" run immediately after bootstrap confirmation. Free regardless of tier — this one-time run is the product's first meaningful moment for existing project users.
48. Bootstrap session is a one-time flow per project.

**FLOW Today View:**

49. Implement `TodayView.tsx` in FLOW as the default landing for returning users.
50. Shows 3–5 unblocked tasks ordered by: in-progress items with active traces first, then high-priority Not Started items, then recently unblocked items.
51. "Execute Next" sends top item to FORGE with one click.
52. "Execute All Today" queues Today items to FORGE in sequence, approval-gated per item.
53. User can manually swap items in/out of Today.
54. Mobile companion: Today view is the mobile home screen. Tap to approve/reject when a FORGE run completes on Desktop.
55. Full Kanban board accessible from Today view via a tab or expand toggle.

### Dependencies

- Phase 2.5 complete (stable backend, Plan→Flow sync already working).
- `AgentOrchestrator` must accept `planItemId` in its invocation context.
- New backend routes: `POST /api/traces`, `GET /api/traces/:itemId`, `GET /api/plan/drift`, `POST /api/plan/items/:id/criteria`.
- AI model call available at item creation time for criteria generation (uses existing provider clients).

### Tests

- Creating a plan item triggers AI criteria generation and presents criteria for user review.
- After an agent run triggered with a `planItemId`, trace file exists under `.kryleos/traces/` with criteria results.
- PLAN space renders criteria checklist on the originating item after run completes.
- Drift check evaluates criteria and classifies at least one Complete item from a sample workspace.
- Blocked plan item is greyed out in FLOW and cannot be sent to FORGE.
- Blocked item becomes unblocked when its blocker is marked Complete.
- Plan item category tag routes `Send to FORGE Agent` to the correct specialist.
- Multi-repo plan item routes execution to the correct workspace directory.
- First launch opens to project setup screen, not chat.
- Returning user with workspace configured lands on FLOW board.
- "What's Left" returns per-item classification report (Founder tier only).
- Build, test, lint pass.

### Exit Criteria

- After an agent run, the user sees the criteria checklist trace linked to the plan item that triggered it.
- Drift check shows per-item classification with criteria evidence in the PLAN space.
- Diverged classification uses a targeted LLM call, not raw text comparison.
- A plan item with a workspace assignment activates the correct repo for execution.
- Plan item dependencies prevent blocked items from being sent to FORGE.
- Agent specialization routes items to the correct specialist agent.
- "What's Left" is accessible to Founder tier users and returns a full drift report.
- New user goes through project setup before seeing the chat console.
- Execution traces survive app restart.

## 8b. Phase 2.7 - VS Code Extension (deferred from 2.6)

### Goal

Let VS Code users invoke Forge's project execution loop, agent, and review workflow directly from their editor. Deferred from Phase 2.6 because the extension is only compelling after the project-level identity is established. A companion to an unclear product has no value proposition.

### Implementation Work

1. Create the `kryleos-forge-vscode/` package in the monorepo.
2. Workspace sync: POST open folder to `/api/workspace` on activation and folder change.
3. `Ask Forge Agent` context menu on files and selections: sends query to backend WebSocket, streams to VS Code output panel.
4. VS Code sidebar webview: polls `/api/review/current`, renders review state, calls `/api/review/status` for Accept/Reject.
5. Connection status indicator in VS Code status bar.
6. V1: no inline autocomplete or copilot-style suggestions.
7. Package as `.vsix` and publish to VS Code Marketplace.

### Dependencies

- Phase 2.6 complete (full project execution loop available in backend).
- `/api/workspace`, `/api/review/current`, `/api/review/status`, `/api/traces` routes stable.

### Tests

- Extension builds (`vsce package`).
- Workspace sync POST updates active workspace path.
- Agent query streams response to output panel.
- Review sidebar renders state with Accept/Reject controls.
- Offline indicator shows when backend is not running.

### Exit Criteria

- Extension connects, syncs workspace, invokes agent, shows review state.
- Published to VS Code Marketplace as Forge companion.

## 8. Phase 3 - Docs Autopilot and GitHub Issues Integration

### Goal

Make project documentation a first-class product workflow and add GitHub Issues as the first external plan source.

### GitHub Issues Integration (Phase 3, V1 — Import Only)

1. Add GitHub OAuth flow for repo authorization.
2. Add `GET /api/integrations/github/issues` route to fetch open issues from a connected repo.
3. In the PLAN space, add "Import from GitHub Issues" action.
4. For each imported issue: create a plan item with the issue title, body, and GitHub issue ID preserved.
5. On import, immediately trigger AI acceptance criteria generation from the issue body.
6. Optional: when a plan item linked to a GitHub issue is marked Complete, offer to post a comment back on the issue ("Closed by Forge agent run on [date]"). User must explicitly approve the comment before it is posted.
7. V1 is import-only (one-way pull from GitHub). Bi-directional sync is V2 (Phase 8+).
8. Linear integration: Phase 5–6. Notion/Jira: Phase 8+.

### Docs Autopilot Implementation Work

1. Add Docs Autopilot workspace or panel.
2. Add document workflow templates:
   - Project Brief.
   - PRD.
   - Architecture.
   - Technical Design.
   - API/Integrations.
   - Data/Storage.
   - Security/Privacy.
   - Test Plan.
   - Release Checklist.
   - User Guide.
   - Project Brochure.
   - Founder Summary.
   - Client Handoff Pack.
3. Add a docs context scanner:
   - package metadata,
   - source tree,
   - README/docs,
   - API routes,
   - tests,
   - recent Git changes.
4. Add “Update Docs From Latest Patch.”
5. Preview generated docs before write.
6. Store generated docs in configured folder:

```text
.kryleos/docs/
```

or user-selected project docs folder.

7. Add tier gates:
   - Free: limited docs generation.
   - Solo: basic docs.
   - Solo Plus: richer Docs Autopilot.
   - Founder: product/founder outputs.
   - Agency/Team: handoff/branded outputs.

### Dependencies

- Review/diff preview.
- Feature status registry.
- Workspace scanner.
- Model provider setup.

### Tests

- Generate each document type in a sample repo.
- Verify generated files preview before writing.
- Verify “update docs from latest patch” changes only relevant docs.
- Verify tier gates.

### Exit Criteria

- User can generate and update a useful documentation pack from inside the app.

## 9. Phase 4 - Cost Guard and Prompt Optimization

### Goal

Make the app visibly cheaper and more controlled than using multiple AI tools blindly.

### Implementation Work

1. Add prompt/context inspection before model calls:
   - included files,
   - included chat history,
   - estimated tokens,
   - provider/model,
   - estimated cost where pricing is known.
2. Add Cost Guard panel:
   - current request cost estimate,
   - session total estimate,
   - model/provider breakdown,
   - context source breakdown,
   - token savings from concise mode.
3. Add prompt optimization modes:
   - balanced,
   - concise,
   - critical,
   - brutal audit,
   - minimal context,
   - docs-heavy,
   - code-only.
4. Add large-context warnings.
5. Add “ask before sending large files.”
6. Add prompt summarization for long sessions.
7. Store Cost Guard history for Solo Plus and higher.

### Dependencies

- Provider abstraction.
- Response modes.
- File mention/context pipeline.

### Tests

- Unit tests for token/cost estimation.
- Manual test with large files.
- Verify concise mode reduces payload/reply size.
- Verify warnings appear before oversized requests.

### Exit Criteria

- User can see what will be sent before expensive model calls.
- User can reduce prompt size intentionally.

## 10. Phase 5 - Local Model and BYOK Setup

### Goal

Make local-first and BYOK setup easy enough for non-expert solo developers, and surface clear model quality expectations for Build Loop features.

### Implementation Work

1. Add first-run provider setup wizard.
2. Detect Ollama availability.
3. List installed Ollama models.
3a. Add minimum recommended model display at setup and in Build Loop feature surfaces. Minimum thresholds:
    - FORGE execution: any model with tool use (Qwen2.5-coder, DeepSeek-Coder-V2, Ollama local models) — minimum functional.
    - Acceptance criteria generation, CREW review, drift Diverged classification, bootstrap session: Gemini Flash 2.0, Claude Haiku, GPT-4o-mini minimum; Claude Sonnet / Gemini Pro / GPT-4o / DeepSeek V3 recommended.
    - When a user selects a model below minimum threshold for Build Loop features, show a non-blocking warning: "Build Loop features may produce low-quality results with this model. Recommended: Claude Sonnet, Gemini Pro, DeepSeek V3, or GPT-4o." User can proceed — warning does not block.
4. Add model/provider health checks:
   - DeepSeek,
   - OpenAI,
   - Gemini,
   - Anthropic,
   - OpenRouter,
   - Ollama.
5. Add provider test call with safe prompt.
6. Add local-only mode badge.
7. Add provider data disclosure before first hosted call.
8. Add model recommendations by task:
   - cheap planning,
   - local chat,
   - code review,
   - docs generation,
   - higher-quality hosted fallback.
9. Add clearer invalid-key/offline-service errors.

### Dependencies

- Existing provider clients.
- Config/Header UI.
- Secure storage work from Phase 6 if available.

### Tests

- Mock provider health checks.
- Manual Ollama online/offline checks.
- Invalid API key checks.
- First-run setup flow test.

### Exit Criteria

- New user can configure at least one provider in under five minutes.
- App clearly shows local vs hosted model calls.

## 11. Phase 6 - Security and Privacy Hardening

### Goal

Reach a safe baseline for public release.

### Implementation Work

1. Move API keys out of plain localStorage:
   - Windows Credential Manager,
   - macOS Keychain,
   - Linux Secret Service.
2. Add secure credential abstraction.
3. Add migration from localStorage to secure storage.
4. Add provider data-sharing disclosure.
5. Add secret scanning before:
   - sync,
   - export,
   - publish,
   - handoff pack generation.
6. Add destructive action confirmations:
   - delete file/folder,
   - revert untracked file,
   - overwrite generated docs,
   - bulk operations.
7. Add command timeouts and output-size limits.
8. Add command approval history.
9. Implement Zero Egress Mode:
   - Toggle in the config header.
   - Server-side enforcement in the backend model routing layer: when enabled, non-Ollama provider calls are rejected before they reach any external API.
   - Persistent `[LOCAL ONLY]` badge in the app header while enabled.
   - Session log records `All model calls are local — no data sent to external providers` when enabled.
   - Available on all subscription tiers.
10. Add privacy mode:
    - disables cloud sync,
    - blocks hosted model calls unless manually overridden,
    - shows local-only badge.
11. Add workspace boundary regression tests.

### Dependencies

- Provider setup.
- Command approval.
- Review tab.
- Sync/export flows.

### Tests

- Secure storage tests/mocks.
- Workspace boundary tests.
- Secret scanner tests.
- Command timeout tests.
- Manual privacy-mode verification.
- Enable Zero Egress Mode and confirm non-Ollama provider calls are blocked at the server layer, not just hidden in the UI.
- Verify `[LOCAL ONLY]` badge appears in the header when Zero Egress Mode is active.

### Exit Criteria

- Production release no longer stores API keys only in plain localStorage.
- User is warned before hosted providers receive workspace content.
- Commands still cannot run silently.
- Zero Egress Mode enforces local-only model calls server-side when enabled.

## 12. Phase 7 - Web and Mobile Companion Reliability

### Goal

Make Web and Mobile useful companions without pretending they are full IDE replacements.

### Implementation Work

Web companion:

1. Backend URL configuration.
2. Online/offline backend state.
3. Real chat through Desktop backend.
4. Clearly labeled simulator fallback.
5. Settings/status preview.
6. Docs/planning preview.

Mobile companion:

1. Backend URL configuration.
2. Voice notes.
3. Planning prompts (PLAN space ideation on mobile — notes build across sessions and sync to Desktop CREW on paid tiers).
4. Monitor active desktop session.
5. Approve/reject commands.
6. Stop active workflow.
7. Queue planning notes while offline (note-taking only — no LLM calls without connectivity).
8. View project health summary.

Shared:

1. Clear “companion” labeling.
2. No full-coding marketing claims.
3. Better connection diagnostics.

**Offline scope clarification:**
- Desktop + Ollama: full offline PLAN ideation and FORGE execution is supported. Ollama local models run without internet.
- Mobile offline: note-taking and queue of planning prompts is the limit. No LLM execution without connectivity to a Desktop backend or hosted model. Do not market mobile offline coding.

### Dependencies

- Desktop backend stability.
- Command approval WebSocket protocol.
- Sync/auth decisions.

### Tests

- LAN backend connection test.
- Offline fallback test.
- Mobile voice test.
- Command approve/reject from companion test.
- Stop workflow from companion test.

### Exit Criteria

- Mobile/Web can reliably connect to Desktop backend and perform companion tasks.
- Fallback modes are labeled honestly.

## 13. Phase 8 - Founder and Agency Workflows

### Goal

Create higher-value workflows without making solo pricing expensive.

### Implementation Work

Founder workflows:

1. PRD generator.
2. Architecture doc generator.
3. Roadmap/backlog generator.
4. Release checklist.
5. Pricing-page copy.
6. Changelog/release notes.
7. Investor/founder summary.
8. Monthly project health report.
9. Update docs from latest patch.

Agency/Team workflows:

1. Client handoff pack.
2. Scoped implementation plan.
3. Project brochure generation.
4. Branded exported docs.
5. Architecture summary for clients.
6. QA/test checklist.
7. Delivery checklist.
8. Collaboration Preview indicators.
9. RBAC Simulator indicators.
10. Priority support workflow.

### Dependencies

- Docs Autopilot.
- Cost Guard.
- Feature labels.
- Export pipeline.
- Tier/entitlement mapping.

### Tests

- Generate Founder pack from sample project.
- Generate Agency handoff pack from sample project.
- Verify branded export.
- Verify tier gates.

### Exit Criteria

- Founder/Agency outputs feel like product workflows, not generic chat prompts.

## 14. Phase 9 - Billing, Packaging, and Entitlements

### Goal

Replace mock billing and prepare paid distribution.

### Pre-Stripe Early Revenue (Phases 3–4)

Do not wait until Phase 9 to start generating revenue. Launch an Early Lifetime deal on Gumroad or Lemon Squeezy as soon as the Preview Deck and Docs Autopilot demonstrate clear value:

- Price: $99–$149 one-time for Solo Plus or Founder-level access.
- Mechanism: Local license key check that bypasses mock billing.
- Scope: Limited by time or seat count. Must be retired when Stripe goes live.
- Goal: Validate willingness-to-pay and start revenue before billing infrastructure is complete.

### Full Stripe Integration

1. Finalize plan definitions:
   - Free,
   - Solo,
   - Solo Plus,
   - Founder,
   - Agency/Team,
   - Early Lifetime (grandfathered from pre-Stripe sales).
2. Integrate Stripe or equivalent.
3. Add checkout flow.
4. Add billing portal.
5. Add cancellation flow.
6. Add webhook handling.
7. Add entitlement checks:
   - frontend display,
   - backend enforcement,
   - offline grace behavior.
8. Add release packaging:
   - Windows installer,
   - macOS build plan,
   - Linux build plan if supported.
9. Add auto-update strategy or manual update process.
10. Add license state storage.

### Dependencies

- Stable plan/pricing strategy.
- Feature status registry.
- Secure credential storage.
- Docs/Cost Guard value proposition.

### Tests

- Stripe test checkout.
- Webhook tests.
- Entitlement tests.
- Offline grace tests.
- Installer smoke tests.

### Exit Criteria

- Paying user can subscribe, receive entitlements, manage billing, and install the app.

## 15. Phase 10 - Launch Readiness

### Goal

Prepare for a small public launch.

### Implementation Work

1. Create `forge.kryleos.com` landing page.
2. Create product screenshots.
3. Create short demos:
   - open workspace,
   - configure model,
   - run agent workflow,
   - approve command,
   - review Git diff,
   - generate docs pack,
   - use Cost Guard,
   - capture mobile voice note.
4. Write quick-start guide.
5. Add in-app onboarding checklist.
6. Add support contact.
7. Add bug report flow.
8. Add changelog.
9. Add privacy policy.
10. Add terms of service.
11. Add release notes template.
12. Prepare launch checklist.

### Dependencies

- Phase 1-9 release candidate.
- Final pricing.
- Billing.
- Privacy/security docs.

### Tests

- Fresh install test.
- New user first-run test.
- Provider setup test.
- Payment test.
- Support link test.
- Landing page QA.

### Exit Criteria

- A new user can understand, install, configure, and get value from Kryleos Forge in under ten minutes.

## 16. Cross-Phase Technical Tracks

### Testing Track

Add/maintain tests for:

- workspace boundary safety,
- command approval,
- abort handling,
- Git review APIs,
- provider health checks,
- prompt/cost estimation,
- docs generation,
- tier entitlement checks,
- billing webhooks,
- mobile/web companion protocol.

### Documentation Track

Keep these updated per phase:

- `02-Product-Requirements.md`
- `04-Technical-Design.md`
- `05-API-and-Integrations.md`
- `07-Security-and-Privacy.md`
- `08-Test-Plan.md`
- `09-Operations-and-Release.md`
- `11-Subscription-and-Feature-Tiers.md`
- `13-Growth-and-Pricing-Strategy.md`
- `14-Release-Readiness-Implementation-Strategy.md`

### UX Track

Every major feature should include:

- loading state,
- empty state,
- error state,
- offline state where relevant,
- preview before destructive writes,
- clear tier/status label.

### Security Track

Do not launch publicly until:

- credentials are stored securely,
- hosted model disclosure exists,
- command approval cannot be bypassed,
- destructive actions require confirmation,
- simulated features are labeled honestly,
- secret scanning exists for export/sync/publish.

## 17. Suggested Build Order

### Sprint 1 - Trust Polish

- Notifications/toasts.
- Alert removal.
- Review tab confirmations.
- Command approval/abort UX polish.
- Feature status registry skeleton.

### Sprint 2 - Honest Packaging

- Feature badges.
- Pricing/tier UI cleanup.
- Simulated feature label sweep.
- Public copy cleanup.

### Sprint 3 - Preview Deck, UI Polish, Community Agents, Plan Sync

- Deck shell with Files, Live Preview, Terminal, Side Chat, Artifacts, Review tabs.
- Existing File Browser as Files tab.
- Local URL Live Preview.
- Terminal evidence pane.
- Context-only Side Chat.
- Artifact preview.
- Review summary.
- Ship `theme-forge` as default theme. Demote CodeRain to opt-in.
- Clean tab labels: `Chat`, `Plan`, `Crew`, `Flow`, `Forge`.
- Bundle six community agent starter packs with one-click install in CREW.
- Add `Share Agent` Gist export.
- Add Plan→Flow auto-sync and `Send to FORGE Agent` button.

### Sprint 4 - Build Loop V2 (Project Execution Loop)

This is the identity sprint. No competitor has this.

- **Two-phase acceptance criteria:** Phase 1 abstract at item creation (symbol_exists, test_passes, llm_check — no file paths). Phase 2 enrichment after first workspace scan/agent run (adds file_exists with real paths). User reviews both phases.
- **CREW→FLOW pipeline:** CREW outputs a structured refined plan document. "Push to FLOW" diffs against existing tasks, user confirms before FLOW updates.
- **Execution tracing:** `planItemId` context in orchestrator, trace file persistence under `.kryleos/traces/`, PLAN space criteria checklist trace cards, auto-suggest item completion.
- **Plan drift detection:** `checkPlanDrift()` with criteria evaluation, `/api/plan/drift` route, per-item drift badges (Complete/In Progress/Not Started/Diverged/Needs Review), summary bar, auto-run after agent completion.
- **Multi-repo plan scope:** `workspace` field on plan items, FLOW board grouping by repo, workspace-aware routing.
- **Plan item dependencies:** `blockedBy[]` array, greyed items in FLOW, disabled FORGE button until deps complete.
- **Agent specialization + capability fallback routing:** 7 bundled agents including DevOps Specialist, capability-map routing hierarchy, visible fallback indicator.
- **"What's Left" summary (tiered):** Free = 5 AI-prioritized items, Solo = 25, Solo Plus = 50, Founder = unlimited + Markdown export.
- **Existing project bootstrap:** workspace scan + guided bootstrap session + free first "What's Left" run.
- **FLOW Today view:** TodayView.tsx, 3–5 prioritized tasks, Execute Next / Execute All Today, mobile companion home screen.
- **Chat tab removed:** PLAN absorbs chat via Build/Ask mode toggle.
- **Project-setup-first onboarding:** `ProjectSetupScreen.tsx`, first-launch detection, FLOW Today view as default landing.

### Sprint 5 - Provider Setup

- First-run setup wizard.
- Provider health checks.
- Ollama detection.
- Hosted/local disclosure.

### Sprint 6 - Cost Guard MVP

- Token/cost estimate utilities.
- Context breakdown.
- Large prompt warnings.
- Prompt optimization controls.

### Sprint 7 - Docs Autopilot MVP

- Docs workspace.
- Core templates.
- Workspace scanner.
- Preview-before-write.
- Update docs from latest patch.
- Launch Early Lifetime deal on Gumroad/LemonSqueezy alongside this sprint if value is demonstrable.

### Sprint 8 - Security Baseline

- Secure credential storage.
- Secret scanning.
- Zero Egress Mode (server-side enforcement + `[LOCAL ONLY]` badge).
- Privacy mode.
- Command timeout/output limits.

### Sprint 9 - Companion Reliability

- Mobile/Web connection flow.
- Command approvals from companion.
- Stop workflow from companion.
- Voice/planning reliability.

### Sprint 10 - Founder/Agency Workflows

- Founder pack.
- Agency handoff pack.
- Branded exports.
- Project health report.

### Sprint 11 - Billing and Packaging

- Stripe.
- Entitlements (with Early Lifetime grandfathered).
- Installer.
- Release channel.

### Sprint 12 - Launch Prep

- Landing page.
- Screenshots/videos.
- Legal/support docs.
- Fresh-user QA.

## 18. Hard No-Go Conditions

Do not launch publicly if any of these remain true:

- The Build Loop is not implemented (execution tracing with acceptance criteria, drift detection, multi-repo routing, plan item dependencies, agent specialization). This is the product identity — launching without it means launching as a generic AI chat tool.
- Paid tiers (including Early Lifetime) launch before execution tracing is working.
- New users land on the chat console on first launch instead of the project setup screen.
- API keys are only stored in plain localStorage.
- Remote containers are marketed as production while still simulated.
- RBAC/team collaboration is marketed as production while still simulated.
- Billing copy does not match real entitlements.
- Command approval can be bypassed by normal agent output.
- Revert/delete flows can destroy user files without confirmation.
- Build or tests fail.
- A new user cannot configure a model provider without source-code knowledge.

## 19. Next Recommended Step

Phases 1 through 2.7 are complete. Phase 3 (Docs Autopilot and GitHub Issues Integration) is the next immediate sprint.

After Phase 3, the following priorities apply (originally written for Phase 2.6):

1. Add AI acceptance criteria generation at plan item creation. Wire to `POST /api/plan/items/:id/criteria`. User reviews criteria before save.
2. Add `planItemId` context to `AgentOrchestrator.handleUserQuery()` and emit a structured `ExecutionTrace` with criteria results after each run.
3. Persist traces under `.kryleos/traces/`. Render criteria checklist trace cards on plan items in PLAN space.
4. Implement `checkPlanDrift()` evaluating acceptance criteria against codebase. Wire to `GET /api/plan/drift`. Include Needs Review as a catch-all for low-confidence cases.
5. Add `blockedBy[]` to plan item data model. Grey blocked items in FLOW, disable Send to FORGE Agent.
6. Add AI category tagging on plan items. Route Send to FORGE Agent to the matching specialist agent.
7. Add "What's Left" summary action, gated to Founder tier.
8. Add workspace assignment field to plan items and route Send to FORGE Agent to the correct sandbox.
9. Add `ProjectSetupScreen.tsx` for first-launch onboarding. Make FLOW the default landing for returning users.

This sprint is the most important in the entire plan. Everything after it (GitHub Issues import, Docs Autopilot, Cost Guard, VS Code extension, billing) is supporting infrastructure for a product with a clear identity. Without this sprint, the product is a well-polished generic AI chat tool.

## 20. Phase 1 Sprint 1 Progress

Implemented in the current Phase 1 Sprint 1 slice:

- Added a shared desktop notification/toast system.
- Replaced blocking alerts in the App shell for file preview/save, auth, subscription, sync, pinning, and collaboration state.
- Replaced blocking alerts in the File Browser for primary file, Git, import, publish, and deploy flows.
- Added non-blocking Review tab feedback for accept/reject, stage/unstage, refresh fallback, and revert results.
- Added explicit inline Review revert confirmation before Git restore, snapshot restore, or moving untracked files into `.kryleos/reverted/`.
- Replaced remaining blocking alerts in `ConfigHeader.tsx`, `CoworkSpace.tsx`, and `PlanningScreen.tsx`.
- Replaced workspace skill browser delete confirmation with an inline confirmation panel.
- Replaced obvious corrupted/non-ASCII UI labels in App preview, Cowork, and Planning surfaces with ASCII labels.
- Added explicit terminal/log messages for command approval, user rejection, stale approval blocking, and workflow abort outcomes.

Remaining Phase 1 Sprint 1 follow-up:

- Manually smoke test the full command approval/abort flow in the running Electron app.
- Continue broader UI copy polish in less-used panels.

## 21. Phase 2 Sprint 1 Progress

Implemented in the current Phase 2 Sprint 1 slice:

- Added shared feature maturity definitions in `Desktop-app/src/shared/featureStatus.ts`.
- Added reusable `FeatureBadge` UI component.
- Labeled Desktop subscription/account surfaces for Cloud Sync Preview, Remote Container Simulator, Collaboration Preview, RBAC Simulator, and Mock Billing.
- Labeled Cowork collaboration/RBAC panel with shared preview/simulator badges.
- Labeled Web companion pricing, sandbox, sync, collaboration, semantic cache, rollback, RBAC, telemetry, keychain, and billing surfaces with production/preview/simulator/mock badges.
- Labeled Mobile companion sync, collaboration, semantic cache, rollback, RBAC, and account billing surfaces with preview/simulator/mock badges.
- Updated command execution banners so Pro/Enterprise remote execution is described as `REMOTE CONTAINER SIMULATOR ACTIVE`, not production remote infrastructure.
- Updated subscription tier documentation to avoid production claims for Cloud IDE, remote containers, collaboration, RBAC, and billing.

Remaining Phase 2 follow-up:

- Consider extracting Web/Mobile badge definitions into a shared package once the companion apps are packaged together.
- Search public-facing docs and marketing copy for remaining production-sounding claims.

## 22. Phase 2.5 Sprint 1 Progress

Implemented in the current Phase 2.5 V1 slice:

- Added `theme-forge` as the default desktop theme while keeping Matrix Rain available as the opt-in `matrix` theme.
- Disabled `CodeRain.tsx` by default unless the user selects the Matrix Rain theme.
- Changed the first-launch/default active space from Chat to PLAN.
- Cleaned the primary navigation labels to `Plan`, `Crew`, `Flow`, and `Forge`; F-key hints remain as tooltips/keyboard behavior.
- Added `PreviewDeck.tsx` in the FORGE workspace.
- Replaced the old FORGE right-side Explorer/Visualizer/Review panel with the Preview Deck.
- Added Preview Deck tabs for Files, Live Preview, Terminal, Side Chat, Artifacts, and Review.
- Preserved the existing File Browser and Code Graph under the Files tab.
- Added Live Preview V1 with a user-entered URL, refresh, open-external action, and sandboxed iframe preview.
- Added Terminal Evidence V1 using current session logs and pending command approval state.
- Added Side Chat V1 as a local context-only pane that does not write files or run commands unless promoted to FORGE.
- Added Artifacts V1 with workspace Markdown/text/HTML/JSON/CSV discovery and preview routes.
- Added Review tab integration using the existing Git-backed `CodeReviewPanel`.
- Added backend artifact routes: `GET /api/artifacts` and `GET /api/artifacts/content`.
- Added bundled CREW/community agent starter definitions: React Expert, Security Auditor, Test Writer, Documentation Writer, Performance Reviewer, Python Backend Specialist, DevOps Specialist, Technical Reviewer, Scope Guard, and Risk Identifier.
- Added one-click starter agent install into `.kryleos/agents/`.
- Added custom agent sharing through the existing Gist artifact publish route.
- Added PLAN Build/Ask mode toggle.
- Updated planning import to return parsed checklist task titles.
- Added PLAN task handoff controls for `ADD ALL TO FLOW` and `SEND TO FORGE`.
- Made the `flow_board` task session creatable from task save messages so PLAN imports can populate FLOW even before a board session exists.

Remaining Phase 2.5 follow-up:

- Manually smoke test Preview Deck panes in the running Electron app.
- Add local dev-server detection suggestions to Live Preview.
- Improve Side Chat beyond local notes if a separate non-mutating side-chat backend session is needed.
- Add richer artifact previews for PDFs/images/videos later.
- Add a visible Plan-to-CREW handoff control and structured CREW diff flow.
- Add automated component/route tests for Preview Deck and plan-to-flow sync.

## 23. Phase 2.6 Sprint 1 Progress

Implemented in the current Phase 2.6 foundation slice:

- Extended `ProjectTask` with Build Loop fields: `workspace`, `blockedBy`, `acceptanceCriteria`, `driftStatus`, and `latestTraceId`.
- Added typed acceptance criteria, criterion results, drift classifications, and execution trace models.
- Added `planningV2.ts` as the backend Planning Layer V2 service.
- Added Phase 1 criteria drafting for FLOW tasks. Current drafting is deterministic and review-required; full AI-generated criteria remains a later Phase 2.6 slice.
- Added deterministic structural criteria evaluation for `file_exists`, `symbol_exists`, and `git_grep`.
- Added placeholder handling for `test_passes` and `llm_check` so the UI does not falsely mark AI/manual checks complete.
- Added trace persistence under `.kryleos/traces/`.
- Added backend routes:
  - `GET /api/plan/items/:id/criteria`
  - `POST /api/plan/items/:id/criteria`
  - `PATCH /api/plan/items/:id/criteria`
  - `GET /api/traces/:itemId`
  - `POST /api/traces`
  - `GET /api/plan/drift`
- Added `planItemId` context to the WebSocket query payload and capture a trace after task-triggered FORGE runs.
- Updated FLOW into a Build Loop board with:
  - category selector,
  - `CHECK PLAN DRIFT` action,
  - drift/status badges,
  - criteria count badge,
  - trace badge,
  - workspace badge,
  - blocker badge,
  - disabled execution for blocked items.
- Added category inference for new tasks and specialist routing context in the task execution prompt.

Verified:

- Backend smoke test generated criteria, patched criteria to a `file_exists: README.md` check, classified drift as `complete`, persisted a trace, and read it back.
- FLOW UI smoke test confirmed the Build Loop board, drift action, category selector, and Build Loop signals render without crashing.
- `npm.cmd run build`
- `npm.cmd test`
- `npm.cmd run lint`

Remaining Phase 2.6 follow-up:

- Add PLAN-side trace cards on the originating plan item.
- Add Phase 2 enrichment diff review in PLAN. FLOW now has criteria scan/enrich review, but PLAN still needs the non-blocking enrichment banner described in the full strategy.
- Add dedicated structured-output post-run extraction call instead of log-derived trace evidence.
- Add dependency editing UI.
- Add true multi-repo sandbox activation for task execution.
- Add specialist-agent matching based on installed agent capabilities.
- Add deterministic FLOW Today view.
- Add "What's Left" report with tier limits.
- Add first-run Project Setup and existing-project Bootstrap flows.

## 24. Phase 2.6 Sprint 2 Progress

Implemented in the current Phase 2.6 criteria review slice:

- Added deterministic Phase 2 criteria enrichment in `planningV2.ts`.
- Added `POST /api/plan/items/:id/criteria/enrich`.
- Enrichment scans the task workspace, scores candidate files by task/category keywords, and proposes `file_exists` criteria.
- Added a FLOW criteria review panel.
- Criteria review panel supports:
  - auto-drafting Phase 1 criteria for tasks without criteria,
  - editing type, phase, description, and target,
  - adding/removing criteria,
  - saving reviewed criteria through the PATCH route,
  - running `SCAN & ENRICH` to add Phase 2 file criteria,
  - applying suggested status after drift checks.
- Added a visible FLOW warning when tasks have no reviewed criteria.
- Replaced the previous one-click criteria icon behavior with an explicit review workflow.

Verified:

- `npm.cmd run build`
- `npm.cmd test`
- `npm.cmd run lint`

Remaining Sprint 2 follow-up:

- Add a PLAN-side enrichment banner and diff review for imported plan items.
- Add richer criteria result display in the modal after drift checks.
- Add tests around criteria enrichment route and criteria panel behavior.

## 25. Phase 2.7 Sprint Progress (VS Code Extension)

Implemented in the Phase 2.7 slice:

- Built the `kryleos-forge-vscode` companion extension.
- Added workspace sync via POST `/api/workspace` from VS Code open folder.
- Added `Ask Forge Agent` right-click context menu streaming to VS Code output panel.
- Added review sidebar webview polling `/api/review/current` with Accept/Reject controls.
- Added backend connection status indicator.
- Packaged as `.vsix` ready for VS Code Marketplace.

Remaining Phase 2.7 follow-up:

- Address feedback from initial VS Code marketplace users.
