# Kryleos Forge - Claude Code Handoff

## Antigravity Handoff - UI Redesign Pass

Last updated: 2026-06-09 20:20 +05:30.

This is the current continuation brief for taking the remaining UI fixes into Antigravity. The older sections below are historical context from prior Claude/Codex sessions; prefer this section first.

### Owner Direction

- Continue the UI polish from a Matrix-style prototype into a professional founder workspace.
- Preserve the core Build Loop identity: PLAN -> CREW -> FLOW -> FORGE.
- Do not turn PLAN into a pure chatbot. Keep the split model where chat edits a durable plan artifact.
- Keep Matrix Rain / neon terminal styling as opt-in only, not the default product feel.
- `Project-Documents/` moved off `main` to the `internal-docs` branch (repo cleanup). Do not edit it there; it is locked.
- Preserve local-first, BYOK, Ollama, command approval, stop workflow, and PLAN Ask -> Build behavior.

### Working Directory

```powershell
cd "C:\Users\yassi\Documents\Claude\Projects\Kryleos-Forge\Desktop-app"
```

### Current Uncommitted Code Changes

The UI redesign pass has been implemented but not committed. Current changed files:

```text
src/App.tsx
src/backend/agents.ts
src/backend/server.ts
src/components/AgentDashboard.tsx
src/components/ChatConsole.tsx
src/components/ConfigHeader.tsx
src/components/CoworkSpace.tsx
src/components/PlanningScreen.tsx
src/components/PreviewDeck.tsx
src/components/ProjectBoard.tsx
src/index.css
CURRENT_STATUS.md
HANDOFF.md
```

Notes:

- `CURRENT_STATUS.md` is currently untracked from earlier work. Do not delete it unless the owner asks.
- The backend files were changed in an earlier slice for stop/abort workflow support; preserve those changes.
- The latest UI work is mostly frontend/CSS.

### Implemented In This UI Pass

- `theme-forge` now reads more like the default professional product UI:
  - light gray/white primary text
  - green reserved more for active/status/focus
  - reduced glow, CRT effects, terminal borders, tiny neon styling
  - shared semantic classes added in `src/index.css` such as `forge-topbar`, `forge-tab`, `forge-surface`, `forge-composer`, `forge-plan-document`, `forge-stop-button`, and status chips
- App shell copy was softened:
  - `KRYLEOS FORGE // workspace_v1.0` -> `Kryleos Forge`
  - `LINK` -> `Connected`
  - `[NEW]` -> `New Plan` / `New Session`
  - archive/checklist labels -> `Plans` / `Sessions` and `Current run`
- PLAN was polished while preserving behavior:
  - left chat + right plan draft remains
  - mode labels are now `Ask only` and `Updates plan`
  - `PROMOTE` was renamed to `Use as plan update`
  - multi-repo section renamed to `Workspace targets`
  - plan draft now uses a document/artifact visual style
  - composer remains large, wrapped, and internally scrollable
- CREW/FORGE shared composer styling was updated through `ChatConsole` and workspace surfaces.
- FLOW remains board-first and was modernized:
  - `Flow board` header
  - calmer Today panel
  - modernized task form, buttons, task columns, and file/sidebar surfaces
- Stop/edit controls remain present and are styled as normal product controls.

### Verification Completed

Commands run from `Desktop-app/`:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd test
```

Results:

- Lint passed.
- Build passed.
- Tests passed: 15 test files, 107 tests.

Important test note:

- One earlier `npm.cmd test` failed because a stale/background `git add` process locked generated `test_workspace_adv` on Windows. After stopping that unrelated Git process and removing the generated workspace, `src/backend/advanced_features.test.ts` passed in isolation and then the full suite passed.

### Visual QA Completed

Checked via in-app browser at `http://127.0.0.1:5173`.

Desktop PLAN verification:

