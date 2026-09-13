# Exit Report — Phase 5: Polish the PM-workflow story

## Changes made
- `Desktop-app/src/components/InteractiveTerminal.tsx`: Implemented a multi-PTY tab manager supporting dynamic session creation (`+ NEW SESSION`), tab switching, per-tab session termination, and independent session scroll buffers.
- `Desktop-app/src/components/PreviewDeck.tsx`: Upgraded the Preview Deck with responsive viewport toggles (Desktop full width, Tablet 768px, Mobile 375px), dev-server port presets (5173, 3000, 8080), auto-refresh toggle, manual reload trigger, and one-click Compliance Audit Trail export buttons in Artifacts and Review tabs.
- `Desktop-app/src/shared/dependencies.ts`: Added dependency-aware scheduling helper functions (`isTaskUnblocked`, `findUnblockedTasks`, `getNextSchedulableTask`) that verify whether all prerequisite cards in a task's `blockedBy` array are marked as `done`/`completed`.
- `Desktop-app/src/shared/dependencies.scheduling.test.ts`: [NEW] Added 7 unit tests verifying DAG scheduling, cycle prevention, multi-dependency auto-unblocking, and next schedulable task selection.
- `Desktop-app/src/backend/planningV2.ts`: Updated `classify()` logic to evaluate unresolved blockers (`unresolvedBlockers(allTasks, task.id).length > 0`) so cards automatically transition from blocked to unblocked/todo when dependencies complete.
- `Desktop-app/src/backend/tools.ts`: Implemented Git worktree isolation per card (`createCardWorktree`, `listCardWorktrees`, `removeCardWorktree`, `mergeCardWorktree`) inside `WorkspaceSandbox`, enabling parallel, sandboxed branches without cross-task file contention.
- `Desktop-app/src/backend/__tests__/worktree.test.ts`: [NEW] Added 5 unit tests verifying git worktree creation, validation, listing, merging, and pruning.
- `Desktop-app/src/backend/auditTrail.ts`: [NEW] Implemented `AuditTrailService` exporting compliance-ready audit trails (`AUDIT_REPORT.md` with auditor sign-off section, `audit_trail_export.json` with SHA-256 integrity hash, and `audit_events.csv`) aggregating command approvals, tool invocations, cost history, and security posture.
- `Desktop-app/src/backend/__tests__/auditTrail.test.ts`: [NEW] Added 4 unit tests verifying audit report generation, CSV structuring, and cryptographic SHA-256 payload verification.
- `Desktop-app/src/backend/server.ts`: Exposed REST endpoints for worktree management (`GET /api/worktrees`, `POST /api/worktrees/card/:taskId`, `POST /api/worktrees/merge/:taskId`, `DELETE /api/worktrees/:taskId`) and compliance audit reporting (`GET /api/audit/report`, `POST /api/audit/export`).
- `Desktop-app/src/components/ProjectBoard.tsx`: Added UI integration for dependency-aware task scheduling ("unblocked" badge, auto-unblock notification when prerequisite cards complete, and "Next Ready" toolbar button) and Git worktree isolation (badge, "Create Worktree" action, and "Merge Worktree" action per card).
- `Desktop-app/src/components/ConfigHeader.tsx`: Added network connection address guidance (Local LAN IP, Tailscale mesh VPN IP `100.x.y.z:3001`, and Cloudflare Tunnel domain) inside the Companion Pairing modal.
- `Mobile-app/App.tsx`: Upgraded `getWsUrl()` to support HTTPS/WSS tunnels cleanly, enhanced `handleSendPlan` with offline-first local caching and auto-sync, added an **Offline Ideation Queue** card with manual and automatic sync to desktop, and updated backend URL guidance.
- `README.md`: Documented remote mobile companion access via Tailscale and Cloudflare Tunnel (zero-cost, no hosted server/relay required), detailed offline-first mobile ideation sync, and updated the project Roadmap marking Phase 4 and Phase 5 as completed.

---

## Deviations from plan
- None. All deliverables specified under Phase 5 of `docs/open-sorce-startegy.md` were implemented cleanly without altering existing security mechanisms (`LOCAL_SESSION_SECRET`, companion pairing tokens, `OS_FINGERPRINT`).

---

## Tests run
1. **Desktop App Test Suite**:
   - `npm test` in `Desktop-app` → **PASS** (58 test files passed, 1 skipped [Ollama e2e when offline], 515 tests passed, 0 failures).
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

### 1. Claude Code Internal Tool Approval Trace (Phase 4 Review Question)
- **Investigation Finding**: When Claude Code CLI runs inside a `node-pty` session (`createAgentSession` / `runPty` in `terminalManager.ts`), its internal tool invocations (such as writing files or spawning sub-shells) are executed internally by Claude Code's node process.
- **Approval Gate Behavior**: They do **NOT** pass through `terminalManager.writeInput` or the `classifyCommand` / `onCommand` approval gate. The destructive-command approval gate in `terminalManager.ts` only intercepts inputs written into the PTY stdin (i.e. human-typed keystrokes sent via xterm.js or explicit WebSocket `terminal_input` packets).
- **Gap & Rationale**: Because Claude Code is an autonomous external CLI binary running inside a pseudoterminal, intercepting its internal system calls from the outside would require ptrace/eBPF sandboxing or running Claude Code with explicit confirmation flags (`--dangerously-skip-permissions` vs interactive prompt mode). In interactive mode, Claude Code asks for its own approvals in terminal stdout, which xterm.js displays to the user.
- **Recommendation**: For full unified policy enforcement across all tools, agents should interface via the Tool API Gateway and MCP Client introduced in Phase 4 rather than raw PTY shells.

### 2. Live Ollama Environment Status (`HANDOFF.md` §7)
- **Verification Result**: Ollama is not installed or running as a local daemon in this Linux test environment (`which ollama` returned not found; port 11434 unreachable).
- **Extension Compilation & Smoke Test**: The VS Code extension compiles cleanly (`tsc -p .`), passes static checks, and executes deterministic smoke commands. Real end-to-end LLM inference via Ollama requires the user or runner to have an active `ollama serve` instance running locally.

---

## Verification needed from reviewer
1. **Preview Deck**:
   - Open Desktop Forge (`npm run dev` in `Desktop-app`).
   - Navigate to the **Terminal** tab: confirm that clicking the `+` button creates multiple PTY sessions, that tabs can be switched and closed independently.
   - Navigate to the **Preview Deck**: confirm that clicking `Desktop`, `Tablet`, and `Mobile` resizes the iframe viewport, that the port selector triggers reload, and that the Compliance Audit export buttons download valid reports.
2. **Dependency-Aware Scheduling & Worktrees**:
   - On the Kanban **Project Board**, create a task blocked by another card. Complete the blocker and verify the dependent card displays the "UNBLOCKED" badge and can be triggered via "Next Ready".
   - Test "Create Worktree" on a card: verify that git creates `.worktrees/card-<id>` and isolates changes on branch `forge/card-<id>`.
3. **Mobile Companion**:
   - Disconnect the network toggle or set backend to an unreachable address: type a plan specification in the Plan tab and verify it enters the **Offline Ideation Queue**.
   - Reconnect to the desktop backend: verify the offline queue automatically synchronizes to the desktop `implementation_plan.md`.
   - Verify connection settings accept LAN IP, Tailscale IP (`100.x.y.z:3001`), and HTTPS Cloudflare Tunnel URLs.
