# Kryleos Forge Council Remediation Plan

## 1. Purpose

This plan converts the clean-slate council review into an implementation program for the entire Kryleos Forge repository. It covers the Desktop app, Web app, Mobile companion, backend, CI/CD, packaging, legal copy, product claims, accessibility, performance, documentation, and maintainability.

The plan deliberately does not use earlier QA reports as proof. Existing tests may be retained and improved, but every release gate must be executed fresh after the remediation work.

## 2. Target Release

The immediate target is a secure invited beta. Public release remains blocked until signing/notarization credentials and native-store prerequisites are available and the signed artifacts pass their platform smoke tests.

Recommended first coherent version:

- Product version: `0.1.0-beta.1`
- Desktop app ID: `com.kryleos.forge`
- Mobile iOS bundle ID: `com.kryleos.forge.companion`
- Mobile Android package: `com.kryleos.forge.companion`
- Agency/Team: preview and not purchasable until real collaboration and RBAC exist

## 3. Non-Negotiable Engineering Rules

1. Fix trust boundaries before adding or polishing features.
2. Do not depend on loopback, CORS, UI hiding, or a pairing code as the sole authorization control.
3. No browser or mobile client may select an arbitrary desktop workspace root.
4. No state-changing operation may be accepted from an unauthenticated WebSocket or REST caller.
5. Preserve command approval. Authentication does not replace explicit approval.
6. Use canonical paths and separator-aware containment checks. String-prefix path checks are forbidden.
7. Product, pricing, privacy, and maturity claims must be generated from canonical sources where practical.
8. Preview, simulator, mock, and planned features must never be presented as production capabilities.
9. Do not silence tests, weaken assertions, disable lint rules, or raise budgets merely to make gates green.
10. Preserve unrelated user changes and avoid broad rewrites that are not required by this plan.

## 4. Delivery Sequence

The phases are ordered by dependency and risk. A later phase must not be considered complete while an earlier gate is failing.

---

## Phase 0 - Baseline, Inventory, and Work Isolation

### Objectives

- Establish a reproducible starting point.
- Record current behavior without treating previous reports as evidence.
- Protect the existing worktree during a large remediation.

### Work

1. Inspect `git status` and preserve all pre-existing changes.
2. Work on a dedicated remediation branch or isolated Antigravity workspace.
3. Record fresh baseline results for:
   - Desktop build, lint, unit/integration tests, browser E2E.
   - Web build, lint, unit tests, browser E2E.
   - Mobile TypeScript, unit tests, Expo Web E2E.
   - Production dependency audits.
4. Create a live remediation checklist mapping every section of this document to files, tests, and status.
5. Add a cross-platform verification entry point such as `scripts/verify-all.mjs`. It should execute checks and return a non-zero exit code on any failure.

### Exit Gate

- Baseline commands and results are captured in a new remediation artifact.
- No historical QA result is cited as fresh proof.
- Existing user changes remain intact.

---

## Phase 1 - Critical Trust-Boundary Repair

### 1.1 Separate local administration from companion networking

Affected areas:

- `Desktop-app/src/backend/server.ts`
- `Desktop-app/src/backend/companionHub.ts`
- `Desktop-app/src/backend/electron.cjs`
- `Desktop-app/src/backend/preload.cjs`
- Desktop, Web, and Mobile connection code

Required design:

1. Keep the administrative REST API and local renderer WebSocket bound to `127.0.0.1` only.
2. If LAN/Tailscale companion support is enabled, expose a separate companion listener/port with only the minimum companion protocol.
3. Do not expose file, Git, credential, billing, workspace, provider-test, project, planning-write, deployment, or command-policy routes on the companion listener.
4. Route WebSocket upgrades by exact pathname. Do not use substring matching.
5. Reject unknown upgrade paths before creating a WebSocket connection.

Preferred topology:

