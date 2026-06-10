# Operations and Release Notes

## 1. Local Development

Install dependencies:

```bash
cd Desktop-app
npm install
```

Start development app:

```bash
npm run dev
```

This starts:

- Vite frontend.
- Local backend server.
- Electron desktop shell.

## 2. Build

```bash
cd Desktop-app
npm run build
```

The build runs TypeScript compilation and Vite production bundling.

## 3. Tests

```bash
cd Desktop-app
npm test
```

Latest reviewed status:

- `npm.cmd run build` passes.
- `npm.cmd test` passes with 8 test files and 52 tests.
- In restricted sandbox environments, Vitest can fail with `EPERM` while creating temporary test folders; rerun with normal project filesystem permissions for the real verification result.

## 4. Important Local Ports

Typical local backend:

```text
http://localhost:3001
ws://localhost:3001
```

Vite dev server port may vary depending on availability.

## 5. Environment and Credentials

The app supports model/provider keys from the configuration modal and backend credential loading.

Before production, replace plain file/localStorage credential persistence with OS-secure storage.

## 6. Release Readiness Checklist

- [ ] Product name is Kryleos Forge everywhere user-facing.
- [ ] App title and metadata are correct.
- [ ] Build passes.
- [ ] Tests pass.
- [ ] Manual smoke test passes.
- [ ] No placeholder API credentials are shipped.
- [ ] Google OAuth credentials are production-ready if Google features are enabled.
- [ ] Sync/auth implementation is production-ready or clearly marked beta/local.
- [ ] Subscription tiers are verified: Free, Solo, Solo Plus, Founder, and Agency/Team.
- [ ] Mock billing through `/api/auth/subscribe` is either replaced or clearly labeled.
- [ ] Remote Container Execution simulation is clearly labeled unless real containers are active.
- [ ] Enterprise collaboration/RBAC indicators are clearly labeled as simulator indicators unless server-enforced.
- [ ] Command approval workflow is verified.
- [ ] Graceful interrupt/abort behavior is verified.
- [x] Latest reviewed command approval flow passes build/test verification.
- [x] Latest reviewed abort flow rejects pending approvals and terminates tracked command processes.
- [ ] `.cursorrules` and `.cursor/rules` compatibility is verified.
- [ ] Privacy/security documentation is ready.
- [ ] Installer/package process is tested on target OS.

## 7. Troubleshooting

### Backend is offline

- Confirm port `3001` is not already in use.
- Restart `npm run dev`.
- Check terminal logs.

### Model calls fail

- Confirm selected model provider has a valid API key.
- Confirm network access.
- For Ollama, confirm local Ollama service is running.

### Workspace operations fail

- Confirm workspace path is valid.
- Confirm app has filesystem permissions.
- Confirm target path is inside workspace.

### Git operations fail

- Confirm workspace is a Git repository.
- Confirm remote is configured.
- Confirm credentials/token are valid if pushing.

### Google sync fails

- Confirm account is linked.
- Confirm OAuth credentials are configured.
- Confirm Drive API access is enabled.

### Subscription tier does not update

- Confirm `/api/auth/subscribe` route is reachable.
- Confirm the active user session token is present.
- Confirm the UI received the updated tier state.
- Confirm sync/database state was pushed after upgrade.

### Remote execution banner is wrong

- Confirm the active user tier.
- Free and Basic should show local host execution warnings.
- Pro and Enterprise should show remote container secure shell simulation banners.

### Command approval does not appear

- Confirm the agent action is `tool: runCommand`.
- Confirm the WebSocket connection is active.
- Confirm the orchestrator entered `commandPendingApproval`.
- Confirm `ChatConsole.tsx` receives and renders the pending command log state.
- Confirm the backend emitted `command_approval_required` with `commandId`.
- Confirm `App.tsx` sends `approve_command` with both `approved` and the matching `commandId`.

### Stop workflow does not abort

- Confirm `isStreaming` is true when the stop button is displayed.
- Confirm `App.tsx` sends `type: "abort_execution"`.
- Confirm `server.ts` routes the abort to the active orchestrator.
- Confirm active child processes are tracked and terminated.
- Confirm pending command approval is rejected if the workflow is stopped while waiting for approval.

## 8. Domain and Hosting

Recommended canonical product URL:

```text
https://forge.kryleos.com
```

Recommended redirects:

```text
https://kryleos.com/forge -> https://forge.kryleos.com
https://www.kryleos.com/forge -> https://forge.kryleos.com
```
