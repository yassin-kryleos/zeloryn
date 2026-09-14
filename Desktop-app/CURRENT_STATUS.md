# Zeloryn - Current Status For New Chats

Last updated: 2026-09-14 15:25:00 +05:30

Use this file as the quick continuation brief for `Desktop-app/`.

## 1. Start Here

Working directory:

```bash
cd "/home/yassin/Kryleos-Projects/Kryleos-Forge/Desktop-app"
```

Owner/project rules:

- App is 100% free, open-source, and local-first under Apache-2.0.
- Rebranded to **Zeloryn** v0.1.0 across desktop cockpit, electron window, and telemetry.
- Preserve local-first positioning, BYOK support, Ollama/local model workflows, command approval, and zero-egress guarantees.
- Core spaces: **VIBE** (visual/no-code prototyping with responsive live canvas), **PLAN** (scoping & criteria), **CREW** (persona review), **FLOW** (Kanban & worktrees), and **FORGE** (agent execution & safety gates).

## 2. Current Status & Latest Architecture (2026-09-14)

Parent repo:

```text
/home/yassin/Kryleos-Projects/Kryleos-Forge
branch: main
```

Recent Major Implementations (Phase 8):

1. **Zeloryn Rebranding**:
   - Header, Electron main window title, default workspace name, interactive terminal, onboarding tour, and project signals updated to Zeloryn.
2. **Cockpit UI/UX Declutter**:
   - Consolidated loose status badges (`[LOCAL ONLY]`, `Connected`, `Companion`, `Thinking Level`) into a unified **Engine Status Pill** (`● Connected · Local [MEDIUM] +0 v`) with interactive popover telemetry.
   - Prevents topbar double-row wrapping on standard laptop screens.
3. **Instant Live Theme Switching**:
   - Theme selection in Settings applies immediately to `document.body` and saves to `localStorage` without needing "Save Settings".
4. **Vibe Coding Studio (`⚡ Vibe`)**:
   - Dedicated space for non-coders and fast visual ideation (`VibeStudio.tsx`).
   - Starter template inspiration cards (Portfolio, Habit Tracker, SaaS Landing, Retro Arcade Game).
   - Side-by-side prompt chat with live interactive preview (`<iframe>`) and responsive viewport toggles (Desktop, Tablet, Mobile).
   - Seamless Pro mode transition button.
5. **Role-Based Model Slot Architecture & Auto-Configuration**:
   - Auto-assigns Coordinator, Planner, Coder, and Reviewer slots according to detected provider API keys (Anthropic, OpenAI, Gemini, DeepSeek) and local Ollama models.
6. **Activation Checklist Interactive Fix**:
   - Users can directly click and complete quick-start checklist items at the top of the app.
7. **Packaging & Clean Uninstallation**:
   - Built and verified Linux AppImage (`dist-desktop/Zeloryn-0.1.0-x86_64.AppImage`).
   - In-place update to `~/.local/share/zeloryn/Zeloryn.AppImage` and `.desktop` launcher.
   - Uninstallation scripts (`uninstall.sh`) and CLI flags (`zeloryn uninstall --purge`) for complete removal.
8. **Test Suite Health**:
   - 72 test suites passing (600 tests, 0 failures, 1 skipped). Clean TypeScript build and ESLint.

## 3. Active Implementation Slice

This in-progress slice appears to address PLAN/FLOW/CREW quality-of-life and P2 verification issues:

- PLAN tab switching now reloads the project-specific Scratchbook session (`session_plan_<projectId>`) instead of always loading global `planning_session`.
- PLAN Scratchbook prompts now explicitly discourage implementation code and guide the model toward scoping, trade-offs, edge cases, and acceptance criteria.
- Push-to-FLOW now opens a confirmation diff before mutating the board:
  - shows selected items that will be added
  - shows duplicates that already exist and will be skipped
  - disables confirmation when nothing new would be added
- FLOW/plan category inference now recognizes plural/derived terms like `tests`, `specs`, `permissions`, `docs`, `deployments`, `routes`, and `components`.
- `/api/artifacts` now filters for generated outputs only:
  - scans `.kryleos`, `artifacts`, `docs`, `reports`, and `exports`
  - ignores lockfiles, configs, chat history, projects state, cost history, and command approvals
  - no longer treats the whole source tree as artifacts
