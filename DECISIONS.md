# Kryleos Forge — Locked Decisions (Phase 0)

Decided once per `IMPLEMENTATION_PLAN.md` §1, encoded once. Do not re-litigate these
during implementation — if a decision turns out to be wrong, update this file and the
plan together, with a note on why.

| # | Decision | Locked choice | Rationale |
|---|---|---|---|
| 1 | **Canonical pricing ladder** | Free $0 / Solo $5 / Solo Plus $9 / Founder $15 — **Agency/Team = "Preview · join waitlist"** (not buyable) | Resolves the 3 contradictory ladders (Web `App.tsx:43` `$2.99/$9.99/$25`, backend `priceMap` `server.ts:855-860`, brief `$5/$9/$15/$39`). Agency has no real multi-tenant infra. |
| 2 | **Payment processor** | ~~Gumroad (primary)~~ → **Stripe (global) + Razorpay (India)**, recurring subscriptions. SUPERSEDED 2026-06-15, see amendment below. | Stripe/Razorpay checkout+webhook paths were already built and SEC-hardened (signature verification, mock-key prod guards) before this decision was enforced; reverting would discard working, tested code for an unbuilt Gumroad integration. |
| 3 | **Monetization mechanism** | ~~Gumroad hosted checkout → emailed key → offline signature validation~~ → **Stripe/Razorpay hosted checkout → signature-verified webhook sets tier server-side** (`subscribeByEmail`). Offline Ed25519-signed license keys (`license.ts`, `/api/license/activate`) retained as an optional non-recurring "Founder lifetime" SKU, sellable via any storefront (incl. Gumroad). SUPERSEDED 2026-06-15, see amendment below. | Both grant paths already exist, are independently signature-verified, and are covered by `tier_trust.test.ts`. |
| 4 | **Stripe's fate** | ~~Remove `create-checkout-session`, the webhook, and the `stripe` dep~~ → **Keep.** Stripe + Razorpay are the live processors (amended #2). SUPERSEDED 2026-06-15, see amendment below. | One processor was never actually shipped; the "no card form on our site" framing assumed Gumroad's hosted checkout, but Stripe/Razorpay checkout is also off-site (hosted session URL), so the original rationale's premise (PCI/card-form avoidance) still holds. |
| 5 | **Shared module resolution** | Generated constants file, copied into each app's `src/` at build time (npm workspace / path-alias deferred — must survive the packaged Electron build, not just `tsc --noEmit`) | `Web-app` and `Desktop-app` are separate top-level packages; an out-of-package import can pass `tsc` and break the bundle. |
| 6 | **Companion connectivity (beta)** | **Same-LAN + Tailscale private-mesh / Serve.** ngrok = fallback only. Internet relay deferred. | Never steer users to Tailscale Funnel / public exposure of a shell-command-approval endpoint. |
| 7 | **Launch type** | **Invited / closed beta**, desktop-core + thin companions, BYOK | Honest mitigation for shipping unsigned. |
| 8 | **Readiness gate** | Hardened `qa/scripts/release-score.mjs` ≥ 8.5 + manual Definition-of-Release-Ready checklist | The pre-Phase-1 scorer was gameable (file-existence checks, hardcoded findings count). |
| 9 | **Update channel** | `electron-updater` → GitHub Releases; interim posture = check-and-notify-to-redownload | Unsigned macOS cannot auto-apply (Squirrel.Mac needs a signature); unsigned Windows needs the Authenticode verifier disabled until signed. |

## Scope guardrails (carried from the plan)

- **Certs deferred.** No Apple Developer / Windows OV cert purchase this iteration.
- **Mobile + Web stay** as thin companions (remote brainstorm + remote execution
  approval) — never full coding IDEs.
- **Ship less.** Cut over-claims and unbuyable tiers; no net-new capability beyond the
  no-key demo (Phase 6).
- **Honesty is the moat.** Nothing simulated may be presented as delivered on any
  paid/public surface — including legal copy, badges, and the readiness score itself.

## Deviations from the plan as written (recorded here, not silently)

