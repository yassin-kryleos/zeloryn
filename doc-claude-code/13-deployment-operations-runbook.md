# Deployment and Operations Runbook

## Development Environments

Desktop:

```powershell
cd Desktop-app
npm ci
npm run dev
```

Web:

```powershell
cd Web-app
npm ci
npm run dev
```

Mobile:

```powershell
cd Mobile-app
npm ci
npm run web
```

Repository verification:

```powershell
node scripts/verify-all.mjs
```

## Required Environment Variables

Desktop backend:

```text
KRYLEOS_LOCAL_SESSION_SECRET=<32+ chars>
KRYLEOS_DATA_DIR=<optional data dir>
KRYLEOS_DB_PATH=<optional db path>
KRYLEOS_COMPANION_PORT=3002
KRYLEOS_COMPANION_BIND_HOST=127.0.0.1
KRYLEOS_MCP_DEFAULT_ENABLED=false
KRYLEOS_TOOL_AUDIT_ENABLED=true
KRYLEOS_NETWORK_TOOLS_DEFAULT_POLICY=approval_required
KRYLEOS_SWARM_MAX_WORKERS=3
KRYLEOS_LEARNING_MODE=suggest_only
```

Billing:

```text
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

Provider defaults are configured by user settings, not required env vars for BYOK.

## Local Ports

- Desktop backend: `127.0.0.1:3001`.
- Vite desktop dev server: commonly `localhost:5173`.
- Web companion dev server: commonly `localhost:5174`.
- Companion WebSocket: `127.0.0.1:3002`.
- Ollama: commonly `localhost:11434`.

## Build Commands

Desktop:

```powershell
cd Desktop-app
npm run build
```

Web:

```powershell
cd Web-app
npm run build
```

Mobile web:

```powershell
cd Mobile-app
npm run web
```

## Packaging

Desktop packaging should use Electron Builder configuration.

Packaging gate:

- Build passes.
- Packaged app launches.
- Local session secret is generated/provided safely.
- Backend binds admin API to loopback.
- Companion channel binds to loopback unless explicitly configured.
- App can select workspace.
- App can run a smoke FORGE task with approval.
- Tool API registry loads built-in tools with schemas.
- MCP servers are disabled by default and require explicit enablement.
- Tool audit log redacts arguments and credential references.
- Zero Egress blocks hosted providers, remote MCP, and network tools involving workspace data.
- Swarm worker count defaults to 3 or less.
- Learning mode is suggest-only and local-only.
- Learning memory secret-scan gate is enabled.

## Release Checklist

1. Update version.
2. Update changelog.
3. Run full verification.
4. Run packaged QA.
5. Run security regression.
6. Verify pricing/generated tier data.
7. Verify Tool API/MCP defaults and capability detection.
8. Verify launch docs.
9. Verify privacy/terms links.
10. Create release artifact.
11. Smoke install on clean machine.

## Beta Support Playbook

When a user reports an issue, collect:

- App version.
- OS.
- Workspace language/framework.
- Active model/provider.
- Zero Egress state.
- Whether Ollama is running.
- Last 50 agent log lines if safe.
- Error message.
- Whether issue reproduces in new project.

Do not ask users to share provider keys, pairing secrets, billing secrets, or private source unless explicitly sanitized.

## Rollback

Desktop rollback:

- Preserve user workspace.
- Preserve `.kryleos`.
- Preserve app data directory.
- Install previous package.
- If DB schema changed, provide migration rollback or read-compat fallback.

Never delete:

- User workspace files.
- `.git`.
- `.kryleos/traces`.
- `.kryleos/reviews`.
- `.kryleos/agents`.
- `.kryleos/skills`.

## Incident Response

Security incident types:

- Path escape.
- Unauthorized command execution.
- Secret exposure.
- Companion approval spoof.
- Billing entitlement bypass.
- Provider data egress despite Zero Egress.
- Tool API approval bypass.
- MCP token exposure or disabled-server invocation.
- External tool prompt-injection causing unauthorized action.
- Swarm approval/workspace bypass.
- Learning memory secret exposure.
- Learning recommendation applied without user approval.

Immediate actions:

1. Disable affected feature if possible.
2. Publish advisory to beta users.
3. Patch and test regression.
4. Add permanent test.
5. Update threat model.

## Observability

Local app should log:

- Startup.
- Workspace selection.
- Provider route selected, without secrets.
- Zero Egress blocks.
- Tool invocation lifecycle with redacted arguments.
- MCP server add/test/discover/enable/disable events without tokens.
- Swarm session lifecycle and lane summaries.
- Learning recommendation approve/reject/rollback events without secret-bearing payloads.
- Command approval lifecycle.
- Abort lifecycle.
- Trace creation.
- Drift run summary.
- Companion pair/revoke events.
- Billing webhook state changes, without sensitive payloads.

Avoid logging:

- API keys.
- Tokens.
- Pairing secrets.
- Full private file contents unless user explicitly exports logs.