- CREW reviewer personas were extracted into `src/shared/crewPersonas.ts`:
  - Technical Reviewer
  - Scope Guard
  - Risk Identifier
  - includes `installCrewPersona(...)`, which writes JSON files under `.kryleos/agents/` via `/api/files/create`
- PLAN handoff modal now suggests those three CREW reviewers and offers an `Install all 3 personas` button.
- UI copy polish:
  - `+ Add project` replaces `[ADD PROJECT]`
  - onboarding header now says `QUICK TOUR`
  - Preview deck badge now says `Preview`
  - selected workspace chips show the final folder name rather than long paths
  - removed one `Phase 2.6` badge from a warning
  - added `.normal-case` CSS utility

## 4. Files To Inspect First

Read these before continuing implementation:

```text
src/App.tsx
src/backend/server.ts
src/backend/planningV2.ts
src/components/PlanningScreen.tsx
src/components/ProjectBoard.tsx
src/shared/crewPersonas.ts
src/index.css
projects.json
```

Secondary files touched only for copy/badge polish:

```text
src/components/OnboardingTutorial.tsx
src/components/PreviewDeck.tsx
```

## 5. Verification Status

No verification commands were run while updating this status file.

Before committing this slice, run from `Desktop-app/`:

```powershell
git status --short --untracked-files=all
npm.cmd run lint
npm.cmd run build
npm.cmd test
```

Recommended manual/browser QA:

- Start the app and backend with `npm.cmd run dev`.
- In PLAN, select a project, switch away and back, and confirm the project-specific Scratchbook chat is preserved.
- Ask Scratchbook for implementation code and confirm it keeps responses scoped to planning.
- Select plan workspace items, push to FLOW, and verify the confirmation diff before the board changes.
- Try pushing duplicate items and confirm they are shown as skipped.
- Open the PLAN handoff/export area and confirm the three CREW personas are suggested and can install to `.kryleos/agents/`.
- Check FLOW task chips for readable category/workspace labels.
- Check `/api/artifacts` returns generated artifacts only and does not list source/config noise.

## 6. Product Snapshot

Kryleos Forge is a local-first Electron + React + local Express backend coding workspace for solo developers and indie founders.

Core capabilities already implemented:

- WebSocket streaming between frontend, backend, and VS Code extension.
- BYOK hosted model support plus Ollama/local model routing.
- Agent orchestrator with command approval.
- Build Loop V2, FLOW board scoring, dependency editor, drift detection, acceptance criteria enrichment, and "What's Left" reporting.
- VS Code extension with status indicator, workspace sync, review webview, Ask Forge Agent, and deterministic command approval smoke test.

Important runtime ports:

- Forge backend: `3001`
- Vite frontend: `5173`
- Ollama: `11434`

Useful commands:

```powershell
npm.cmd run dev
npm.cmd run lint
npm.cmd run build
npm.cmd test
```

## 7. Architecture Map

| Path | Role |
|---|---|
| `src/App.tsx` | Root React app, spaces, WebSocket client, config, session/task state |
| `src/backend/server.ts` | Express + WebSocket server, REST routes, model proxy |
| `src/backend/agents.ts` | Agent orchestrator, chat client interface, run loop, command approval |
| `src/backend/tools.ts` | Command execution and workspace tool implementation |
| `src/backend/ollama.ts` | Ollama client and model listing |
| `src/backend/planningV2.ts` | Build Loop engine |
| `src/backend/db.ts` | JSON-backed local app state |
| `src/components/ConfigHeader.tsx` | Provider/model/key configuration UI |
| `src/components/PlanningScreen.tsx` | PLAN UI |
| `src/components/ProjectBoard.tsx` | FLOW board |
| `src/components/CoworkSpace.tsx` | CREW UI |
| `kryleos-forge-vscode/src/extension.ts` | VS Code extension activation, commands, webview, backend bridge |

## 8. Known Gotchas