- Shell shows `Kryleos Forge`, `Connected`, `Plans`, `New Plan`.
- Old shell labels `workspace_v1.0`, `[NEW]`, and `PROMOTE` are absent.
- PLAN shows `Ask only`, `Updates plan`, `Plan draft`, and `Workspace targets`.
- PLAN composer measured about 160px tall with `overflow-y: auto` and `white-space: pre-wrap`.
- Plan document area measured about 665px wide by 770px tall at 1440x900.
- Ask mode shows `Use as plan update` when prior Ask context exists.
- Desktop viewport had no horizontal overflow at 1440x900.

FLOW verification:

- App restored to FLOW initially.
- FLOW remained board-first and readable at 1440x900 with modernized labels.

### Remaining Antigravity Fixes

Recommended next UI tasks:

1. Finish visual QA at narrower laptop width, especially PLAN at around 1280x720.
2. Check CREW and FORGE visually after the shared composer/surface polish.
3. Confirm Matrix theme is still available as an opt-in theme and that `theme-forge` is the calmer default.
4. Clean up `ConfigHeader.tsx` config drawer tab labels. There is likely mojibake/emoji text around the config drawer tabs, for example labels like `API KEYS`, `DIRECTORY`, and similar sections may still contain corrupted emoji bytes. Earlier patching failed because of encoding mismatch; inspect the file and replace with plain professional labels.
5. Consider replacing remaining uppercase terminal labels in secondary surfaces, especially file sidebar labels such as `WORKSPACE DIRECTORY`, `WORKSPACE FILES`, and git labels. This is polish only; do not break functionality.
6. Verify PLAN `New Plan` resets local PLAN state after the current stateful browser session.
7. Verify Ask mode does not mutate plan and `Use as plan update` moves Ask context into Build input.
8. Verify Build mode updates the visible plan draft.

### Suggested Antigravity Test Plan

```powershell
cd "C:\Users\yassi\Documents\Claude\Projects\Kryleos-Forge\Desktop-app"
npm.cmd run lint
npm.cmd run build
npm.cmd test
```

Then run visual QA:

- PLAN at 1440x900 and 1280x720.
- CREW composer: large, wrapped, scrollable, stop/edit controls visible during activity.
- FORGE composer: same.
- FLOW: board-first, task cards readable, Today view usable.
- Config drawer: no corrupted labels, no Matrix-only copy in default theme.

### Implementation Files To Inspect First

- `src/index.css`
- `src/App.tsx`
- `src/components/PlanningScreen.tsx`
- `src/components/ChatConsole.tsx`
- `src/components/CoworkSpace.tsx`
- `src/components/ProjectBoard.tsx`
- `src/components/PreviewDeck.tsx`
- `src/components/ConfigHeader.tsx`

### Caution

There was an unrelated background Git process attempting to stage a huge workspace set including `Project-Documents`. It was stopped during verification. Before committing in Antigravity, check status carefully and do not stage `Project-Documents` unless the owner explicitly unlocks it.

Warm-start brief for continuing this exact desktop app session in Claude Code.

## 0. Current Instruction From Owner

- The project documentation, formerly `../Project-Documents/`, moved off `main` to the `internal-docs` branch (repo cleanup); it is locked and considered complete there.
- Do not edit project docs unless the owner explicitly unlocks them.
- Code changes are allowed inside `Desktop-app/`.
- This handoff file was explicitly requested for moving the session to Claude Code.

## 1. Product Context

Kryleos Forge is a local-first desktop AI coding workspace for solo developers and indie founders. It is an Electron + React + local Express backend app with WebSocket streaming, BYOK model support, Ollama/local models, agent workflows, project docs, review surfaces, command approvals, and a VS Code extension bridge.

Core positioning to preserve:

- Affordable local-first AI coding workspace.
- BYOK and Ollama/local model support.
- Practical solo/founder workflows, not fake enterprise claims.
- Simulated or preview capabilities must stay honestly labeled as preview/simulator until production-grade.

## 2. Repo And Runtime

- Working directory: `C:\Users\yassi\Documents\Claude\Projects\Kryleos-Forge\Desktop-app`
- Parent docs directory: `C:\Users\yassi\Documents\Claude\Projects\Kryleos-Forge\Project-Documents`
- Main app ports:
  - Backend Express + WebSocket: `3001`
  - Vite frontend: `5173`
  - Ollama: `11434`
