# Contributing to Zeloryn

Thank you for your interest in contributing to Zeloryn! Forge is a **free, open-source, local-first AI software engineering cockpit** designed to turn terminal-capable coding agents into a structured, dependency-aware engineering workflow.

---

## Core Principles & Philosophy

When contributing to Zeloryn, please keep our design principles in mind:

1. **Free & BYOK (Bring Your Own Key) Forever**:
   - No payment processing, no subscription tiers, no paywalled features, and no central login requirements.
   - All AI integrations use direct developer API keys (Anthropic, OpenAI, Gemini, DeepSeek) or 100% local models (Ollama).
   - Zero telemetry, analytics, or phone-home network calls by default.

2. **Preserve Essential Security Boundaries**:
   - **`LOCAL_SESSION_SECRET`**: Protects the local Express API and WebSocket server against unauthorized local processes or browser tabs.
   - **Companion Pairing Authentication**: Mobile/web companion pairing (`COMPANION_AUTH_TOKEN`, `/api/companion/pairing-code`, `companionHub`) protects command execution from untrusted network clients.
   - **`OS_FINGERPRINT`**: Used as a per-install cryptographic seed for encrypting local secrets on disk.
   - **Destructive Command Classifier & Audit**: Commands executed by agents are classified and held for explicit user approval before reaching the shell. Audit logs in `.kryleos/command_approvals.json` must be preserved.

3. **Task State as Source of Truth**:
   - Work is organized through structured Kanban cards (PLAN → CREW → FLOW → FORGE).
   - Card state, acceptance criteria, dependencies, and diff reviews persist across agent restarts and model swaps.

---

## Monorepo Structure

- **`Desktop-app/`**: The primary desktop application. Built with Electron, React 19, Vite, a local Express backend, `node-pty` terminal integration, and `claudeCodeRunner`.
- **`Web-app/`**: Lightweight browser companion dashboard connecting to the local desktop backend or private tunnel.
- **`Mobile-app/`**: Expo / React Native companion app for offline ideation and remote monitoring.
- **`docs/`**: Architecture, specifications, and design documents.

---

## Developer Setup

### Prerequisites

- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher
- **Git**: Recent version
- **Claude Code CLI** (optional for agent execution): `npm install -g @anthropic-ai/claude-code`

### Getting Started

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yassin-kryleos/zeloryn.git
   cd zeloryn
   ```

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Or configure Desktop-app/.env
   cp Desktop-app/.env.example Desktop-app/.env
   ```

3. **Run Desktop App**:
   ```bash
   cd Desktop-app
   npm install
   npm run dev
   ```

4. **Run Web Companion**:
   ```bash
   cd Web-app
   npm install
   npm run dev
   ```

5. **Run Mobile Companion**:
   ```bash
   cd Mobile-app
   npm install
   npx expo start
   ```

---

## Testing & Quality Gates

Before opening a pull request, ensure all tests pass:

### Desktop App
```bash
cd Desktop-app
npm test            # Runs Vitest unit & integration test suite
npm run build       # Validates TypeScript & Vite + backend build
```

### Web App
```bash
cd Web-app
npm test            # Runs Vitest functional tests
npm run build       # Validates TypeScript compilation & Vite build
```

### Mobile App
```bash
cd Mobile-app
npm test            # Runs mobile unit tests
npx tsc --noEmit    # Validates TypeScript types
```

---

## Pull Request Guidelines

1. **Branching**:
   - Create a feature branch off `main`:
     - `feat/description` for new features
     - `fix/description` for bug fixes
     - `docs/description` for documentation
2. **Commit Messages**:
   - Follow Conventional Commits:
     - `feat: add codex cli runner adapter`
     - `fix: handle pty resize on window change`
     - `docs: update tailscale pairing instructions`
     - `test: add integration test for command classifier`
3. **No Secrets or Personal State**:
   - Never commit `.env`, private keys (`.key`, `.pem`), or machine-specific file paths.
   - Verify `git status` shows clean working trees before committing.
4. **Fill out the PR Template**:
   - Use our provided PR template to summarize changes, reference relevant issues, and complete the safety checklist.

---

## Reporting Issues & Security Vulnerabilities

- **Bug Reports & Feature Proposals**: Please use our [GitHub Issue Templates](.github/ISSUE_TEMPLATE/).
- **Security Vulnerabilities**: If you discover a security vulnerability (especially regarding local process isolation or command injection), please report it responsibly by contacting the maintainers directly via email (`yassin.muhammed@gmail.com`) rather than filing a public issue.

---

## Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for everyone, regardless of experience level, background, or personal characteristics. Please be respectful and constructive in all interactions.
