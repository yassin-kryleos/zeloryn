## Exit Report — Phase 9: Differentiator features

### Changes made
- `Desktop-app/src/backend/decisionMemory.ts`: Created new module implementing append-only cross-card architectural decision memory (`.kryleos/decisions.md`). Exports `loadDecisions`, `loadDecisionsSync`, `recordDecision`, `recordDecisionSync`, `formatDecisionsForPrompt`, and `parseDecisionsFromReview`.
- `Desktop-app/src/backend/cliAgentRunner.ts`: Updated `ClaudeCodeRunner.buildPrompt` and `CodexCliRunner.buildPrompt` to load `.kryleos/decisions.md` via `loadDecisionsSync` and inject into prompt context under `--- Architectural Decisions (.kryleos/decisions.md) ---`.
- `Desktop-app/src/backend/postExecutionReviewer.ts`: Updated `runPostExecutionReview` to extract any `DECISION:` lines from review findings via `parseDecisionsFromReview` and record them directly to `.kryleos/decisions.md`.
- `Desktop-app/src/shared/crewPersonas.ts`: Updated `Technical Reviewer` and `Post-Execution Reviewer` persona prompts to respect `.kryleos/decisions.md` and emit explicit `DECISION: <one-line summary>` directives when resolving architectural choices or precedents.
- `Desktop-app/src/backend/agents.ts`:
  - Added `fastClient?: ChatClient` property, constructor parameter, and `setFastClient` setter to `AgentOrchestrator`.
  - Injected `.kryleos/decisions.md` into `loadWorkspaceInstructions()` under `=== CROSS-CARD ARCHITECTURAL DECISIONS ===`.
  - Added `recordDecision` tool case in `executeTool`.
  - Routed Scope Guard persona review (`invokeSpecialist` with `role === 'scope_guard'`) to `this.fastClient || this.client`.
  - Routed historical context compaction (`compressContextHistory`) to `this.fastClient || this.client`.
  - Kept FORGE execution (coordinator loop), developer specialist, technical reviewer specialist, and post-execution reviewer on the primary client.
- `Desktop-app/src/backend/server.ts`:
  - Defined `fastModelProxy` with real-time token/cost tracking and `isFastRoute: true` telemetry.
  - Handled `data.fastModel` in `case 'config':` to dynamically toggle `orchestrator.setFastClient(fastModelProxy)`.
  - Added REST API endpoints `GET /api/decisions` and `POST /api/decisions`.
  - Updated `POST /api/worktrees/merge/:taskId` to resolve `cardData` from `req.body` or `findTaskById(taskId)` and forward to `sandbox.mergeCardWorktree`.
- `Desktop-app/src/backend/tools.ts`:
  - Exported `CardPrData` interface.
  - Added `assemblePrAndChangelog` private helper.
  - Updated `mergeCardWorktree` to assemble a structured PR description (`.kryleos/pull_requests/<taskId>.md`) and append a concise changelog entry (`.kryleos/CHANGELOG.md`) upon successful staging verification and target merge, returning `prDescription`, `prPath`, and `changelogPath`.
- `Desktop-app/src/components/ConfigHeader.tsx`:
  - Added `fastModel?: string` to `ConfigHeaderProps` and `onUpdateConfig`.
  - Added "Fast Model" select dropdown alongside the primary model selector, supporting fast models across DeepSeek (`deepseek-chat`), Gemini (`gemini-2.5-flash`, `gemini-3.5-flash`), OpenAI (`gpt-4o-mini`, `gpt-5.5-mini`), Anthropic (`claude-3-5-haiku-latest`), OpenRouter, and Ollama.
- `Desktop-app/src/App.tsx`:
  - Added `fastModel` state with `localStorage` persistence (`matrix_fast_model`).
  - Synced `fastModel` across `wsConfigRef`, `handleUpdateConfig`, auto-sync effect, and passed as prop to `<ConfigHeader />`.
- `Desktop-app/src/backend/__tests__/decisionMemory.test.ts`: Added unit tests verifying reading/writing `.kryleos/decisions.md`, append-only behavior, prompt formatting, review parsing, and runner prompt injection (6 tests).
- `Desktop-app/src/backend/__tests__/modelRouting.test.ts`: Added unit tests verifying cost-aware model routing (Scope Guard routed to `fastClient`, Technical Reviewer routed to primary `client`, fallback when `fastClient` is omitted, and dynamic updates via `setFastClient`) (3 tests).
- `Desktop-app/src/backend/__tests__/prDescription.test.ts`: Added unit tests verifying PR markdown assembly, acceptance criteria checklist, review verdict inclusion, git diff statistics, and CHANGELOG append upon worktree merge (2 tests).

### Deviations from plan
- None. Items 9a, 9b, and 9c were implemented as specified in `docs/open-sorce-startegy.md`.

### Tests run
- `Desktop-app`: `npx vitest run src/backend/__tests__/decisionMemory.test.ts src/backend/__tests__/modelRouting.test.ts src/backend/__tests__/prDescription.test.ts` → PASS (3 test files, 11 tests passed in 886ms)
- `Desktop-app`: `npx vitest run src/backend/__tests__/cliAgentRunner.test.ts src/backend/__tests__/worktree.test.ts src/backend/__tests__/postExecutionReviewer.test.ts` → PASS (3 test files, 27 tests passed in 1.38s)
- `Desktop-app`: `npm test` → PASS (65 test files passed, 1 skipped, 554 tests passed, 1 expected fail, 1 skipped in 6.31s)
- `Desktop-app`: `npm run build` → PASS (`tsc -b`, Vite client build, and esbuild backend bundle all succeeded with 0 errors)
- `Web-app`: `npm test` → PASS (3 test files passed, 17 tests passed in 268ms)
- `Mobile-app`: `npm test` → PASS (5 test files passed, 46 tests passed in 446ms)

### Known gaps / follow-ups
- Phase 10 (as documented in `docs/open-sorce-startegy.md`): Fix orphaned-process leak in the Codex smoke test (`cliAgentRunner.test.ts`) where `mise x codex -- codex --version` can leave behind an orphaned child process on machines using the `mise` version manager shim.

### Verification needed from reviewer
1. **Decision Memory (9a)**:
   - Check that `Desktop-app/src/backend/decisionMemory.ts` initializes `.kryleos/decisions.md` with headers and appends single-line entries formatted as `- [YYYY-MM-DD] [taskId] <decision>`.
   - Verify that `buildPrompt` in `cliAgentRunner.ts` and `loadWorkspaceInstructions` in `agents.ts` inject this context into subsequent agent runs.
2. **Cost-Aware Routing (9b)**:
   - Verify that in `Desktop-app/src/components/ConfigHeader.tsx`, the Fast Model selector dropdown is rendered alongside the primary Model selector and correctly dispatches `onUpdateConfig({ fastModel })`.
   - Verify that `AgentOrchestrator` routes `scope_guard` and history compaction to `fastClient`, while `technical_reviewer`, developer, coordinator, and post-execution reviewer stay on the primary model.
3. **Auto-Generated PR Description (9c)**:
   - Verify that when `sandbox.mergeCardWorktree` executes, `.kryleos/pull_requests/<taskId>.md` is assembled with Title, Summary, Acceptance Criteria checklist, Review Verdict/Findings, Staging test verification, and diff stat.
   - Verify that `.kryleos/CHANGELOG.md` is created/appended with a release entry.
4. **Security Boundary**:
   - Confirm that `LOCAL_SESSION_SECRET`, companion pairing (`COMPANION_AUTH_TOKEN`, `/api/companion/pairing-code`), and `OS_FINGERPRINT` remain completely untouched.