- VS Code CLI:
  - `C:\Users\yassi\AppData\Local\Programs\Microsoft VS Code\bin\code.cmd`

Useful commands:

```powershell
cd "C:\Users\yassi\Documents\Claude\Projects\Kryleos-Forge\Desktop-app"
npm.cmd run dev
npm.cmd run lint
npm.cmd run build
npm.cmd test
```

VS Code extension commands:

```powershell
cd "C:\Users\yassi\Documents\Claude\Projects\Kryleos-Forge\Desktop-app\kryleos-forge-vscode"
npm.cmd run compile
npm.cmd run package -- --out kryleos-forge-0.1.0.vsix
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --install-extension "C:\Users\yassi\Documents\Claude\Projects\Kryleos-Forge\Desktop-app\kryleos-forge-vscode\kryleos-forge-0.1.0.vsix" --force
```

## 3. Current Git Status

**Everything below is committed and pushed.** Working tree clean; `main` in sync with origin.

- Remote: `origin` = `https://github.com/yassin-kryleos/zeloryn.git`
- Latest commit: `66fe21c` (deterministic command-approval smoke path)
- This session's commits (newest first):
  - `66fe21c` feat: deterministic command-approval smoke path (no model)
  - `1680389` feat(agents): harden tool-call parsing + strict local-model prompting
  - `7b80b49` feat: Phase 2.7 VS Code extension + Ollama-without-hosted-key (Codex session)
  - earlier: `398c100`/`2b036c4`/`d6fa460`/`64de4e3`/`7b6b338` (Phase 2.6 + FLOW persistence/hydration fixes)

Ignored/generated (keep untracked): `*.vsix`, `dist/`, `dist-backend/`, `node_modules/`, `chat_history.json`, `.kryleos/`.

Before any final commit, run:

```powershell
git status --short --untracked-files=all
npm.cmd run lint
npm.cmd run build
npm.cmd test
cd kryleos-forge-vscode
npm.cmd run compile
```

## 4. Current Completed Work

### Phase 2.6 Build Loop V2

Phase 2.6 was previously implemented and verified:

- Two-phase acceptance criteria.
- Criteria enrichment.
- Structured trace extraction.
- Drift detection.
- FLOW Today scoring and dependency editor.
- Tiered "What's Left" report.
- Project setup and bootstrap flows.

Known 2.6 status:

- `npm test` previously passed 100/100 after removing stale generated `test_workspace_adv`.
- `npm run lint` passed.
- `npm run build` passed.

### Phase 2.7 VS Code Extension

The VS Code extension package now exists under `kryleos-forge-vscode/`.

Implemented capabilities:

- Status bar connection indicator.
- Workspace sync to Forge backend.
- Review sidebar webview polling `/api/review/current`.
- Accept/reject review actions.
- `Kryleos Forge: Ask Forge Agent`.
- `Kryleos Forge: Test Command Approval Prompt`.
- Command approval modal path for extension-originated command requests.
- Extension packaging into `.vsix`.

Recent fixes:

- Review view type fixed to `webview`.
- Workspace sync now prompts to open/select a folder when no workspace is active.
- Command approval smoke path was verified with `node -v`.
- Extension package compiles and packages.

### Local-model tool-calling hardening + smoke path (latest session)

Done + committed (`1680389`, `66fe21c`); suite now **107 tests**, lint/build/ext-compile green.