- Local admin server: `127.0.0.1:3001`
- Optional companion server: configured host and separate port, for example `0.0.0.0:3002`
- Companion server exposes pairing and the authenticated companion WebSocket only

### 1.2 Authenticate the local renderer channel

1. Generate a cryptographically random, process-scoped local session secret when Electron starts the backend.
2. Pass it to the trusted renderer through the preload bridge, not through localStorage or a URL.
3. Require the secret for:
   - Local administrative REST routes.
   - The general local WebSocket upgrade.
   - Every local state-changing WebSocket message.
4. Validate the WebSocket `Origin` against exact trusted renderer origins.
5. Require an explicit authenticated connection state before processing `config`, `query`, `approve_command`, `abort_execution`, collaboration, or test-only messages.
6. Require `commandId` for all approvals. Reject missing, stale, duplicate, or cross-session approvals.
7. Compile or expose `smoke_command` only in test mode. It must not be available in production builds.

### 1.3 Remove shared mutable connection authority

1. The global `WorkspaceSandbox` must not be mutable by arbitrary WebSocket clients.
2. Workspace selection must happen through an authenticated local route or trusted Electron IPC flow.
3. Create a connection/session context that carries:
   - Authenticated caller identity.
   - Active project ID.
   - Immutable or explicitly validated workspace scope.
   - User tier obtained from trusted server state.
4. A client-supplied `token`, `tier`, `workspaceRoot`, or role must never directly establish authority.
5. Changing projects must replace the active workspace allowlist, not append indefinitely to it.

### 1.4 Harden companion state changes

1. Require a registered device plus valid Ed25519 signature and fresh nonce for every state-changing companion message, including `SYNC_PLANNING_NOTES`.
2. Pairing-code-only connections may complete device registration but may not approve commands, start/stop runs, write notes, or mutate state.
3. Rotate or invalidate the pairing secret after successful device registration.
4. Add per-IP and per-device rate limits to pairing and reconnect attempts.
5. Add message-size limits and strict runtime schemas for every companion message.
6. Bind signatures to device ID, message type, target ID, session ID where applicable, nonce, and timestamp/expiry.
7. Ensure revocation closes active sockets and invalidates tokens immediately.

### 1.5 Protect external navigation

1. Validate URLs in Electron before `shell.openExternal`.
2. Permit only `https:` by default. Permit `http:` only for explicit localhost preview use cases.
3. Reject `file:`, `javascript:`, `data:`, custom protocols, credentials in URLs, and malformed hosts.
4. Route renderer `window.open` calls through the validated preload API.

### Required Tests

- Unauthenticated REST mutation returns `401` or `403`.
- General WebSocket rejects absent/invalid token and untrusted origins.
- Companion listener cannot reach admin routes.
- A hostile browser origin cannot send `config`, `query`, `approve_command`, or `smoke_command`.
- Missing or stale `commandId` cannot approve execution.
- One connection cannot change another connection's workspace or tier.
- Unsigned `SYNC_PLANNING_NOTES` and all other unsigned mutations are rejected.
- Revoked devices cannot reconnect or mutate state.
- Production mode has no smoke-command capability.

### Exit Gate

- No administrative capability is reachable over the LAN companion listener.
- No unauthenticated caller can trigger a model request, file operation, project mutation, command approval, or command execution.
- Adversarial integration tests pass.

---

## Phase 2 - Filesystem Sandbox and Command Safety

### 2.1 Replace path-prefix containment

Affected file: `Desktop-app/src/backend/tools.ts`

Implement a single canonical containment helper:

1. Canonicalize the allowed root with `fs.realpath` where it exists.
2. Resolve the target path.
3. For existing targets, compare canonical real paths.
4. For new targets, canonicalize the nearest existing parent and append the remaining segments safely.
5. Use `path.relative(root, target)` and allow only:
   - Empty relative path, or
   - A relative path that is not absolute and does not begin with `..` plus a separator.
