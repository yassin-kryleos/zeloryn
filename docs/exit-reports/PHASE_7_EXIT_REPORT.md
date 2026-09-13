# Exit Report — Phase 7: Retrieval, verification loops & merge safety

## Changes made

### 7a. Post-execution CREW Reviewer
- `Desktop-app/src/shared/crewPersonas.ts`: Added 4th persona `post_execution_reviewer` ("Post-Execution Reviewer persona. Review completed work against the card's acceptance criteria, check git diffs for regressions, undocumented changes, or missed edge cases, and report a clear PASS or FAIL judgment with detailed findings.").
- `Desktop-app/src/backend/db.ts`: Defined `PostExecutionReview` interface (`status`, `verdict`, `findings`, `reviewedAt`, `override`) and attached optional `postExecutionReview` to `ProjectTask`.
- `Desktop-app/src/backend/postExecutionReviewer.ts`: **[NEW]** Created post-execution review service:
  - `getCardDiff()`: Retrieves actual git diff from isolated card branch (`HEAD...forge/card-<id>`) or workspace changes (`git diff HEAD`).
  - `runPostExecutionReview()`: Formats prompt with card title, acceptance criteria, and git diff; runs through LLM client if configured using the persona system prompt, parsing `VERDICT: PASS` / `VERDICT: FAIL` and findings, with deterministic fallback for local/offline environments.
- `Desktop-app/src/backend/planningV2.ts`: Implemented `savePostExecutionReview()` and `overridePostExecutionReview()` to persist reviews and permit human overrides.
- `Desktop-app/src/backend/server.ts`:
  - Attached automatic review invocation on completion of FORGE runs (`startForgeRun`) and CLI agent runner tasks (`claude-code`, `codex-cli`).
  - Broadcasts review status via `companionHub.broadcastSessionUpdate`.
  - Exposed `POST /api/plan/items/:id/review` (manual review trigger) and `POST /api/plan/items/:id/review/override` (manual human override).
- `Desktop-app/src/backend/companionHub.ts`: Added `postExecutionReview` payload field to `broadcastSessionUpdate`.
- `Desktop-app/src/components/ProjectBoard.tsx`:
  - Added move-to-Done guard blocking card progression if review status is `'failed'` without an override, prompting user for explicit confirmation or override.
  - Added visual card badge (`review: pass` in emerald, `review: fail` in red) displaying findings in title tooltip.
  - Added card action button (`ShieldCheck`) to manually trigger post-execution review on demand.
- `Desktop-app/src/backend/__tests__/postExecutionReviewer.test.ts`: **[NEW]** Added 4 unit tests verifying diff detection, LLM verdict parsing, failure handling, and `PlanningV2Service` review persistence/override.

### 7b. Real Retry Loop on Sentinel Check
- `Desktop-app/src/backend/agents.ts`:
  - Replaced single-shot compilation check with bounded 3-attempt retry loop (`runFailsafeCompilationCheck`).
  - Integrated `detectTestCommand()` to automatically run project tests (`npm test`, `pytest`, `cargo test`) after compilation check.
  - Implemented `parseTestOutput()` extracting passed/failed/total counts and exit status from test outputs.
  - On failure, orchestrator feeds the compiler/test errors back to the coordinator agent via `executeCoordinatorTurn()` with a system repair prompt, logging each retry attempt (e.g. "Sentinel check failed (attempt 1/3)... Running coordinator recovery turn").
  - Tracks `lastSentinelResult` (`passed`, `attempts`, `compileCommand`, `testCommand`, `testStats`, `lastError`), exposed via `getSentinelResult()` and reflected in `getRunState()`.
- `Desktop-app/src/backend/tools.ts`: Added project test runner detection in `detectTestCommand()` checking `package.json` scripts, `pytest.ini` / `pyproject.toml`, and `Cargo.toml`.
- `Desktop-app/src/backend/__tests__/sentinelRetry.test.ts`: **[NEW]** Added 5 unit tests validating test runner detection and orchestrator sentinel state tracking.

### 7c. Tree-sitter + PageRank Semantic Index
- `Desktop-app/package.json`: Added `tree-sitter@0.21.1`, `tree-sitter-javascript@0.21.2`, and `tree-sitter-typescript@0.21.2` as production dependencies.
- `Desktop-app/src/backend/semanticIndex.ts`: **[NEW]** Implemented full AST parser and graph indexer:
  - Supports TypeScript (`.ts`), TSX (`.tsx`), JavaScript (`.js`), and JSX (`.jsx`).
  - Extracts definitions (classes, interfaces, functions, methods, type aliases, variables).
  - Extracts import references and call edges across the codebase.
  - Computes PageRank centrality scores (damping factor 0.85, 30 iterations) over the directed dependency graph.
  - Formats ranked semantic search results ordered by `importance = PageRank * keyword relevance`.