- VS Code can keep a stale extension host after VSIX reinstall. Run `Developer: Reload Window` or restart VS Code.
- The backend can be stale if an older `tsx src/backend/server.ts` process is still holding port `3001`. Check the port owner before trusting live behavior.
- `chat_history.json` is local runtime state and can contain old provider errors. Do not treat old history entries as current failures without fresh timestamps/logs.
- Windows CRLF warnings are expected.
- `Project-Documents` are outside the `Desktop-app` git repo and locked.
- Do not stage generated `.kryleos`, `dist`, `dist-backend`, `node_modules`, VSIX files, or chat history unless explicitly requested.

## 9. Recommended Next Chat Opening Move

Run:

```powershell
cd "C:\Users\yassi\Documents\Claude\Projects\Kryleos-Forge\Desktop-app"
git status --short --untracked-files=all
git diff --stat
rg -n "flowDiff|crewPersonas|installCrewPersona|Scratchbook|api/artifacts|inferCategory|session_plan_" src projects.json
```

Then decide whether to:

1. Verify and polish the current PLAN/FLOW/CREW slice.
2. Remove or keep the local `Diff Test` project in `projects.json`.
3. Run lint/build/tests and perform manual browser QA.
4. Commit the slice after verification.

## 10. Subagent Delegation And Optimization Blueprint

Use this tactical model-selection guide for large-scale engineering work in this project.

### Model Tier Selection

| Model Tier | Quota Footprint | Primary Strength | Ideal Deployment Stage |
|---|---:|---|---|
| `gpt-5.5` / `gpt-5.4` | 100% | Deep structural reasoning, high-context ambiguity resolution, complex refactoring | System architecture, final code reviews, cross-module integration gates |
| `gpt-5.4-mini` | ~30% | High-throughput execution, predictable algorithmic blocks, context-heavy read/scan loops | Isolated implementation, parallel test generation, log analysis |

### Reasoning Levels

Use medium reasoning as the balanced default for localized file modifications, single-component additions, standard data parsing, and robust unit tests.

Use high reasoning for complex state management, concurrency/asynchronous handling, heavy algorithmic refactoring, or multi-file cascading modifications.

Avoid `xhigh` for standard engineering workflows unless there is an unusual ambiguity or integration risk.

### `gpt-5.4-mini` Delegation Matrix

Good mini subagent tasks:

- Symbol and dependency tracing across the workspace.
- Log and stack-trace triage.
- Third-party API or documentation scans when paired with the right MCP/documentation source.
- Predictable database schemas, controllers, CRUD operations, and standard layout scaffolds.
- Mock objects, JSON fixtures, seeded data, and test fixtures.
- Interface/type translation for legacy payload contracts.
- Parallel unit tests for pure functions and independent utility files.
- TET loops on isolated failing tests when the write target is narrow and exclusive.
- Static security sweeps for hardcoded secrets, unprotected exceptions, and unsafe query patterns.
- Lint/style cleanup in files not being edited by another agent.
- Local README or internal doc synchronization when docs are explicitly unlocked.

Guardrails:

- Keep delegated tasks concrete, bounded, and self-contained.
- Do not delegate the immediate critical-path blocker if the main agent can solve it faster locally.
- Give worker subagents disjoint file ownership.
- Never let multiple subagents write the same file simultaneously.
- Route final merge and integration decisions through the primary agent.

Example branch review prompt:

```text
Spawn three parallel subagents running on gpt-5.4-mini to review this implementation branch:
1. Subagent 'explorer' to analyze the diff for unhandled error pathways.
2. Subagent 'worker' to identify missing unit test coverage.
3. Subagent 'reviewer' to cross-verify parameter type alignments.
Consolidate their findings into a single bulleted engineering brief and return it to this main thread.
```

Example isolated TET loop prompt:

```text
Initialize an isolated worker subagent using gpt-5.4-mini. Point it at `tests/auth_service_test.go`.
Instruct it to run the suite, analyze any output failures, apply targeted patches to `services/auth.go`, and repeat until the suite passes cleanly.
Return only the successfully verified git patch to the main context.
```