6. Normalize case appropriately on Windows.
7. Reject symlink and junction escapes.
8. Replace the allowlist when changing workspace unless an explicit multi-repo operation validates and adds an additional root.

### 2.2 Validate workspace roots

- Must be absolute.
- Must exist and be a directory, except controlled project-creation flows.
- Must not be a filesystem root, home root, temporary system root, or protected OS directory unless an explicit advanced override is confirmed locally.
- Must be selected by the local trusted client.

### 2.3 Improve command execution containment

1. Keep explicit user approval for every agent-proposed command.
2. Execute commands with a minimal environment and redact secrets from logs.
3. Prefer `execFile` with structured arguments for internal Git and utility operations.
4. Keep shell execution only for user-approved free-form commands.
5. Add output, process-tree, timeout, and concurrency limits.
6. Record an immutable approval audit entry containing command hash, workspace, source, command ID, approver source, and result.
7. Ensure abort kills descendant processes reliably on Windows, macOS, and Linux.

### Required Tests

- Sibling-prefix escape such as `workspace-secret` is rejected.
- `..`, mixed separators, UNC paths, drive-letter case differences, symlinks, and junction escapes are rejected.
- Valid nested paths and explicitly validated multi-repo roots remain usable.
- Workspace changes remove prior authority.
- Command approval audit records do not contain credentials.
- Abort terminates child process trees on supported platforms.

### Exit Gate

- The council's reproduced sibling-prefix escape fails closed.
- Symlink/junction escape tests pass on applicable CI platforms.

---

## Phase 3 - Credential, Session, and Data Protection

### Desktop

1. Keep provider credentials behind Electron `safeStorage`.
2. Replace AES-CBC fallback with authenticated encryption such as AES-256-GCM.
3. Keep the per-install random fallback key; never describe it as OS-fingerprint-bound.
4. Restrict key-file permissions and prevent secrets from entering logs, crash files, traces, or telemetry.
5. Protect `/api/credentials` with local authentication and return masked metadata rather than raw secrets unless strictly required.

### Web

1. Remove provider API keys from `localStorage`.
2. Prefer removing browser-side provider-key entry entirely and using the paired desktop credential broker.
3. If temporary key entry remains, keep it in memory only, never persist it, clear it on disconnect/unload, and warn that refresh loses it.
4. Remove auth bearer tokens from persistent `localStorage`. Use an HttpOnly secure cookie for a real same-origin service, or memory-only state for the current local preview.
5. Do not persist pairing codes. Persist only a revocable device credential if required, using the least-privileged browser storage design and explicit disconnect/revoke controls.

### Mobile

1. Store device private keys and device tokens in the platform secure store/keychain, not component memory as the sole durable identity.
2. Never store model-provider API keys on mobile unless native secure storage and a documented threat model are implemented.
3. Clear revoked identities and require re-pairing.

### Local account data

1. Correct misleading comments such as "Plain password for simulation."
2. Use asynchronous password derivation with a modern work factor. Prefer Argon2id if packaging permits; otherwise raise and document PBKDF2 parameters with migration support.
3. Store account and sync files with restrictive permissions.
4. Add schema validation and atomic writes for local JSON databases.

### Exit Gate

- No provider key or long-lived auth token appears in browser localStorage.
- Mobile paired identity survives safely through platform secure storage.
- Secret-scanning tests cover logs, traces, sync payloads, and crash records.

---

## Phase 4 - Canonical Product Truth, Pricing, and Legal Alignment

### 4.1 Create canonical sources

Use structured source files for:

- Version and release channel.
- Pricing and purchasable tiers.
- Feature maturity: production, beta, preview, simulator, mock, planned.
- Provider data-disclosure behavior.

Generate or validate Desktop, Web, Mobile, README, and selected documentation tables from those sources.

### 4.2 Resolve pricing contradictions

