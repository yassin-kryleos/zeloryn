# Exit Report — Phase 6: Multi-engine execution: in-app runners + external handoff

## Changes made
- `Desktop-app/src/backend/cliAgentRunner.ts`: **[Tier 1]** Replaced the `CodexCliRunner` placeholder stub with a full production implementation featuring binary discovery (`KRYLEOS_CODEX_PATH`, PATH, `~/.local/bin/codex`), capability probing (`codex --version`), structured prompt construction (`buildPrompt`), buffered execution (`run` via `codex exec`), and live pseudo-terminal streaming (`runPty` via `TerminalManager`).
- `Desktop-app/src/backend/__tests__/cliAgentRunner.test.ts`: **[Tier 1]** Added 6 dedicated unit and smoke tests for `CodexCliRunner` verifying binary discovery, environment variable overrides, prompt structure, JSONL parsing, missing binary errors, PTY streaming, and a smoke test against the live installed `/home/yassin/.local/bin/codex` (v0.154.0) binary.
- `Desktop-app/src/backend/handoff.ts`: **[Tier 2]** [NEW] Implemented the generic handoff engine:
  - `HandoffRegistry`: Registers supported Tier 2 targets (`cursor`, `antigravity`, `vscode`, `windsurf`, `clipboard`).
  - `generateHandoffBundle()`: Formats card specification, acceptance criteria, category, assignee, and workspace context into a clean Markdown bundle written to `.kryleos/handoff/<card-id>.md`.
  - `executeHandoff()`: Writes bundle to disk and performs safe, non-blocking OS app launching (`child_process.spawn` with `detached: true, stdio: 'ignore'`) or clipboard fallback with instructions.
  - **Strict safety**: Enforces that no programmatic automation or API-driving code exists for external tools.
- `Desktop-app/src/backend/__tests__/handoff.test.ts`: **[Tier 2]** [NEW] Added 5 unit tests validating handoff registry targets, asserting that Cursor and Antigravity are strictly Tier 2 (no `run` or `runPty` methods), checking bundle formatting, validating disk writes to `.kryleos/handoff/`, and testing missing binary fallback.
- `Desktop-app/src/backend/server.ts`: **[Tier 1 & Tier 2]** Exposed REST endpoints:
  - `GET /api/runners`: Returns registered Tier 1 runners with availability and default runner ID.
  - `GET /api/handoff/targets`: Returns registered Tier 2 handoff targets and launch commands.
  - `POST /api/handoff/export`: Exports handoff specification bundle to `.kryleos/handoff/<card-id>.md` and triggers editor launch.
- `Desktop-app/src/components/ProjectBoard.tsx`: **[Tier 1 & Tier 2]** Added card-level execution controls:
  - Card-level Tier 1 runner picker dropdown (`Claude Code` / `Codex CLI`).
  - "Push to..." card action (`ExternalLink` button) opening the **Push / Handoff Modal**.
  - Visually demarcates **Tier 1 (In-App Runners)** ("Runs inside Forge with live output, approvals, and audit trail") from **Tier 2 (External Handoff)** ("Opens externally, you finish it there. Forge generates the specification and steps aside").
- `Desktop-app/src/App.tsx`: **[Tier 1]** Extended `SendQueryOptions` to support the `runner` field and forwarded it in the WebSocket `query` dispatch to route tasks to the selected in-app engine.
- `README.md`: Updated Roadmap marking Phase 6 completed.

---

## Deviations from plan
- None. The two-tier architectural separation was strictly maintained. Codex CLI was implemented as a real Tier 1 in-app runner, while Cursor and Antigravity were strictly limited to Tier 2 external handoff.

---

## Tests run
1. **Desktop App Test Suite**:
   - `npm test` in `Desktop-app` → **PASS** (59 test files passed, 1 skipped [Ollama e2e when offline], 526 tests passed, 0 failures).
   - `npx vitest run src/backend/__tests__/cliAgentRunner.test.ts` → **PASS** (15/15 tests passed, including 6 CodexCliRunner tests and real binary smoke test against `codex-cli 0.154.0`).
   - `npx vitest run src/backend/__tests__/handoff.test.ts` → **PASS** (5/5 tests passed).
   - `npm run build` in `Desktop-app` → **PASS** (Vite client build and esbuild backend bundle passed cleanly).
2. **Web Companion Test Suite**:
   - `npm test` in `Web-app` → **PASS** (3 test files passed, 17 tests passed, 0 failures).
3. **Mobile Companion Test Suite**:
   - `npm test` in `Mobile-app` → **PASS** (5 test files passed, 46 tests passed, 0 failures).
   - `npx tsc --noEmit` in `Mobile-app` → **PASS** (0 TypeScript diagnostics or type errors).
4. **VS Code Extension Build**:
   - `npm run compile` in `Desktop-app/kryleos-forge-vscode` → **PASS** (`tsc -p .` clean).

---

## Known gaps / follow-ups
- **Implemented Launch Commands**: Tier 2 OS launch commands were implemented for `cursor` (`cursor "{folder}"`), `antigravity` (`antigravity "{folder}"`), `vscode` (`code "{folder}"`), and `windsurf` (`windsurf "{folder}"`), along with a manual clipboard fallback (`clipboard`).
- **Follow-up on External Tools**: If Cursor ever provides third-party BYOK provider key support, or Google provides a programmatic API clear of Clause 6, a Tier 1 runner can be evaluated then. Until then, they remain strictly Tier 2.

---

## Verification needed from reviewer
1. **Confirm No Tier 1 Code Path for Cursor or Antigravity**:
   - Check `Desktop-app/src/backend/cliAgentRunner.ts`: confirm only `ClaudeCodeRunner` and `CodexCliRunner` are registered as Tier 1 runners.
   - Check `Desktop-app/src/backend/handoff.ts`: confirm `cursor` and `antigravity` exist exclusively in `TIER_2_HANDOFF_TARGETS` as external handoff targets with no `run()` or `runPty()` methods.
2. **Tier 1 Codex CLI In-App Execution**:
   - Open Desktop Forge (`npm run dev` in `Desktop-app`).
   - In the FLOW board, verify that Kanban cards offer the runner picker (`Claude` / `Codex`).
   - Run a task with Codex CLI selected and verify that the backend invokes `/home/yassin/.local/bin/codex exec` and streams output live into the terminal/console.
3. **Tier 2 External Handoff**:
   - Click the "Push to..." (`ExternalLink`) button on any Kanban card.
   - Select **Cursor**, **Antigravity**, or **Clipboard**.
   - Verify that `.kryleos/handoff/<card-id>.md` is written to disk with task title, description, and acceptance criteria.
   - Verify that the notification displays the relative file path and external handoff instructions.