- `Desktop-app/src/backend/tools.ts`: Wired `WorkspaceSandbox.buildSemanticCache()` and `querySemanticCache()` to `SemanticIndexer`, replacing the old regex scanner.
- `Desktop-app/src/backend/__tests__/semanticIndex.test.ts`: **[NEW]** Added 4 unit tests verifying multi-file AST parsing, TSX support, PageRank ranking of central utility files, and symbol relevance querying.

### 7d. Worktree + Staging-Branch Merge Safety
- `Desktop-app/src/backend/tools.ts`:
  - Enhanced `createCardWorktree()` with `detectWorktreeCollisions()` checking unmerged file modifications across existing card worktrees and logging collision warnings.
  - Modified `mergeCardWorktree()` to merge into a dedicated staging branch (`forge/staging-<timestamp>`) rather than touching the base branch directly.
  - Added pre-merge `scanSecrets()` gate on the card branch diff before merge; aborts merge and returns `{ success: false, error: 'Merge blocked: secrets detected...' }` if uncommitted secrets are found.
  - Executes project tests (`detectTestCommand`) on the staging branch before fast-forwarding to the target branch.
- `Desktop-app/src/backend/__tests__/worktree.test.ts`: Added 3 tests verifying secret-scan blocking on merges, worktree file collision detection, and clean worktree rollback.

### 7e. Durable Per-Card Rollback + Spend Enforcement
- `Desktop-app/src/backend/tools.ts`: Implemented `revertCardWorktree(taskId)`: safely removes git worktree (`git worktree remove --force`), prunes worktree metadata, and deletes the local card branch (`git branch -D forge/card-<id>`).
- `Desktop-app/src/backend/costGuard.ts`:
  - Implemented `SpendCapConfig` (`dailyCapUsd`, `projectCapUsd`, `enforceHardCap`).
  - Added `getSpendCap()`, `setSpendCap()`, and `checkSpendCap()` comparing actual costs from `.kryleos/audit.jsonl` against caps.
- `Desktop-app/src/backend/server.ts`:
  - Integrated `costGuard.checkSpendCap()` gate into `startForgeRun` and WebSocket CLI agent query dispatch; blocks execution with `SpendCapExceededError` (HTTP 402/error notification) when cap is exceeded.
  - Exposed `GET /api/cost/spend-cap` and `POST /api/cost/spend-cap` endpoints.
  - Exposed `POST /api/worktrees/revert/:taskId` endpoint.
- `Desktop-app/src/components/ProjectBoard.tsx`:
  - Added card rollback button (`RotateCcw`) when card has an active worktree, triggering confirmation and `POST /api/worktrees/revert/:taskId`.
- `Desktop-app/src/backend/__tests__/costGuard.test.ts`: Added 3 tests verifying spend cap configuration persistence and daily/project spend cap blocking.

### 7f. Flaky Codex Smoke Test
- `Desktop-app/src/backend/__tests__/cliAgentRunner.test.ts`: Wrapped real binary execution in a bounded timeout (`Promise.race` with 2500ms timeout); if codex hangs on a version manager shim or fails to respond within 2.5s, it logs a warning and cleanly skips instead of failing the test run. Verified 15/15 tests pass.

---

## Deviations from plan
- **Node.js Native Tree-sitter Compatibility**: Verified that `tree-sitter@0.21.1` with `tree-sitter-typescript` and `tree-sitter-javascript` builds and runs cleanly on Node v26.8.2 without requiring fallback regex shims.
- **Claude Code Tool-Use Classification Gate Clarification**: As analyzed in Phase 5 and verified in Phase 6/7, Claude Code's internal tool calls executed autonomously inside its live PTY session are driven by Claude Code's own process. The `classifyCommand`/`onCommandApprovalRequired` gate applies to keystrokes typed by the human operator into Forge's interactive terminal/WebSocket path. Autonomous agent tool commands pass through Forge's tool gate when executed through Forge's orchestrator/`runCommandWithApproval`.

---