1. Keep Free, Solo, Solo Plus, and Founder aligned across all surfaces.
2. Mark Agency/Team as preview and non-purchasable while its canonical price is `null`.
3. Remove `$39/mo` checkout language until a real purchasable Agency plan exists.
4. Ensure Stripe and Razorpay only accept canonical buyable tier IDs.
5. Update `featureStatuses.billing`: real signed billing integrations may be beta/production as appropriate; local mock fallback must be visibly development-only.

### 4.3 Remove unsupported product claims

Rewrite or remove:

- "Only AI coding tool" and equivalent exclusivity claims.
- Claims that code or agent runs never leave the machine when hosted providers are enabled.
- Native push-notification claims until `expo-notifications` and a delivery service exist.
- Production cloud sync, collaboration, RBAC, remote container, cloud IDE, marketplace, Docs Autopilot, or Cost Guard claims where implementation is preview/simulator/planned.
- Claims of an encrypted chat database if the database is plain JSON.

### 4.4 Rewrite privacy and terms accurately

Privacy policy must state:

- Local scans and filesystem operations remain local.
- Hosted-model calls can transmit prompts, selected code context, diffs, diagnostics, and instructions to the chosen provider.
- Zero Egress blocks hosted-model calls and cloud sync, but user-directed Git, package managers, deployment tools, or external links are separate actions.
- Credential storage behavior accurately reflects safeStorage and the authenticated fallback.
- Current sync/account storage architecture accurately reflects whether data is local or hosted.
- Retention, deletion, crash logs, device pairing, billing metadata, and third-party processors.

Terms must align with actual license activation requirements, refund limitations, beta status, command execution, and preview features.

### Exit Gate

- A repository-wide claim scan finds no contradiction with canonical feature status.
- No unavailable feature is marketed as shipped.
- Privacy and Terms match executable behavior.

---

## Phase 5 - Release Engineering and Supply Chain

### Versioning and metadata

1. Set a real beta version consistently across manifests and generated metadata.
2. Replace `Mobile-app` display name/slug with Kryleos Forge Companion naming.
3. Add iOS bundle identifier, Android package, build number, and version code.
4. Add root `README.md`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, and support/contact information.
5. Replace the Web Vite README and `<title>web-app</title>` with production metadata, description, canonical URL, Open Graph, and social metadata.

### Desktop packaging

1. Add deterministic Windows, macOS, and Linux packaging jobs.
2. Configure Windows Authenticode signing and macOS Developer ID signing/notarization through CI secrets.
3. Fail public-release jobs when signing credentials are absent; allow explicitly labeled unsigned beta artifacts only in a separate manual workflow.
4. Generate SHA-256 checksums, SBOM, release notes, and provenance/attestation where supported.
5. Test install, launch, no-key demo, update notification, and uninstall/data-preservation behavior.

### Mobile packaging

1. Add `eas.json` or the selected native build configuration.
2. Add Android and iOS build profiles for development, preview, and production.
3. Add native smoke/accessibility flows using Maestro or Detox on emulator/simulator.
4. Add privacy manifests and store declarations required by enabled permissions and SDKs.

### CI gates

1. Keep the existing cross-platform unit matrix.
2. Add security regression tests from Phases 1-3.
3. Add coverage reporting and meaningful thresholds, starting from measured coverage rather than arbitrary numbers. Thresholds must not decrease without review.
4. Add Windows and macOS packaged smoke tests.
5. Add generated-file drift checks for pricing, feature status, and versions.
6. Add secret scanning, lockfile integrity, license review, and production dependency audits.
7. Pin third-party GitHub Actions to immutable commit SHAs for release workflows.

### External prerequisites

Antigravity can configure and test the pipelines, but cannot manufacture:

- Apple Developer certificates/account access.
- Apple notarization credentials.
- Windows code-signing certificate.
- Store accounts and final legal contact details.
- Production Stripe/Razorpay secrets.

Document these as explicit external blockers. Do not pretend they are complete.

