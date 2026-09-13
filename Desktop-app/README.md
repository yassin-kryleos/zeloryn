# Zeloryn — Desktop Cockpit

The desktop application is the central execution cockpit for Zeloryn. It combines an Electron shell, a React 19 / Vite frontend, a local Express backend server, a real pseudoterminal (`node-pty` + xterm.js), and direct integration with terminal AI coding agents (Claude Code CLI).

---

## Architecture Overview

- **Electron Host (`electron/`)**:
  - Main process lifecycle, native window management, secure preload bridges (`contextBridge`).
- **Renderer UI (`src/`)**:
  - Built with React 19, TypeScript, Vite, Tailwind CSS, Lucide icons, and Monaco Editor.
  - Houses the 4 core lifecycle spaces: **PLAN** (`PlanningScreen.tsx`), **CREW** (`CoworkSpace.tsx`), **FLOW** (`ProjectBoard.tsx`), and **FORGE** (`App.tsx` chat/execution workspace).
  - Includes the interactive terminal (`InteractiveTerminal.tsx`) rendering live PTY streams via xterm.js.
- **Local Backend Server (`src/backend/`)**:
  - Express.js HTTP and WebSocket server running locally on port `3001` (by default).
  - Handles project management, workspace file operations, git diffing, model API proxies (Anthropic, OpenAI, Gemini, DeepSeek, Ollama), and pseudoterminal spawning.
  - `claudeCodeRunner.ts` / `cliAgentRunner.ts`: Discovers and invokes local CLI agent binaries with environment sanitization and structured output negotiation.
  - `terminalManager.ts`: Manages persistent `node-pty` shell sessions with command safety interception for interactive terminal keystrokes.
  - Security boundaries: Secured with `LOCAL_SESSION_SECRET`, encrypted secret store (`OS_FINGERPRINT`), and pairing token verification for companion devices. Approval gate intercepts Forge orchestrator tool calls and interactive keystrokes; wrapped external CLIs enforce their own native sandboxes.

---

## Prerequisites

- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher
- **Claude Code CLI** (recommended for agent execution):
  ```bash
  npm install -g @anthropic-ai/claude-code
  ```
- **C/C++ Build Tools** (for compiling `node-pty` native bindings if not prebuilt for your platform):
  - *Windows*: Visual Studio Build Tools (C++ workload) or `windows-build-tools`
  - *macOS*: Xcode Command Line Tools (`xcode-select --install`)
  - *Linux*: `build-essential` and `python3`

---

## Development

```bash
# Install dependencies
npm install

# Start development mode (launches Vite dev server + Express backend + Electron shell)
npm run dev
```

### Specialized Development Commands

- **Backend only**:
  ```bash
  npm run dev:backend
  ```
- **Vite renderer only (browser preview at http://localhost:5173)**:
  ```bash
  npm run dev:renderer
  ```

---

## Configuration

Copy `.env.example` to `.env` in this directory:

```bash
cp .env.example .env
```

Key variables:
- `PORT`: Port for the local Express server (default `3001`).
- `KRYLEOS_BIND_HOST`: Bind address. Defaults to `127.0.0.1` (loopback only). Set to `0.0.0.0` only when pairing companion devices over LAN or via a private tunnel (Tailscale).
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`: API keys for model providers. (Alternatively, enter them directly in the UI via the **CONFIG** header modal).
- `OLLAMA_BASE_URL`: Local Ollama endpoint (default `http://localhost:11434`).
- `LOCAL_SESSION_SECRET`: Ephemeral token generated per boot to isolate local API calls.

---

## Building for Production

```bash
# Full build (compiles backend TypeScript + builds Vite renderer assets)
npm run build

# Standalone backend build
npm run build:backend
```

Build outputs:
- `dist/`: Compiled renderer static assets.
- `dist-backend/`: Compiled backend JavaScript files.

---

## Testing

Zeloryn maintains an extensive Vitest test suite covering API contracts, security boundaries, command classification, and renderer components.

```bash
# Run the full Vitest suite
npm test

# Run tests in watch mode
npm run test:watch
```

---

## License

Part of Zeloryn. Licensed under the Apache License 2.0. See [LICENSE](../LICENSE).