- **Backend port stays fixed at `3001`** rather than an ephemeral-port-plus-discovery
  scheme. ~11 frontend files hardcode `http://localhost:3001`; rewriting all of them to
  read a runtime-discovered port is a much larger refactor than Phase 1's stated
  effort and was not required for "self-contained install" — the packaged app starts
  its own backend on 3001 and the renderer's existing hardcoded URLs keep working.
  Revisit only if multi-instance support is ever needed.

## Phase 1 T1 status — packaged Electron boot path

**Code-complete, exit gate met.** `electron.cjs` spawns the esbuild-bundled
backend (`dist-backend/server.cjs`) via `ELECTRON_RUN_AS_NODE`, polls
`127.0.0.1:3001` for readiness, then `loadFile`s `dist/index.html` — no dev
server, no `tsx`. Verified by launching `dist-desktop/win-unpacked/Kryleos
Forge.exe` directly: backend printed its "running on :3001" banner, `curl
127.0.0.1:3001/` returned `404` (server up, no route registered — expected),
window loaded the built renderer.

**Known gap — full `npm run dist` installer.** `electron-builder --dir --win`
packages everything correctly (`app.asar` contains `dist/**`,
`dist-backend/server.cjs`, `electron.cjs`, `preload.cjs`) but cannot finish
the final signing/`app-update.yml` step: `ERROR: Cannot create symbolic link
... winCodeSign ... darwin/10.12/lib/libcrypto.dylib — A required privilege is
not held by the client.` This is electron-builder extracting its macOS
code-signing cache on Windows, which needs Developer Mode or admin — an
environment limitation, not a code defect. `CSC_IDENTITY_AUTO_DISCOVERY=false`
does not avoid it. Consequence: `autoUpdater.checkForUpdates()` logs an ENOENT
on the missing `app-update.yml` at boot (caught, non-fatal). Re-run `npm run
dist` on a machine/CI with Developer Mode (or admin) enabled, or on macOS/
Linux runners, to produce the real installer + `app-update.yml`.

## npm audit (Desktop-app, post electron-builder/esbuild devDeps)

- **Production tree (`npm audit --omit=dev`): 0 vulnerabilities.**
- Dev tree: 10 high severity, all `tar`-chain advisories under
  electron-builder's build-time deps (`app-builder-lib` → `dmg-builder` →
  `electron-builder`/`electron-builder-squirrel-windows`, and
  `cacache` → `make-fetch-happen` → `node-gyp`). `npm audit fix` (non-breaking)
  resolved 1 of the 10; the remaining 9 only resolve via `npm audit fix
  --force`, which downgrades `electron-builder` to a breaking major version we
  just pinned for Phase 1. Build-tooling-only exposure (never shipped to
  users) — accepted as-is. Revisit if electron-builder ships a non-breaking
  fix upstream.

## Phase 1 T2 status — hardened `qa/scripts/release-score.mjs`