### Exit Gate

- Unsigned invited-beta artifacts are clearly labeled.
- Public release workflow cannot publish unsigned desktop artifacts.
- Native identifiers and build profiles are complete.
- Release outputs include checksums and SBOM.

---

## Phase 6 - Architecture and Maintainability

Perform behavior-preserving extraction after security contracts are covered by tests.

### Backend decomposition

Split `Desktop-app/src/backend/server.ts` into modules such as:

- `server/createApp.ts`
- `server/localServer.ts`
- `server/companionServer.ts`
- `server/middleware/localAuth.ts`
- `server/middleware/originPolicy.ts`
- `server/routes/auth.ts`
- `server/routes/billing.ts`
- `server/routes/files.ts`
- `server/routes/projects.ts`
- `server/routes/planning.ts`
- `server/routes/providers.ts`
- `server/ws/localSession.ts`
- Existing domain services remain separate from transport

The app factory must be importable without listening on a port so integration tests can instantiate it safely.

### Frontend decomposition

Split the six oversized modules by domain:

- Desktop `App.tsx`: app shell, connection/session hook, project state, routing, notifications, legal gate.
- `PlanningScreen.tsx`: scratchbook, plan workspace, imports, feasibility, docs, integrations.
- `ConfigHeader.tsx`: providers, privacy/security, billing, workspace, account, advanced settings.
- Web `App.tsx`: marketing, pricing, auth, companion, planning, settings, downloads.
- Mobile `App.tsx`: navigation shell, pairing, dashboard, plan, chat, tasks, settings.

Targets are guidelines, not a reason for meaningless fragmentation:

- Root app shells below roughly 600 lines.
- Domain screens below roughly 800 lines.
- Hooks/services should own effects and protocol logic.
- No new circular dependencies.

### Quality controls

- Add runtime schemas for external JSON and WebSocket messages.
- Replace `any` on trust-boundary payloads.
- Add error taxonomy and structured, redacted logging.
- Use atomic persistence helpers for JSON state.
- Remove stale Basic/Pro/Enterprise tier terminology.

### Exit Gate

- Security and behavior tests remain green during extraction.
- Major transport, domain, and UI responsibilities have clear owners.
- No giant replacement module merely relocates the original monolith.

---

## Phase 7 - Performance and Scalability

### Bundle and rendering

1. Code-split Desktop routes, configuration panels, planning tools, and optional graph/deck features.
2. Code-split Web marketing, pricing, planning, downloads, and settings surfaces.
3. Add CI bundle budgets based on minified and gzip sizes.
4. Initial goals:
   - Desktop main entry under 500 KB minified, with optional domains in lazy chunks.
   - Web main entry under 250 KB minified, or a documented lower measured threshold after route splitting.
5. Remove unused Vite starter assets and dependencies.
6. Profile React renders and memoize expensive derived board/graph data where measurements justify it.

### Backend

- Bound workspace graph/index scans by file count, size, ignored directories, cancellation, and timeout.
- Cache by workspace plus Git commit/fingerprint.
- Avoid synchronous filesystem/process calls in request paths where practical.
- Add WebSocket connection/message limits and backpressure handling.
- Limit concurrent agent runs and provider probes.

### Exit Gate

- Vite emits no unacknowledged chunk-size warning for the main entry.
- Performance budgets are enforced in CI.
- Large-workspace smoke test remains responsive and cancellable.

---

## Phase 8 - UI/UX and Accessibility Completion

### Product clarity

- Use Kryleos Forge branding consistently; remove stale Matrix-era user-facing terminology and decorative CRT language where it conflicts with the default professional theme.
- Display maturity badges from the canonical feature source.
- Hide or clearly separate simulator/demo controls from production workflows.
- Make desktop dependency explicit on Web/Mobile connection screens.
- Replace fake success timers and local simulator responses with honest offline states.

### Accessibility

