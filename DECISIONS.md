# Kryleos Forge — Locked Decisions (Phase 0)

Decided once per `IMPLEMENTATION_PLAN.md` §1, encoded once. Do not re-litigate these
during implementation — if a decision turns out to be wrong, update this file and the
plan together, with a note on why.

| # | Decision | Locked choice | Rationale |
|---|---|---|---|
| 1 | **Canonical pricing ladder** | Free $0 / Solo $5 / Solo Plus $9 / Founder $15 — **Agency/Team = "Preview · join waitlist"** (not buyable) | Resolves the 3 contradictory ladders (Web `App.tsx:43` `$2.99/$9.99/$25`, backend `priceMap` `server.ts:855-860`, brief `$5/$9/$15/$39`). Agency has no real multi-tenant infra. |
| 2 | **Payment processor** | **Gumroad** (primary) | Independent license-key API; Lemon Squeezy is on a sunset trajectory toward Stripe Managed Payments. ~10%+$0.50 fee accepted for license-API stability. |
| 3 | **Monetization mechanism** | Gumroad hosted checkout → emailed key → **offline signature validation** (embedded public key), short expiries (30-90d, re-issued on renewal) | Zero infra, no PCI burden, no card form on our site. Known limitation: no revocation of an already-issued valid key before expiry — mitigated by short expiries + optional HWID binding. |
| 4 | **Stripe's fate** | **Remove** `create-checkout-session`, the webhook, and the `stripe` dep | One processor only; a live webhook silently granting tiers contradicts the "no card form" gate. |
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