Rewrote the scorer per the IMPLEMENTATION_PLAN line 57 exit gate
("hardened scorer reflects real pass/fail and cannot read ≥ 8.5 on
scaffolding"):

- **E2E (15%)** now runs `npx playwright test --reporter=line` per app and
  scores by exit code, not by config-file presence. `SKIP_E2E=1` reports the
  category as unproven (0%) instead of skipping silently.
- **Phase-gate assertions (20%)**, 4 automated sub-checks: (a) grep public
  surfaces (`Web-app/src`, `Desktop-app/src/components`,
  `Mobile-app/src`, `README.md`) for `Matrix-Coding`/"the only ... app/tool"
  overclaims, (b) `PreviewDeck.tsx` has no canned-reply string, (c) the
  packaged backend (`dist-backend/server.cjs`) self-starts standalone via
  `ELECTRON_RUN_AS_NODE=1` and answers on `127.0.0.1:34577`, (d) a forged
  `tier: 'founder'` in the `/api/crew/sync` request body is rejected with
  `403`.
- Removed the old hardcoded `openHighFindings = 1` constant and its
  weight entirely.

**Rebalanced weights** so these two categories carry enough weight to keep
the score below the 8.5 target while either has open failures:
`security 0.15→0.10`, `qaReports 0.10→0.05`, `phaseGates 0.10→0.20` (sum
still 1.00).

**Current honest baseline (2026-06-14, `SKIP_E2E=1`): 7.5 / 10, BELOW
TARGET.** Two phase-gate sub-checks currently fail and are real, open
issues for Phase 2/3:
- ✘ `PreviewDeck.tsx` still sends the canned "Context note queued locally
  ..." reply instead of a live response.
- ✘ `POST /api/crew/sync` accepts a forged `tier: 'founder'` in the
  request body and returns `200` (only `tier: 'free'` is rejected) — a
  real entitlement-bypass vulnerability, to be closed in Phase 3
  alongside tier/license validation.

With E2E included (last full run, 1/3 apps pass — Web-app only;
Desktop-app and Mobile-app fail, not yet investigated), the score is
8.0 / 10 — still below target. Phase 1 T2 is complete: the scorer now
measures real state and correctly refuses to call this release-ready
until Phases 2-3 close the two phase-gate items above (and Desktop/Mobile
E2E failures are investigated).

## Phase 1 T1 — re-audit regression fix (asar boot, 2026-06-15)

The 2026-06-14 23:36 council re-audit (`.claude/council-reaudit-P1-P5-2026-06-14_2336.md`,
finding #1) found the P1 T1 boot fix above had regressed: `electron-builder.yml`
set no `asarUnpack`, so `dist-backend/server.cjs` was sealed inside `app.asar`;
`startBackend()` spawned it as plain node (`ELECTRON_RUN_AS_NODE=1`), which
cannot resolve `require()` for the `--packages=external` deps (`express`,
`stripe`, `razorpay`, etc.) from inside an asar archive → boot would hang.

Fix applied:
- `Desktop-app/electron-builder.yml`: added
  ```
  asarUnpack:
    - dist-backend/**/*
    - node_modules/**/*
  ```
  so the backend bundle and its production `node_modules` land in
  `resources/app.asar.unpacked/` with the same relative layout as the
  project root (`dist-backend/server.cjs` next to `node_modules/`).
- `Desktop-app/src/backend/electron.cjs` `startBackend()`: `serverPath` now
  resolves to `path.join(process.resourcesPath, 'app.asar.unpacked',
  'dist-backend', 'server.cjs')` instead of a `__dirname`-relative path
  (which still pointed inside `app.asar`).

**Verification done:** ran `dist-backend/server.cjs` standalone via
`ELECTRON_RUN_AS_NODE=1 PORT=3001 node dist-backend/server.cjs` from
`Desktop-app/` (same relative `node_modules` layout `asarUnpack` preserves
under `app.asar.unpacked/`) — backend printed its banner, `curl
127.0.0.1:3001/` returned `404` (server up, no `/` route — expected, matches
the original P1 T1 verification).

**Verification NOT done — env-blocked, not a code issue:** `npx
electron-builder --dir --win` still fails before packing, at the
`winCodeSign` cache extraction step (`Cannot create symbolic link: A
required privilege is not held by the client`), the same Windows
Developer-Mode/admin limitation already recorded under "Phase 1 T1 status"
above. **Re-run `npm run dist` (or `electron-builder --dir`) on a machine
with Developer Mode/admin enabled, or on macOS/Linux, and smoke-test the
real `app.asar.unpacked/dist-backend/server.cjs` path end-to-end** before
marking this finding closed.

## Amendment 2026-06-15: payment-processor re-litigation (decisions #2-4)

The 2026-06-14 23:36 council re-audit (finding #4, "Legal honesty regressed")
found that `terms.md`/`privacy.md` say purchases go through **Gumroad as
Merchant of Record**, while `server.ts` charges through **Stripe** (global)
and **Razorpay** (India) — and that the original Phase 0 decision to make
Gumroad the sole processor (#2-4 above) was never implemented in code. The
re-audit's recommendation (its point 3) offered two paths: revert to
Gumroad-only, or formally amend the locked decisions to Stripe+Razorpay and
fix the legal copy to match.

**Decision: amend, not revert.** By the time of this audit, Stripe
(`create-checkout-session`, webhook with signature verification and
mock-key production guards) and Razorpay (`razorpay/create-order`,
`razorpay/webhook`, same guards) were both fully implemented, SEC-hardened,
and exercised by `tier_trust.test.ts`. Reverting would discard working,
tested checkout/webhook code in favor of a Gumroad integration that does not
exist yet — a strictly worse outcome for "ship working code" than updating a
planning document.

**What changes:**
- Decisions #2-4 above are struck through and superseded: Stripe (global) +
  Razorpay (India) are the live recurring-subscription processors. Each
  webhook is the server-side source of truth for its checkout flow
  (`subscribeByEmail`), independently signature-verified
  (`stripe-signature` / `x-razorpay-signature`), and both reject mock keys
  in any environment where `NODE_ENV === 'production'` or signature
  verification is otherwise required.
- The offline Ed25519 license-key path (`license.ts`,
  `/api/license/activate`) is **not** retired — it remains a second,
  independently-verified tier-grant path for a non-recurring "Founder
  lifetime key" SKU, which can still be distributed through Gumroad (or any
  storefront) without Gumroad needing to be a live API integration. This is
  not the "parallel webhook tier-grant" duplication the re-audit warned
  about: it is a distinct product (one-time lifetime key vs. recurring
  subscription), already covered by `tier_trust.test.ts`'s
  validly-signed/expired-key cases, and `/api/auth/subscribe` (SEC-M3) still
  only permits self-service downgrade to `free` — no path lets a client
  self-grant a paid tier outside these two verified mechanisms.
- `Project-Documents/launch/terms.md` §3 and `privacy.md` §4 are rewritten
  to name Stripe + Razorpay as the actual payment processors (recurring
  subscriptions) and describe the offline license key as a separate
  lifetime-purchase option, replacing the Gumroad-as-Merchant-of-Record
  framing. See those files for the updated copy.

**Not addressed by this amendment** (tracked separately, P1): pricing-ladder
unification across Mobile/Web/Desktop (`Mobile-app` still on the old ladder,
Desktop `$39` Agency price) — decision #1's canonical ladder still stands and
these surfaces need to catch up to it.

## Phase 1 — CI submodule fix (de-gitlink vendoring, 2026-06-15)

Re-audit finding #5: `Desktop-app` and `Mobile-app` were tracked as git
**gitlinks** (mode `160000`, i.e. accidental submodules) with no
`.gitmodules` — `actions/checkout@v4` in `.github/workflows/ci.yml` therefore
checked out **empty directories** for both apps, so the `Desktop-app`/
`Web-app`/`Mobile-app` test matrix, the lint job, the Ollama e2e job, and
`release-score.mjs` (which `npm ci`s all three apps) could never have
actually run in CI.

Root cause: each had its own nested `.git` (Desktop-app: 46 commits, HEAD
`7743c16` on `qa/full-test-audit`; Mobile-app: its own history, HEAD
`d635b60` on `master`, no remote). Desktop-app's nested `origin` pointed at
the same URL as this superproject, but neither nested repo's commits were
ever pushed anywhere `.gitmodules` could fetch from — so "true submodules"
wasn't viable without first pushing 46+ commits to new remote refs.

**Fix applied (vendoring):**
- Exported each nested repo's full history to a bundle at the superproject
  root: `Desktop-app-history.bundle` (refs `main` @ `f5a8f0d`,
  `qa/full-test-audit` @ `7743c16`) and `Mobile-app-history.bundle` (`master`
  @ `d635b60`). `git bundle verify <file>` + `git clone <file>` recovers full
  history if ever needed.
- Renamed `Desktop-app/.git` → `Desktop-app/.git-archive` and
  `Mobile-app/.git` → `Mobile-app/.git-archive` (gitignored — see
  `.gitignore`), so git no longer sees these paths as nested repos.
- `git rm --cached` the two gitlink entries, then `git add` both directories
  — all ~684 tracked files (source, tests, configs; `node_modules`/`dist`/etc.
  excluded by each app's own `.gitignore`, which still applies on disk) are
  now regular blobs in the superproject.

**No CI workflow changes needed** — `.github/workflows/ci.yml` already used
plain `actions/checkout@v4` with no submodule config; it now receives full
content for `Desktop-app` and `Mobile-app` for free.

**Verification NOT done in this session** (sandboxed to a different project
root, no shell access to this repo): run `npm ci && npx tsc -b && npm test`
in both `Desktop-app/` and `Mobile-app/` to confirm vendoring didn't disturb
anything, then push and confirm the CI matrix actually executes (not just
checks out) for both apps.

## Phase 1 — P1 command-gate bypass fix (basename resolve + wrapper unwrap, 2026-06-15)

Re-audit P1 finding: `classifySubcommand()` in
`Desktop-app/src/backend/tools.ts` (lines ~146, 224) matched the blocklist
against the raw first token (`tokens[0].toLowerCase()`), with only a
hardcoded `sudo` special-case. This let a forged or malicious command bypass
`RECURSIVE_DELETE_CMDS`/`LEADING_DANGER_CMDS` entirely via:
- absolute/relative paths: `/usr/bin/rm -rf /`, `C:\Windows\System32\taskkill.exe`
- backslash alias-escape: `\rm -rf ~`
- pass-through wrappers: `env rm -rf /`, `env FOO=bar rm -rf /`, `xargs rm -rf /`
- combinations: `sudo /usr/bin/rm -rf /`

**Fix applied:**
- New `resolveCmdName(token)` — strips quotes, a leading alias-escape
  backslash, any `/`/`\` directory prefix (basename), and a Windows
  `.exe`/`.cmd`/`.bat`/`.com` extension, before lowercasing for blocklist
  comparison.
- New `WRAPPER_CMDS = {'sudo','doas','env','xargs'}` with a generalized
  unwrap loop (replacing the old sudo-only special case) that advances past
  the wrapper, its flags, and (for `env`) `VAR=value` assignments, re-running
  `resolveCmdName` on the next token — repeated up to 8 times to handle
  stacked wrappers (e.g. `sudo env rm -rf /`).
- `argStart` is derived from the unwrap loop's final index, so
  `RECURSIVE_DELETE_CMDS` target-scanning (`tokens.slice(argStart)`) sees the
  real command's arguments, not the wrapper's.

**Accepted scope limitation:** `nice`/`nohup`/`time`/`command` wrappers and
value-taking flags (e.g. `nice -n 10 rm -rf /`) are not unwrapped — not part
of the re-audit's cited bypass examples, and unwrapping flag-with-value
wrappers risks misreading a flag's value as the wrapped command.

**Verification:** added 8 new cases to
`tools.command_classification.test.ts` covering each bypass above (plus one
"still allowed, still flagged destructive" case for a non-recursive
`/usr/bin/rm notes.txt`). Full run: 50/50 in this file, 271/272 across
`src/backend/__tests__` (1 pre-existing intentional `it.fails`, unrelated),
`npx tsc -b --noEmit` clean.

Also closed a second gap from the same finding's "add `/*` ... to the hard
block" remediation note: `rm -rf /*` and `rm -rf ~/*` previously returned
`{blocked: false, destructive: true}` because `/*`/`<HOME>/*` weren't in
`HOME_DANGEROUS_TARGETS`. Added both to the set; 2 new tests added.

## Phase 1 — P1 companion signature escape hatch + pairing-secret exposure (2026-06-15)

Re-audit P1 finding #6: "Close the signature escape hatch: drop the `if
(!deviceId) return true` short-circuit (`companionHub.ts:186`) or refuse
remote-exec verbs on unpaired/code-only connections; stop serving the pairing
secret unauthenticated. Wire desktop→phone signature verification on the
phone (it's currently a dead write)."

**Fix 1 — `companionHub.ts` `verifySignedDeviceMessage()`:** a connection that
has only presented the pairing code (`deviceId === null` — hasn't completed
`PAIR_DEVICE`) has no registered public key to verify against, so it can no
longer be authorized for `APPROVE_COMMAND`/`REJECT_COMMAND`/`STOP_WORKFLOW`/
`START_FORGE_RUN` — `return true` → `return false`. Previously, anyone who
obtained the 6-digit pairing code (rate-limited, but a real 6-digit space)
could approve/reject/stop remote commands with no Ed25519 signature at all.
Updated `companionHub.signedMessages.test.ts`'s
"legacy code-paired connections... can still STOP_WORKFLOW unsigned" test to
assert `unauthorized` instead — this is an intentional behavior change, not a
regression: phones must complete `PAIR_DEVICE` (which they already do
automatically on first connect when a pairing secret is present, per
`Mobile-app/App.tsx`) before any remote-exec verb works.

**Fix 2 — pairing-secret exposure (`server.ts`):** `GET
/api/companion/status` returns `pairingSecret` (used by `PAIR_DEVICE` to
self-register a device's public key) and `GET /api/companion/pairing-code`
returns the pairing `code`. SEC-B5 already binds the backend to `127.0.0.1`
by default, but companion-over-LAN users set
`KRYLEOS_BIND_HOST=0.0.0.0` — at which point both endpoints were reachable
(no auth, the existing CORS/origin check only restricts requests that send an
`Origin` header) to anyone on the same LAN/Tailnet, who could fetch the
secret and call `PAIR_DEVICE` directly, fully bypassing the pairing code the
desktop displays as a QR. Added `isLoopbackRequest()`/`requireLoopback()` —
both endpoints now 403 unless `req.socket.remoteAddress` is `127.0.0.1`/
`::1`/`::ffff:127.0.0.1`, regardless of `BIND_HOST`. The desktop Electron UI
(which renders the QR code) always calls these via its own loopback fetch, so
this doesn't break the legitimate pairing flow.

**Fix 3 — dead signature-verification write (`Mobile-app/App.tsx:300`,
`src/utils/deviceIdentity.ts`):** the phone stored `desktopPublicKey` (RSA
SPKI PEM, received at `device_paired`) but never used it.
`broadcastCommandApprovalRequired` (`companionHub.ts`) already signs
`command_approval_required` messages with the desktop's RSA key
(`signPayload` in `security.ts`). Added `verifyDesktopSignature()` (new dep:
`node-forge` + `@types/node-forge`, since RN has no built-in RSA-PEM verify)
and wired it into the `command_approval_required` handler: if a
`desktopPublicKey` has been received (post-pairing), the message's
`signature` is verified against `${sessionId}:command_approval_required:
${commandId}` before the approval modal is shown; a bad/missing signature is
dropped silently (logged only). Pre-pairing connections (no
`desktopPublicKey` yet) skip this check — acceptable because Fix 1 already
ensures `APPROVE_COMMAND`/`REJECT_COMMAND` from an unpaired connection can't
execute anything regardless of what the UI shows. Added `desktopPublicKeyRef`
(mirrors the `desktopPublicKey` state) so the long-lived `ws.onmessage`
closure sees the value set at pairing rather than a stale `null`.

**Verification:** Mobile-app `npm install` (pulls in `node-forge`), `tsc
--noEmit` clean, 46/46 vitest. Desktop-app `tsc -b --noEmit` clean, 273/274
vitest (1 pre-existing intentional fail), including 70/70 across
`tools.command_classification.test.ts` +
`companionHub.signedMessages.test.ts` + `companionHub.pairingV2.test.ts`, and
34/34 across the route-integration suites covering
`/api/companion/pairing-code` and `/api/companion/status`.

## Phase 1 — P1 pricing unification across Mobile/Web/Desktop (2026-06-15)

**Finding (council re-audit P1(c)):** decision #1 sets the canonical pricing
ladder (Free $0 / Solo $5 / Solo Plus $9 / Founder $15, all
`status:'production'`, plus Agency `priceUsd:null`/`status:'preview'`,
excluded from `BUYABLE_TIER_IDS`) via `scripts/pricing.source.mjs` →
`scripts/generate-pricing.mjs` → `src/pricing.generated.ts`. Only
Desktop-app's backend (`server.ts`, `license.ts`) consumed it. All three
frontends still showed a stale ladder (Basic $2.99 / Pro $9.99 / Enterprise
$25) and/or hardcoded the current correct numbers without importing the
generated source — and Desktop-app's `ConfigHeader.tsx` rendered a clickable
Agency $39/mo subscribe button that dead-ends with a 400 "tier 'agency' is
not purchasable" (Agency is `priceUsd:null` and not in `BUYABLE_TIER_IDS`).

**Fix 1 — Desktop-app `ConfigHeader.tsx`:** now imports `TIER_PRICES`,
`BUYABLE_TIER_IDS` from `../pricing.generated`. The quick-pick subscription
grid and the detailed tier cards now render $5/$9/$15 from
`TIER_PRICES.{solo,solo_plus,founder}` instead of literals. The Agency entry
in both the quick-pick grid and the detailed tier list is no longer a
clickable `onSubscribe('agency')` button — it's now a non-purchasable
"PREVIEW" badge / "Preview · join waitlist" block, gated by checking
`BUYABLE_TIER_IDS.includes(tier.id)`.

**Fix 2 — Web-app `App.tsx`:** now imports `TIER_PRICES` alongside the
existing `TIER_LABELS`. `PRICING_MATRIX`'s "Monthly price" row now derives
from `TIER_PRICES` instead of a hardcoded `{free:'$0', solo:'$5', ...}`
object (values were already correct, but now track the source of truth).
Renamed all remaining old-ladder references — FAQ ("Basic 3, Pro 10,
Enterprise unlimited" → "Solo 3, Solo Plus 10, Founder unlimited"; dropped a
stale "Enterprise is billed annually" aside) and every upgrade-lock
toast/badge/modal (Cloud Sync, WebRTC Collab, Semantic Cache, Self-Healing
Rollback, RBAC simulator, mobile-sync-required modal): `BASIC+`/`PRO+`/
`ENTERPRISE` badges → `SOLO+`/`SOLO PLUS+`/`FOUNDER`, and $2.99/$9.99/$25
literals → `` `$${TIER_PRICES.solo}` ``/`solo_plus`/`founder` template
interpolations (each wrapped in a JSX expression `{...}` since the original
text was plain JSX children, not already inside `{}`).

**Fix 3 — Mobile-app:** `Mobile-app` was not a `generate-pricing.mjs` target
and had no `pricing.generated.ts`. Added it as a third target in
`scripts/generate-pricing.mjs` and created `Mobile-app/src/pricing.generated.ts`
with the same generated content as Desktop-app/Web-app (matches
`pricing.source.mjs` — regenerate via `node scripts/generate-pricing.mjs` to
keep in sync going forward). `App.tsx`'s mock-billing `userTier` state was
typed `'free'|'basic'|'pro'|'enterprise'` with matching UI strings/prices
($9.99/$25) throughout the Settings screen and the Cloud Sync lock modal —
retyped to `Exclude<TierId,'agency'>` (`'free'|'solo'|'solo_plus'|'founder'`),
and every label/price/gate updated: Semantic Cache Indexer and Self-Healing
Rollbacks now gate on `solo_plus`/`founder` (was `pro`/`enterprise`) with
`$${TIER_PRICES.solo_plus}` in the toast; RBAC Command Policy gates on
`founder` (was `enterprise`) with `$${TIER_PRICES.founder}`; the Account &
Billing Plan tier-picker row and the Cloud Sync lock modal now use
`TIER_LABELS`/`TIER_PRICES` (Solo `$${TIER_PRICES.solo}`) instead of
hardcoded Basic/$2.99.

**Verification:** Desktop-app `tsc --noEmit` clean, 432/432 vitest (1
pre-existing expected fail) including 52/52 in
`tools.command_classification.test.ts` (covers the `/*`/`~/*` wildcard
additions from the P1(a) follow-up, run for the first time in this pass).
Web-app `tsc --noEmit` clean, 13/13 vitest. Mobile-app `tsc --noEmit` clean,
46/46 vitest.
