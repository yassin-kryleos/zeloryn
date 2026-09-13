## Exit Report — Phase 10: Fix orphaned-process leak in the Codex smoke test

### Changes made
- `Desktop-app/src/backend/cliAgentRunner.ts`:
  - Added and exported `killProcessTree(childOrPid, signal)` to recursively collect descendant PIDs (via `pgrep -P` on POSIX, `taskkill /F /T` on Windows) and kill descendants, process group (`-pid`), and direct process with `SIGKILL`.
  - Extended `execFileSimple` with `ExecFileSimpleOptions` (`timeout`, `signal: AbortSignal`, `onSpawn: (child: ChildProcess) => void`, `cwd`, `env`), spawning child processes with `detached: process.platform !== 'win32'` so subprocesses form their own process group, and attaching abort and timeout handlers that guarantee process tree termination via `killProcessTree`.
  - Added `CliAgentProbeOptions` (`timeoutMs`, `signal`, `onSpawn`) and updated `CliAgentRunner.probeCapabilities`, `ClaudeCodeRunner.probeCapabilities`, and `CodexCliRunner.probeCapabilities` to thread cancellation signals, custom timeouts, and `onSpawn` callbacks through to `execFileSimple`.
  - Updated `probeClaudeCapabilities` backward compatibility export to accept `CliAgentProbeOptions`.
- `Desktop-app/src/backend/__tests__/cliAgentRunner.test.ts`:
  - Updated "real binary smoke test: probes capabilities if codex is installed" to initialize an `AbortController`, capture `spawnedChild` via `onSpawn`, pass `timeoutMs: 2500` and `signal: abortController.signal` to `runner.probeCapabilities`, and explicitly call `abortController.abort()` and `killProcessTree(spawnedChild)` when the race timeout fires or inside the `finally` block if capabilities could not be probed.
  - Added unit test suite `killProcessTree & execFileSimple process lifecycle` covering: handling null/undefined/invalid PIDs gracefully without throwing, terminating subprocesses and descendants on `signal` abort, and terminating subprocesses on timeout.

### Deviations from plan
- None. Implemented exactly as specified in §4 Phase 10 of `docs/open-sorce-startegy.md`.

### Tests run
- `Desktop-app`: `npx vitest run src/backend/__tests__/cliAgentRunner.test.ts` (Run 1) → PASS (18/18 tests passed in 824ms)
  - Process check: `ps aux | grep -E "codex|mise x" | grep -v grep` → 0 orphaned processes.
- `Desktop-app`: `npx vitest run src/backend/__tests__/cliAgentRunner.test.ts` (Run 2) → PASS (18/18 tests passed in 875ms)
  - Process check: `ps aux | grep -E "codex|mise x" | grep -v grep` → 0 orphaned processes.
- `Desktop-app`: `npx vitest run src/backend/__tests__/cliAgentRunner.test.ts` (Run 3) → PASS (18/18 tests passed in 750ms)
  - Process check: `ps aux | grep -E "codex|mise x" | grep -v grep` → 0 orphaned processes.
- `Desktop-app`: `npm test` → PASS (65 test files passed, 1 skipped, 557 tests passed, 1 expected fail, 1 skipped in 6.03s)
- `Desktop-app`: `npm run build` → PASS (`tsc -b`, Vite client build, and esbuild backend bundle all succeeded with 0 errors)

### Known gaps / follow-ups
- None. All 10 phases of the open source strategy (`docs/open-sorce-startegy.md`) are now complete and verified.

### Verification needed from reviewer
1. **Zero Orphaned Processes**:
   - Run `npx vitest run src/backend/__tests__/cliAgentRunner.test.ts` in `Desktop-app`.
   - Run `ps aux | grep -E "codex|mise x" | grep -v grep` immediately afterward and confirm that 0 orphaned processes remain on the host.
2. **Process Tree Termination**:
   - Inspect `killProcessTree` in `Desktop-app/src/backend/cliAgentRunner.ts` to verify that descendant PIDs are gathered recursively (`pgrep -P`) and terminated alongside the process group leader (`-pid`) and direct PID.
   - Inspect `execFileSimple` to confirm that `detached: true` is set on POSIX and abort/timeout handlers invoke `killProcessTree(childProcess)`.
3. **Smoke Test Safety**:
   - Inspect `Desktop-app/src/backend/__tests__/cliAgentRunner.test.ts` to verify that the Codex real binary smoke test attaches `AbortController` and `onSpawn`, aborting and tree-killing on timeout or in `finally` if `caps` is null.
4. **Security Boundary**:
   - Confirm that `LOCAL_SESSION_SECRET`, companion pairing (`COMPANION_AUTH_TOKEN`, `/api/companion/pairing-code`), and `OS_FINGERPRINT` remain completely untouched.