- **Tolerant tool-call parsing** (`src/backend/agents.ts` `parseActionBlock`): falls back `<action>` tag → ` ```json ` fence → first brace-balanced JSON object containing `"type"`. Fixes small local models that drop the tag or wrap JSON in prose. Covered by `agents_parse.test.ts`.
- **Strict local-model prompt** (`getSystemPrompt` coordinator): CRITICAL OUTPUT RULES + literal `runCommand` example; extra `LOCAL MODEL MODE` block gated on `AgentOrchestrator.setLocalModel(...)`, which `server.ts` sets from `isOllamaModel(currentModel)` on each WS `config`.
- **Deterministic approval smoke path** (no model): `AgentOrchestrator.runCommandWithApproval(command)` → WS `smoke_command` case in `server.ts` → returns `smoke_result`. Extension `ForgeClient.runSmokeCommand()`; the `Test Command Approval Prompt` command now runs the full backend path (modal → approve → real exec → output). Covered by `agents_smoke.test.ts`.

## 5. Latest Code Changes Needing Final Verification

The most recent implementation slice makes the app and extension use Ollama without a hosted API key.

### `src/backend/ollama.ts`

Added:

- `OllamaModelInfo` interface.
- `listModels(baseUrl)` method calling Ollama `/api/tags`.

### `src/backend/server.ts`

Added:

- `isOllamaModel(model)`.
- `normalizeOllamaModel(model)`.
- REST route `GET /api/ollama/models`.

Changed routing:

- Dynamic model IDs such as `ollama:qwen2.5:7b` now route to the Ollama client.
- Ollama routing now happens before OpenRouter routing, so `ollama:qwen2.5:7b` is not mistaken for a hosted model.
- WebSocket `config` messages set Ollama model correctly.

### `src/components/ConfigHeader.tsx`

Added:

- Auto-detection of installed Ollama chat models.
- `DETECT MODELS` button.
- Local model dropdown entries like `ollama:qwen2.5:7b`.
- Status text such as "3 local model(s) detected".

Confirmed available local Ollama models during the previous session:

- `qwen2.5:7b`
- `llama3.1:latest`
- `llama3:latest`
- `orca-mini:3b`
- `nomic-embed-text:latest` was detected but correctly treated as embedding-only, not a chat model.

### `kryleos-forge-vscode/package.json`

Added extension settings:

- `kryleosForge.model`, default `ollama:qwen2.5:7b`
- `kryleosForge.ollamaUrl`, default `http://localhost:11434`

### `kryleos-forge-vscode/src/extension.ts`

Added:

- `modelConfig()`.
- On `Ask Forge Agent`, the extension now sends a WebSocket `config` message before the `query`.
- The output log should include `[config] Using ollama:qwen2.5:7b` when the new extension host is active.

## 6. Verification Already Done

Backend dynamic Ollama routing was verified independently:

- `GET /api/ollama/models` returned installed Ollama models.
- Direct Ollama generate to `qwen2.5:7b` returned `OK`.
- Backend WebSocket smoke using:

```json
{
  "type": "config",
  "model": "ollama:qwen2.5:7b",
  "ollamaUrl": "http://localhost:11434"
}
```

followed by a chat query returned an assistant response from Ollama.

Full code checks after the Ollama selector work:

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- `npm.cmd test` passed 100/100 after deleting stale generated `Desktop-app/test_workspace_adv`.
- VS Code extension `npm.cmd run compile` passed.
- VS Code extension package command passed.
- VSIX was installed with `--force`.

Installed extension files were inspected and confirmed to include:

- `kryleosForge.model`
- default `ollama:qwen2.5:7b`
- `[config] Using ${modelConfig.model}` log line

## 7. Immediate Next Task

The owner's last active implementation request before this handoff was:

> Run the real VS Code Ask Forge Agent command again using `ollama:qwen2.5:7b`, then verify command approval end-to-end without needing a hosted API key.

This still needs a live VS Code run (cannot be driven headlessly). NOTE: a model-independent fallback now exists — run `Kryleos Forge: Test Command Approval Prompt` to verify the approval modal + real command exec end-to-end without any model (uses the new `smoke_command` path). Use that to confirm the modal works, then do the real `Ask Forge Agent` run for the model tool-call path.

Steps to run the real path (after `Developer: Reload Window` so the installed VSIX loads):

What happened:

- Earlier real `Ask Forge Agent` tried DeepSeek and failed due missing hosted API key.
- The extension was updated to send `ollama:qwen2.5:7b`.
- A later attempt still appeared to use the old extension host because the VS Code output log did not show `[config] Using ollama:qwen2.5:7b`.
- The installed extension on disk was correct, so the likely issue was stale VS Code extension host state.

