# Phase 8 Recommendation: Raw-CLI Approval Gate Boundary

## 1. Executive Summary & Recommendation

**Recommendation: Document the architectural boundary clearly and stop here.**

After investigating the runtime behaviors, official documentation, and technical constraints of Claude Code CLI, OpenAI Codex CLI, and cross-platform process isolation across Linux, macOS, and Windows, our conclusion is that **attempting to intercept third-party CLI internal tool calls from outside those binaries is technically unsound, breaks core execution flows, and fails cross-platform viability**.

Instead, Forge should maintain an honest, well-defined trust boundary:
1. **Forge Native Orchestrator (`agents.ts`)**: Full approval gate interception (`runCommandWithApproval`, `classifyCommand`, destructive action confirmation, remote companion authorization, and audit logging to `command_approvals.json`).
2. **Interactive Terminal Input (`terminalManager.ts`)**: Full keystroke-level classification for human input typed into the PTY.
3. **Wrapped Tier 1 External CLIs (`ClaudeCodeRunner`, `CodexCliRunner`)**: Supervised external runtimes running under the user's BYOK credentials. They operate under their own internal permission models and sandboxes (Claude Code's `settings.json` rules; Codex CLI's bubblewrap/seatbelt sandboxing). Forge streams their stdout/stderr, logs session lifecycles, and captures traces, but **does not intercept their private internal tool calls**.

---

## 2. Research Findings

### Candidate 1: Route Tool Calls Through Tool API Gateway / MCP
- **Claude Code CLI**: Claude Code is an MCP *client* (`claude mcp`, `--mcp-config`), but MCP is designed strictly for attaching external tools (e.g. database connectors, issue trackers, web APIs). Claude Code's internal execution primitives (`Bash`, `Edit`, `Read`, `Write`, `Glob`, `Grep`) are compiled native built-ins. Disabling `Bash` via `--disallowedTools Bash` breaks Claude Code's internal reasoning, error recovery, and subagent coordination because the underlying prompts expect Claude's standard `Bash` tool response schemas.
- **Codex CLI**: Codex CLI similarly supports external MCP servers (`codex mcp`), but its command execution engine (`codex exec`) is hard-coded in native Rust with integrated sandboxing policies (`--sandbox read-only | workspace-write | danger-full-access`). Codex provides no mechanism to redirect its shell executions into an external MCP gateway.
- **Conclusion**: Neither CLI can route its core command execution through an MCP tool gateway without crippling the tool.

### Candidate 2: Interactive PTY Confirmation Prompts
- **Runtime Behavior**: In interactive mode (without `-p/--print` for Claude, or non-`exec` for Codex), both CLIs present interactive terminal TUIs (React/Ink or curses-based) prompting the user (`Allow Bash to run <cmd>? [y/n]`).
- **UX Impact**: While Forge's `terminalManager` and xterm.js plumbing could pass these prompts to a focused user, **it breaks the core execution model of Forge's FLOW board**:
  - Tasks triggered from Kanban cards ("Run Task Agent") are intended to run asynchronously and unattended, followed by Sentinel checks and post-execution review.
  - Interactive prompts cause the CLI to block indefinitely on stdin if the user is not actively watching that specific terminal tab.
  - It breaks unattended runs, background workflows, and remote companion triggers from mobile devices.
- **Conclusion**: Interactive mode degrades an autonomous card agent into a manual terminal wrapper, defeating one-shot task execution.

### Candidate 3: OS-Level Syscall Interception (ptrace / eBPF / API Hooks)
- **Linux**: `ptrace(2)` introduces severe performance degradation (stopping on every syscall entry/exit), and fails under containerized environments (Docker/Flatpak default seccomp profiles block ptrace). `eBPF` requires root privileges (`CAP_BPF` / `CAP_SYS_ADMIN`), which an unprivileged desktop Electron app cannot demand.
- **macOS**: `ptrace(2)` on Darwin does not support syscall inspection or argument interception. Intercepting process launches requires Apple's `EndpointSecurity.framework`, which mandates root privilege, a System Extension, and an Apple Developer Entitlement signed by Apple. Dynamic library interposing (`DYLD_INSERT_LIBRARIES`) is neutralized by System Integrity Protection (SIP) on hardened binaries.
- **Windows**: Windows lacks ptrace; interception requires either a signed kernel driver (`PsSetCreateProcessNotifyRoutineEx`) or user-mode API hooking (Detours / MinHook), which triggers anti-virus/EDR heuristic alarms and fails on POSIX/WSL subprocesses.
- **Conclusion**: Candidate 3 is disproportionate, fragile, platform-fragmented, and introduces significant security and stability attack surface.

---

## 3. Potential Future Exploration (Phase 8b — Low Priority)
If external CLI-level tool gating is ever deemed mandatory in the future, Claude Code specifically provides an officially supported hook:
- `--permission-handler <path>`: Claude Code can delegate permission decisions to an external executable/script passing the candidate tool call and receiving an approval/denial decision over stdio.
- Forge could theoretically supply a helper script pointing back to Forge's local IPC server.
- **However**, Codex CLI possesses no equivalent hook, creating an asymmetric implementation. Given both CLIs already enforce their own native sandboxes, this adds complexity for marginal security gain.

---

## 4. Documented Architectural Trust Boundary
The recommended action is to formally document this boundary in the project documentation and root `README.md`:
> **Security Trust Boundary:**
> - **Forge Orchestrator (`agents.ts`)**: All agent tool actions (file writes, shell commands) are strictly intercepted by Forge's approval gate (`classifyCommand`), requiring human or paired companion authorization for destructive operations before execution.
> - **Human Terminal Input (`terminalManager.ts`)**: All interactive keystrokes typed by users into terminal sessions are classified at line boundaries.
> - **External BYOK CLIs (`ClaudeCodeRunner`, `CodexCliRunner`)**: External tools operate as sovereign, sandboxed processes under their own native permission systems. Forge streams output, provides PTY connectivity, and logs session audit trails, but does not intercept their private internal tool invocations.