## Tests run
1. **Desktop App Test Suite (Run 1 & Run 2)**:
   - `npm test` in `Desktop-app` (Run 1) → **PASS** (62 test files passed, 1 skipped [Ollama e2e when offline], 543 tests passed, 1 expected fail [diff3 intentional conflict], 0 unexpected failures).
   - `npm test` in `Desktop-app` (Run 2) → **PASS** (62 test files passed, 1 skipped, 543 tests passed, 1 expected fail, 0 unexpected failures).
   - `npx vitest run src/backend/__tests__/postExecutionReviewer.test.ts` → **PASS** (4/4 tests passed).
   - `npx vitest run src/backend/__tests__/sentinelRetry.test.ts` → **PASS** (5/5 tests passed).
   - `npx vitest run src/backend/__tests__/semanticIndex.test.ts` → **PASS** (4/4 tests passed).
   - `npx vitest run src/backend/__tests__/worktree.test.ts` → **PASS** (8/8 tests passed).
   - `npx vitest run src/backend/__tests__/costGuard.test.ts` → **PASS** (6/6 tests passed).
   - `npx vitest run src/backend/__tests__/cliAgentRunner.test.ts` → **PASS** (15/15 tests passed).
   - `npm run build` in `Desktop-app` → **PASS** (`tsc -b`, Vite client build, and backend esbuild bundle passed cleanly).
2. **Web Companion Test Suite**:
   - `npm test` in `Web-app` → **PASS** (3 test files passed, 17 tests passed, 0 failures).
3. **Mobile Companion Test Suite**:
   - `npm test && npx tsc --noEmit` in `Mobile-app` → **PASS** (5 test files passed, 46 tests passed, 0 TypeScript errors).
4. **VS Code Extension Build**:
   - `npm run compile` in `Desktop-app/kryleos-forge-vscode` → **PASS** (`tsc -p .` clean).

---

## Known gaps / follow-ups
- **Tree-sitter Language Grammars**: Phase 7c implemented full AST parsing and PageRank for TypeScript and JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`). Extending to Python (`tree-sitter-python`), Rust (`tree-sitter-rust`), or Go (`tree-sitter-go`) can be added as modular grammars in a future update.
- **Dedicated Cost Settings Modal**: Currently spend caps can be queried and set via `GET/POST /api/cost/spend-cap` (or direct config in `.kryleos/config.json`). Adding a dedicated UI settings modal for adjusting spend caps in the Desktop header can be added in a future UI pass.

---

## Verification needed from reviewer
1. **Post-Execution Reviewer (7a)**:
   - Inspect `Desktop-app/src/shared/crewPersonas.ts` to confirm `post_execution_reviewer` persona definition.
   - Run `Desktop-app` (`npm run dev`) and observe the FLOW board:
     - Verify card cards show `review: pass` / `review: fail` status badge.
     - Verify clicking `ShieldCheck` on a card triggers a post-execution review.
     - Verify dragging a card with failed review to Done prompts for confirmation/override.
2. **Sentinel Retry Loop (7b)**:
   - Check `Desktop-app/src/backend/agents.ts`: verify `runFailsafeCompilationCheck` executes up to 3 retry attempts, detects and runs test commands via `sandbox.detectTestCommand()`, feeds errors back to coordinator via `executeCoordinatorTurn()`, and records attempt count and stats in `getSentinelResult()`.
3. **Tree-sitter + PageRank Semantic Index (7c)**:
   - Check `Desktop-app/src/backend/semanticIndex.ts` and `semanticIndex.test.ts`: verify that `tree-sitter` parses TS/TSX/JS/JSX files, extracts imports and call edges, and ranks files via PageRank.
4. **Worktree Merge Safety & Secret Scanner Gate (7d)**:
   - Check `Desktop-app/src/backend/tools.ts`: verify `mergeCardWorktree()` runs `scanSecrets()` on the diff before merging, targets a staging branch (`forge/staging-...`), runs detected tests, and rejects merges with secrets.
   - Verify `detectWorktreeCollisions()` flags overlapping files across active card worktrees.
5. **Durable Rollback & Spend Enforcement (7e)**:
   - Check `Desktop-app/src/backend/tools.ts`: verify `revertCardWorktree()` deletes the worktree and branch.
   - Check `Desktop-app/src/backend/costGuard.ts`: verify `checkSpendCap()` blocks execution when actual spend in `audit.jsonl` exceeds configured caps.
6. **Codex CLI Smoke Test (7f)**:
   - Check `Desktop-app/src/backend/__tests__/cliAgentRunner.test.ts`: verify smoke test bounds execution time and skips gracefully if codex is slow or unresponsive.
