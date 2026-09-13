# Exit Report — Phase 8: Close the raw-CLI approval-gate gap (research)

## Changes made
- `docs/phase8-approval-gate-recommendation.md`: **[NEW]** Comprehensive research and recommendation document analyzing the three candidate architectural approaches for closing the raw-CLI approval-gate gap:
  - Researched MCP client behavior in Claude Code CLI and Codex CLI: confirmed both act as MCP clients to connect external data sources/tools, but neither routes its internal core execution primitives (`Bash`, file edits) through MCP. Disabling built-in tools breaks agent loops and error recovery.
  - Researched interactive (non-`--print`) PTY behavior: verified that interactive mode launches terminal TUIs (React/Ink in Claude Code, curses in Codex) requiring keyboard navigation; this fundamentally disrupts Forge's card-based asynchronous execution model ("Run Task Agent"), blocking tasks indefinitely unless a human manually monitors each terminal session.
  - Researched cross-platform OS-level syscall interception (Linux `ptrace`/`eBPF`, macOS `EndpointSecurity`/SIP, Windows Detours/driver): confirmed it is disproportionately complex, highly fragile, triggers antivirus alarms, and fails on macOS without an Apple Developer Entitlement.
  - Formulated formal recommendation: **Document the architectural boundary clearly and stop here**.
- `README.md`: Added an explicit **"Security & Approval Gate Trust Boundary"** section stating the architectural boundary: Forge's approval gate covers its internal multi-agent orchestrator (`agents.ts`) and interactive human terminal input (`terminalManager.ts`); external wrapped CLIs (Claude Code, Codex CLI) operate as sovereign, sandboxed processes under their own native permission systems. Also updated the Roadmap marking Phase 7 and Phase 8.
- `Desktop-app/README.md`: Clarified the security boundary description in the desktop architecture overview.

---

## Deviations from plan
- None. In accordance with Phase 8's instructions, this phase was conducted strictly as a research and decision phase. No speculative or invasive interception code was implemented.

---

## Tests run
1. **Desktop App Test Suite**:
   - `npm test` in `Desktop-app` → **PASS** (62 test files passed, 1 skipped [Ollama e2e when offline], 543 tests passed, 1 expected fail [diff3 conflict], 0 unexpected failures).
   - `npm run build` in `Desktop-app` → **PASS** (`tsc -b`, Vite client build, and backend esbuild bundle passed cleanly).
2. **Security Features Verification**:
   - Verified that `LOCAL_SESSION_SECRET`, companion pairing (`COMPANION_AUTH_TOKEN`, `/api/companion/pairing-code`), and `OS_FINGERPRINT` are 100% preserved.

---

## Known gaps / follow-ups
- **Recommendation Summary**: The recommended architectural decision is to **accept and document the boundary**. The approval gate strictly intercepts Forge's internal orchestrator tool calls (`runCommandWithApproval`) and human-typed terminal keystrokes, while wrapped external CLIs rely on their own native permission models and sandboxes.
- **Phase 8b Status**: A Phase 8b implementation is **NOT recommended**. If external CLI gating is ever deemed mandatory in the future, Claude Code specifically provides a native `--permission-handler <path>` IPC hook that could be explored, though Codex CLI lacks an equivalent mechanism.

---

## Verification needed from reviewer
- Review the recommendation document: [`docs/phase8-approval-gate-recommendation.md`](docs/phase8-approval-gate-recommendation.md).
- Confirm the research findings:
  1. **MCP Support**: Neither Claude Code nor Codex CLI routes its built-in `Bash` or file modification tools through MCP.
  2. **Interactive Mode UX**: Running external CLIs in interactive PTY mode causes prompts to block unattended Kanban card runs.
  3. **OS-Level Interception**: `ptrace` (Linux), `EndpointSecurity` (macOS), and Detours/drivers (Windows) are disproportionate and unmaintainable for a cross-platform Electron app.
  4. **Documented Trust Boundary**: Review the updated security notes in [`README.md`](README.md) and [`Desktop-app/README.md`](Desktop-app/README.md) to confirm they provide an honest, transparent explanation of Forge's security model.