Recommended next steps:

1. Cleanly reload or restart VS Code so the extension host loads the installed VSIX.
2. Open `Desktop-app` in VS Code.
3. Run command palette command `Kryleos Forge: Ask Forge Agent`.
4. Use this prompt:

```text
You must call the runCommand tool exactly once with {"command":"node -v"}. Do not answer directly before using the tool. Do not edit files.
```

5. Verify the VS Code output log contains:

```text
[config] Using ollama:qwen2.5:7b
```

6. Verify the command approval modal appears.
7. Approve it.
8. Verify the command output appears and the agent completes without a hosted API key.

Useful log command:

```powershell
Get-ChildItem -Path "$env:APPDATA\Code\logs" -Recurse -Filter '*Kryleos Forge.log' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 4 FullName,LastWriteTime |
  ForEach-Object {
    Write-Output "--- $($_.FullName)"
    Get-Content -LiteralPath $_.FullName | Select-Object -Last 220
  }
```

If VS Code is still stale, either run `Developer: Reload Window` or close/reopen VS Code. Be careful if there are unsaved files.

## 8. Possible Issue To Watch

Even after the extension sends `ollama:qwen2.5:7b`, Qwen may not reliably emit the exact tool-call format needed by the orchestrator.

If the model answers directly instead of requesting `runCommand`, do not treat that as an Ollama routing failure. It means local-model tool-call prompting needs hardening.

Likely fix if needed:

- Inspect `src/backend/agents.ts` tool-call parsing.
- Add a stricter local-model command-use instruction in the system prompt.
- Consider a deterministic command-approval smoke endpoint or extension-only test command for repeatable QA.
- Preserve the real agent path, but use the smoke command for CI/manual verification of the approval modal.

## 9. Architecture Map

| Path | Role |
|---|---|
| `src/App.tsx` | Root React app, spaces, WebSocket client, config, session/task state |
| `src/backend/server.ts` | Express + WebSocket server, REST routes, model proxy |
| `src/backend/agents.ts` | Agent orchestrator, chat client interface, run loop, command approval |
| `src/backend/tools.ts` | Command execution and tool implementation |
| `src/backend/ollama.ts` | Ollama client |
| `src/backend/planningV2.ts` | Build Loop engine |
| `src/backend/db.ts` | JSON-backed local app state |
| `src/components/ConfigHeader.tsx` | Provider/model/key configuration UI |
| `src/components/PlanningScreen.tsx` | PLAN UI |
| `src/components/ProjectBoard.tsx` | FLOW board |
| `kryleos-forge-vscode/src/extension.ts` | VS Code extension activation, commands, webview, backend bridge |

## 10. Safety And Product Rules

- Do not make the app depend on hosted API keys for basic local/Ollama workflows.
- Do not market simulator features as production enterprise security/collaboration.
- Preserve graceful fallback behavior when LLM providers are unavailable.
- Keep command approval and abort behavior intact.
- Do not edit locked project docs.
- Avoid broad refactors unless needed for the immediate phase.
- Run lint/build/tests after code changes.

## 11. Known Gotchas

- `chat_history.json` is local runtime state and gitignored.
- `.kryleos/` contains local traces/drift cache and is gitignored.
- VS Code may keep a stale extension host after reinstalling the VSIX; reload the window or restart VS Code.
- Windows CRLF warnings are expected.
- `Project-Documents` are outside the `Desktop-app` git repo.
- Remote IS configured: `origin` → `yassin-kryleos/zeloryn`, `main`. Pull before starting; push after each green slice.

## 12. Suggested Claude Code Opening Move

Run these first:

```powershell
cd "C:\Users\yassi\Documents\Claude\Projects\Kryleos-Forge\Desktop-app"
git status --short --untracked-files=all
rg -n "ollama:qwen2.5:7b|modelConfig|command_approval_required|approve_command|runCommand" src kryleos-forge-vscode
```

Then complete the immediate VS Code Ask Forge Agent + Ollama command approval verification from section 7.