- Replace clickable non-semantic `div` elements with buttons or links.
- Preserve visible keyboard focus, logical heading structure, labels, announcements, and 44x44 mobile touch targets.
- Test dialogs for focus trap, Escape behavior, initial focus, and focus restoration.
- Respect reduced motion and high-contrast modes.
- Add native mobile screen-reader smoke checks in addition to Expo Web axe tests.

### Exit Gate

- Axe has no critical/serious violations on representative states.
- Keyboard-only flows cover setup, configuration, planning, board execution, approval, and companion pairing.
- Offline/simulator behavior is never presented as successful real execution.

---

## Phase 9 - Documentation, Operations, and Support

### Documentation

- Root README: product truth, architecture, setup, verification, release status, security warning.
- Web README: real web/companion setup, not Vite template text.
- Architecture document updated for split local/companion servers and authentication.
- Security document updated with threat model and trust boundaries.
- User Guide updated to match real tiers and features.
- Install guide updated for signed versus unsigned artifacts.
- Contributor guide with setup, generated files, tests, and commit expectations.
- Security policy with private disclosure route and supported versions.
- Changelog initialized for the beta.

### Operations

- Structured local logs with rotation and redaction.
- Health/readiness endpoints available only on the local authenticated server.
- Crash records exclude prompts, code, credentials, and tokens.
- Document rollback, backup, restore, data locations, and uninstall behavior.
- Add a release runbook and incident checklist.

### Exit Gate

- A new developer can install dependencies, run all three apps, and execute verification from current docs.
- An invited beta user can understand what leaves the machine and which features are previews.

---

## Phase 10 - Final Independent Release Gate

Run every check from a clean install and fresh temporary data directories.

### Required automated verification

Desktop:

```bash
npm ci
npm run build
npm run lint
npm test
npm run test:e2e
npm run test:e2e:packaged
npm audit --omit=dev --audit-level=high
```

Web:

```bash
npm ci
npm run build
npm run lint
npm test
npm run test:e2e
npm audit --omit=dev --audit-level=high
```

Mobile:

```bash
npm ci
npx tsc --noEmit
npm test
npm run test:e2e
npm audit --omit=dev --audit-level=high
```

Also run:

- New adversarial security suite.
- Native mobile smoke/accessibility suite.
- Windows/macOS/Linux packaged smoke where runners and credentials permit.
- Generated-content drift check.
- Secret scan.
- Bundle-budget check.
- Fresh installer test on target operating systems.

### Manual release scenarios

1. First launch and legal disclosure.
2. No-key deterministic demo.
3. Ollama local-only execution.
4. Hosted provider disclosure and execution.
5. Zero Egress proving hosted calls are blocked.
6. Command approval, stale approval rejection, reject, and abort.
7. Workspace sibling and symlink escape attempts.
8. Companion pair, reconnect, approve, reject, stop, note sync, and revoke.
9. Offline desktop, Web, and Mobile behavior.
10. Billing checkout/cancel using provider test environments.
11. Clear local data and uninstall behavior.

### Final release criteria

Invited beta may ship only when:

- Critical and high findings are closed with tests.
- No administrative API is exposed to LAN clients.
- Legal/product claims match behavior.
- Unsigned status is unmistakable if signing credentials remain unavailable.
- All executable gates pass freshly.

Public release may ship only when:

- Signed/notarized desktop artifacts pass platform smoke tests.
- Native mobile release builds and store declarations are complete.
- Production billing configuration is verified.
- No unresolved critical or high release finding remains.

## 5. Completion Evidence

The final remediation report must contain:

- Files changed, grouped by phase.
- Security architecture summary.
- Test commands and exact pass/fail totals.
- Bundle sizes before and after.
- Dependency audit results.
- Remaining external prerequisites.
- Explicit statement that previous QA reports were not used as proof.
- A requirement-to-evidence matrix linking every council finding to implementation and tests.
