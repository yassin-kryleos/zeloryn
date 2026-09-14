# Zeloryn

> **The Free, Open-Source, Local-First AI Software Engineering Cockpit.**  
> Kanban-style task execution wrapped around terminal-capable AI coding agents.

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen.svg)]()
[![BYOK](https://img.shields.io/badge/Model-100%25%20BYOK-orange.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)]()
[![Support](https://img.shields.io/badge/Support-Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/yassinkryleos)

---

## What is Zeloryn?

Closed AI IDEs (Cursor, Windsurf) lock you into metered cloud subscriptions and proprietary backend proxies. Single-loop CLI tools (Aider, Claude Code) are powerful inside a single terminal chat, but treat complex software tasks as ephemeral conversations that disappear upon exit.

**Zeloryn** bridges this gap: it is an open-source, local-first engineering cockpit that wraps real terminal-capable coding agents in a structured, dependency-aware project management workflow.

- **100% Free & BYOK (Bring Your Own Key)**: Connect directly to Anthropic, OpenAI, Google Gemini, DeepSeek, or run completely offline with local Ollama models. No monthly subscriptions, no tokens markup, no middleman servers.
- **Task State as Source of Truth**: Instead of fragile chat transcripts, tasks live in structured Kanban cards carrying specifications, acceptance criteria, multi-file diff reviews, and dependency graphs.
- **Genuine Terminal Execution & Safety Gates**: Forge shells out directly to the official `claude` CLI binary inside a genuine PTY (`node-pty` + xterm.js). A destructive command classifier intercepts dangerous shell commands (`rm -rf`, schema drops, system modifications) and holds them for human approval before execution.
- **Local-First & Multi-Surface**: Run the complete cockpit locally on desktop, monitor or review tasks from a companion web dashboard, or plan features offline on mobile with secure peer-to-peer pairing over LAN, Tailscale, or Cloudflare Tunnel.

---

## How Forge Compares

| Feature | Raw Claude Code CLI | Cursor / Windsurf | **Zeloryn** |
| :--- | :--- | :--- | :--- |
| **Business Model** | Usage via Anthropic key | \$20–\$40+/mo subscription | **100% Free & Open-Source (BYOK)** |
| **Privacy & Backend** | Direct API calls to Anthropic | Proprietary cloud backend proxy | **Local-first; zero telemetry/cloud relays** |
| **Task Management** | Ephemeral shell scrollback | Chat history sidebar | **Structured Kanban cards (PLAN → CREW → FLOW → FORGE)** |
| **Process Survival** | Lost on terminal exit/crash | Dependent on IDE session | **Persistent SQLite/JSON state across agent crashes** |
| **Safety & Control** | Raw bash execution | Blackbox agent edits | **Real PTY + human-in-the-loop command approvals** |
| **Multi-Agent Review** | Single agent thread | Single agent thread | **CREW personas & diff review lanes before merge** |
| **Remote Companion** | None | Mobile web (cloud dependent) | **LAN / Tailscale / Tunnel peer-to-peer pairing** |

---

## Core Lifecycle: PLAN → CREW → FLOW → FORGE

Forge guides features from raw idea to merged pull request through four coordinated spaces:

```
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │   1. PLAN    │ ──> │   2. CREW    │ ──> │   3. FLOW    │ ──> │   4. FORGE   │
  │ Specification│     │ Persona      │     │ Dependency-  │     │ Real PTY     │
  │  & Ideation  │     │ Architecture │     │ Aware Kanban │     │ Execution &  │
  │              │     │    Review    │     │    Board     │     │ Human Safety │
  └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

1. **PLAN**: Draft features, user stories, and acceptance criteria. Supports voice/audio input, structured spec generation, and offline ideation on mobile.
2. **CREW**: Run spec reviews through specialized persona lenses (Architect, Security Auditor, UX Designer, QA Lead) to identify risks, edge cases, and missing requirements before touching code.
3. **FLOW**: Coordinate execution on an interactive Kanban board. Tasks track prerequisite card dependencies, worktree branches, and live build status.
4. **FORGE**: Autonomous execution via the real `claude` CLI binary in an embedded PTY. Commands pass through a safety classifier, diffs are reviewed per card, and full audit logs are preserved in `.kryleos/command_approvals.json`.

---

## Architecture & Monorepo Overview

```
Kryleos-Forge/
├── Desktop-app/            # Primary desktop application (Electron + React 19 + Express)
│   ├── src/                # Renderer UI (Vite, Tailwind, Lucide, Monaco, xterm.js)
│   ├── src/backend/        # Local Express server (PTY manager, agent runner, audit logs)
│   └── electron/           # Electron main process & IPC window bridges
├── Web-app/                # Lightweight browser companion dashboard
│   └── src/                # React 19 + Vite dashboard connecting to Desktop backend
├── Mobile-app/             # Expo / React Native mobile companion
│   ├── App.tsx             # Offline-first PLAN space & remote card monitoring
│   └── src/                # QR / token pairing, local cache & redaction utilities
├── docs/                   # Full system architecture, API contracts, and guides
└── LICENSE                 # Open-source license (Apache-2.0)
```

---

## Installation

Choose the one-line install command for your operating system:

### macOS & Linux (Terminal Installer)
```bash
curl -fsSL https://raw.githubusercontent.com/yassin-kryleos/zeloryn/main/install.sh | bash
```

### macOS via Homebrew
```bash
brew tap yassin-kryleos/zeloryn https://github.com/yassin-kryleos/homebrew-zeloryn
brew install --cask zeloryn
```

### Windows via Winget
```powershell
winget install Zeloryn
```

*Or via PowerShell one-liner:*
```powershell
irm https://raw.githubusercontent.com/yassin-kryleos/zeloryn/main/install.ps1 | iex
```

Direct binary downloads (`.dmg`, `.AppImage`, `.deb`, `.exe`) are always available on our [GitHub Releases](https://github.com/yassin-kryleos/zeloryn/releases) page.

---

## Update-Check Policy

Zeloryn follows a **conservative, privacy-first default**:
- **Zero Silent Phone-Home**: Forge will **never** silently connect to external servers or GitHub to check for updates on startup without explicit user consent.
- **Manual Checking**: You can check for updates manually at any time via the in-app menu or by running `winget upgrade Zeloryn` / re-running `install.sh`.
- **Opt-In Background Check**: If you want Forge to check GitHub Releases for updates when launched, set `KRYLEOS_CHECK_UPDATES=1` in your environment or `.env` file. Even when enabled, Forge never automatically downloads or executes binaries without confirmation.

---

## Quickstart: Running from Source

If you want to contribute or build Forge from source:

### Prerequisites

- **Node.js**: `v20.0.0` or later
- **npm**: `v10.0.0` or later
- **Git**: Installed and configured
- **Claude Code CLI** (optional, for agent execution):
  ```bash
  npm install -g @anthropic-ai/claude-code
  ```

### 1. Clone & Configure

```bash
git clone https://github.com/yassin-kryleos/zeloryn.git
cd zeloryn

# Copy environment configuration
cp .env.example .env
cp Desktop-app/.env.example Desktop-app/.env
```

### 2. Launch Desktop Cockpit

```bash
cd Desktop-app
npm install
npm run dev
```

This starts:
- The Vite frontend dev server at `http://localhost:5173` (or `5174`)
- The local Express backend on port `3001`
- The Electron desktop shell

### 3. Configure Your Keys (BYOK)

Click the **CONFIG** button in the top navigation bar to enter your provider keys:
- **Anthropic API Key** (`sk-ant-...`)
- **OpenAI API Key** (`sk-...`)
- **Google Gemini API Key** (`AIzaSy...`)
- **DeepSeek API Key**
- **Ollama**: Simply start Ollama (`ollama serve`) and Forge auto-detects local models at `http://localhost:11434`.

Keys are encrypted locally on disk using per-install AES keys (`OS_FINGERPRINT`) and are never transmitted to any external server.

---

## Companion Devices & Remote Pairing

Forge supports pairing mobile devices and web browsers to your desktop instance **without any hosted relay or cloud server**.

### Option A: Local Network (LAN)
1. In Desktop Forge, click **Companion Pairing** in the top bar to view your active 6-digit code and pairing secret.
2. On your mobile device (`Mobile-app`) or laptop browser (`Web-app`), set the backend URL to `http://<your-desktop-lan-ip>:3001` and enter the pairing code.
3. Once authenticated with `COMPANION_AUTH_TOKEN`, the companion can monitor tasks, review diffs, approve sandboxed commands, and sync planning specs.

### Option B: Zero-Cost Secure Remote Access (Tailscale / Cloudflare Tunnel)
To ideate while traveling, monitor agent execution, or remotely approve sandbox actions without paying for a hosted cloud relay:
1. **Tailscale Mesh VPN (Recommended)**:
   - Install [Tailscale](https://tailscale.com) on both your home desktop and mobile device.
   - On Desktop Forge, the backend listens on port `3001`.
   - On the mobile companion, configure the backend URL to your desktop's private Tailscale IP (e.g. `http://100.x.y.z:3001`) and enter the pairing code. Traffic is end-to-end encrypted over WireGuard directly between your devices with zero egress or cloud hosting cost.
2. **Cloudflare Tunnel (Zero-Trust)**:
   - Run `cloudflared tunnel --url http://localhost:3001` on your desktop or bind it to your domain (e.g. `https://forge.yourdomain.com`).
   - Enter your tunnel URL into the mobile companion backend setting.
   - Pair using the existing 6-digit pairing code and cryptographic device handshake.

### Offline-First Mobile Ideation
When traveling or without an internet connection:
- You can draft feature requirements and architectural specifications directly in the **Plan** tab of the mobile companion.
- All notes and specs are cached in the local **Offline Ideation Queue**.
- As soon as your device reconnects to your desktop (via LAN, Tailscale, or tunnel), queued specs are automatically synchronized to `implementation_plan.md` on your home desktop.

---

## Development & Testing

Run the test suites across each application surface:

```bash
# Desktop app test suite & build check
cd Desktop-app
npm test
npm run build

# Web companion test suite & build check
cd ../Web-app
npm test
npm run build

# Mobile companion test suite & type check
cd ../Mobile-app
npm test
npx tsc --noEmit
```

---

## Security Model

Zeloryn executes code and commands on your machine. Several layers of defense are active by default:

1. **Process Isolation (`LOCAL_SESSION_SECRET`)**: The local Express server generates an ephemeral session secret to prevent untrusted local software or rogue browser tabs from issuing arbitrary command requests.
2. **Command Safety Classifier**: Shell commands generated by agents are classified before invocation. Destructive actions (`rm -rf`, file drops, disk operations) pause execution and require explicit one-click UI confirmation.
### Security & Approval Gate Trust Boundary

Forge provides transparent, explicit safety controls with a clearly defined trust boundary:
- **Forge Internal Orchestrator (`agents.ts`)**: When Forge's built-in multi-agent coordinator executes autonomous tool calls, all actions pass through `classifyCommand`. Destructive operations (`rm -rf`, database schema drops, system modifications) pause execution and require explicit human or paired companion authorization before running.
- **Interactive Terminal Input (`terminalManager.ts`)**: When a human operator types commands into Forge's interactive terminal, keystrokes are evaluated at newline boundaries to intercept destructive commands.
- **Wrapped External CLIs (Claude Code, Codex CLI)**: When executing tasks via Tier 1 external CLI runners inside a live PTY, the tool runs as an independent external process under your own BYOK credentials. It is governed by its own native permission model and sandboxing (e.g. Claude Code's `.claude/settings.json` rules and Codex's bubblewrap/seatbelt sandbox). Forge supervises the session, streams live output, and records lifecycle audit trails, but **does not intercept an external CLI's private internal tool calls**.

---

## Roadmap

- [x] **Phase 1: Strip Payment & Login Gating**: Complete removal of Stripe, Razorpay, fake cloud sync, and license tiers. All features unlocked under BYOK.
- [x] **Phase 2: Open-Source Packaging**: Public documentation, LICENSE recommendation, sanitized repository, and community templates.
- [x] **Phase 3: Cross-Platform Installers**: Terminal one-liners (`curl | sh`, `winget`), GitHub Releases packaging, and Homebrew tap.
- [x] **Phase 4: Generalized Agent Execution**: Pluggable `CliAgentRunner` interface (support for Claude Code, Codex CLI, Gemini CLI, Aider) + full MCP client and Tool API Gateway integration.
- [x] **Phase 5: Workflow Polish**: Enhanced Preview Deck (tabbed multi-PTY sessions, live responsive preview pane), dependency-aware automatic task scheduling, git worktree isolation per card, compliance audit export, and zero-cost remote mobile companion with offline-first ideation.
- [x] **Phase 6: Multi-Engine Execution & External Handoff**: Pluggable in-app execution for BYOK CLI agents (Claude Code, Codex CLI) with live PTY streaming + structured external handoff (Cursor, Antigravity, VS Code, Windsurf, Clipboard).
- [x] **Phase 7: Retrieval, Verification Loops & Merge Safety**: Post-execution CREW reviewer, 3-attempt Sentinel check retry loop with test runner integration, Tree-sitter + PageRank semantic index, worktree staging-branch merge with secret scanning, durable card rollback, and spend enforcement.
- [x] **Phase 8: Close the Raw-CLI Approval-Gate Gap (Research & Boundary Specification)**: Comprehensive evaluation of MCP routing, PTY interactive mode, and OS-level syscall interception. Documented the explicit architectural trust boundary (full research writeup preserved on the `internal-docs` branch).

---

## Contributing

We welcome contributions of all kinds! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on code standards, local development, and the PR submission process.

---

## Supporting Zeloryn

Zeloryn is 100% free, open-source, and local-first with no subscriptions. If Zeloryn saves you engineering hours, consider supporting ongoing development:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/yassinkryleos)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?style=for-the-badge&logo=github-sponsors&logoColor=white)](https://github.com/sponsors/yassin-kryleos)

---

## License

Zeloryn is distributed under the **Apache License 2.0**. See [LICENSE](LICENSE) for details.
