# Kryleos Forge — Release-Readiness Implementation Plan

> **Source:** Synthesized from the 2026-06-14 Claude Council audit (14-agent, code-grounded) and a follow-up 6-agent verification pass that re-checked every citation against the source. Full verdicts in `.claude/council-synthesis.md` and `.claude/plan-verify-output.md`.
>
> **Goal of this iteration:** Make Kryleos Forge a genuine, honest, **invited-beta release-ready** product. When this plan is complete, the **only gaps requiring money/infra you've chosen to defer** are: **(1) Apple + Windows code-signing certificates**, and **(2 — optional) a relay service** for license revocation + internet companion. Everything else is either closed or an explicitly disclosed, defensible beta limitation.
>
> **Honest framing (from the verification pass):** A green QA gate is not a shippable product, and "only certs remain" was *not* true of the first draft — the packaged app could not even boot. This plan fixes that first. After it executes, certs become the only **external/funding** blocker; two limitations (offline-license revocation; OV-cert SmartScreen reputation burn-in) remain as *documented* beta realities, not hidden defects.
>
> **Scope guardrails (locked):**
> - **Certs deferred.** No Apple Developer / Windows OV cert purchase this iteration. Launch = **closed/invited beta** with a hand-held install path until certs land.
> - **Mobile + Web stay** as deliberate **companions** (remote brainstorm + remote execution approval). Load-bearing architecture, kept *thin*, never full coding IDEs.
> - **Ship less.** Cut over-claims and unbuyable tiers; add no net-new capability the engine doesn't already have (the no-key demo is the one sanctioned new build, because it is the launch artifact).
> - **Honesty is the moat.** Nothing simulated may be presented as delivered on any paid/public surface — including legal copy, badges, and the readiness score itself.

---

## 0. Operating Principles

1. **Boot before truth before features.** It must install and run (Phase 1); then it must tell the truth (Phase 2); net-new features stay out of scope.
2. **Two non-negotiables for product quality:** (a) the core PLAN→FORGE loop is **proven against a real model**, and (b) the **"complete" verdict is trustworthy** (no false "done"; no partial trace shown as clean green).
3. **Every phase has a hard, *machine-checkable* exit gate.** The readiness gate itself must be trustworthy before it is trusted (see Phase 1).
4. **The canonical readiness signal** is a **hardened** `qa/scripts/release-score.mjs` (≥ 8.5) **plus** a manually-verified Definition-of-Release-Ready checklist — *not* the retired `RELEASE_QA_REPORT` 9.8, and not the current gameable scorer.
5. **Zero-to-low cost only.** Gumroad/Stripe = no upfront fee; GitHub Releases = free update host; Tailscale private-mesh = free companion transport. The one deferred paid item is certs.

---

## 1. Decisions Locked Before Coding (Day 1–2)

Decide once, encode once. Record in a new `DECISIONS.md` at repo root.

| Decision | Locked choice | Rationale / verified note |
|---|---|---|
| **Canonical pricing ladder** | Free $0 / Solo $5 / Solo Plus $9 / Founder $15 — **Agency/Team = "Preview · join waitlist" (not buyable)** | Resolves 3 contradictory ladders: web `TIER_PRICES` `Web-app/src/App.tsx:43` (`$2.99/$9.99/$25`) vs backend `priceMap` `Desktop-app/src/backend/server.ts:855-860` vs brief. Agency has no real multi-tenant infra → waitlist only. |
| **Payment processor** | **Gumroad** (primary) — independent, stable license-key API | **Do NOT depend on Lemon Squeezy's standalone API** (Stripe-acquired, on a sunset trajectory toward Stripe Managed Payments). Fee reality: Gumroad ~**10% + $0.50** vs LS/Stripe ~5% + $0.50 — material at $5 ASP (~20% vs ~15%); accept it for license-API stability. Offline validation keeps the processor **swappable**. |
| **Monetization mechanism** | Gumroad hosted checkout → emailed key → **offline signature validation** (embedded public key) with **short expiries (30–90d, re-issued on renewal)** | Zero infra, no PCI burden, no card form on our site. **Known limitation:** offline-only has **no revocation** of an already-issued valid key before expiry — documented, mitigated by short expiries (and optional HWID binding). True revocation needs the deferred relay. |
| **Stripe's fate** | **Remove** `create-checkout-session` + the webhook + the `stripe` dep for beta (or keep *only* if Gumroad is dropped) | A live Stripe webhook (`server.ts:230-294`) silently grants tiers and would contradict the "no card form" gate. One processor only. |
| **Shared module resolution** | Pick one — **npm workspace / tsconfig path-alias + bundler copy / generated constants file** — and **verify it survives the packaged Electron build**, not just `tsc --noEmit` | `Web-app` and `Desktop-app` are **separate top-level packages**; an out-of-package import can pass tsc and break the bundle. This is the load-bearing detail of the "trivial" pricing-unification task. |
| **Companion connectivity (beta)** | **Same-LAN + Tailscale private-mesh / Serve** (stable MagicDNS, no interstitial). ngrok = fallback only. **Internet relay deferred.** | **Never steer users to Tailscale Funnel / public exposure** of a shell-command-approval endpoint (Tailscale's own docs warn against it; Funnel hostnames leak via CT logs). ngrok free tier regressed in 2026 (2h cap, interstitial). |
| **Launch type** | **Invited / closed beta**, desktop-core + thin companions, BYOK | Honest mitigation for shipping unsigned. |
| **Readiness gate** | **Hardened** `release-score.mjs` ≥ 8.5 **+** manual checklist | The current scorer is gameable (see Phase 1 T2). |
| **Update channel** | `electron-updater` → **GitHub Releases**; interim posture = **check-and-notify-to-redownload** | Unsigned macOS **cannot auto-apply** updates (Squirrel.Mac requires a signature); unsigned Windows needs the Authenticode verifier disabled until signed. Auto-apply is part of the deferred cert work. |

**Exit gate:** `DECISIONS.md` written with all eight choices; shared-module resolution strategy chosen and proven against a packaged build.

---

## Phase 1 — Make It Build, Boot & Measure Honestly *(Week 1 · effort M · FOUNDATION)*

**Goal:** The thing installs, launches standalone, and is measured by a gate that can't lie. Nothing downstream means anything until this is true. *(This is the blocker the first draft missed.)*

**Tasks:**
1. **Give the packaged app a production run path (BLOCKER).** *(verified: `Desktop-app/src/backend/electron.cjs:171-187` only `loadURL`s the Vite dev server; backend is started only by the `dev` script `package.json:8`; no script runs `electron-builder`; `build` is just `tsc -b && vite build` `package.json:10`; neither `electron-builder` nor `electron-updater` is installed.)*
   - In `electron.cjs`, when not in dev, `loadFile(path.join(__dirname,'../../dist/index.html'))` instead of the dev-server `loadURL`.
   - Start the Express backend **in-process (or forked child)** from the main process on an **ephemeral port the renderer discovers**, so the install is self-contained.
   - Add an `npm run dist` `electron-builder` script; install `electron-builder` + `electron-updater`; wire the GitHub Releases `publish` feed.
   - Smoke-test the built artifact: it installs and reaches the first screen **with no dev server running**.
2. **Harden the readiness gate before trusting it.** *(verified: `release-score.mjs:125` scores e2e by file existence (`existsSync`) — already banked on scaffolding; `:200` hardcodes `openHighFindings = 1`; comments pre-credit Phase 2/3 work.)* Derive e2e/unit weight from tests **passing** (exit codes), not file presence; remove the hardcoded findings count and optimistic comments; add automated assertions for the per-phase gates (grep public surfaces clean of "only"/"Matrix-Coding"; forged-tier `curl` returns 403; packaged-app smoke passes; no canned-reply string in `PreviewDeck`).

**Exit gate:** `npm run dist` produces an installer that **boots to the app with no dev server**; the hardened scorer reflects real pass/fail and cannot read ≥ 8.5 on scaffolding.

---

## Phase 2 — The Honesty Pass *(Week 2 · effort S–M)*

**Goal:** Every public **and** in-app surface tells the same, true story — including legal copy and badges.

**Tasks:**
1. **One pricing source of truth.** Create the shared pricing module (per the Phase-0 resolution choice); import in the Web pricing page (`Web-app/src/App.tsx:43` `TIER_PRICES`, comparison row `:65`, hero copy `:1619-1621`/`:1680`/`:1703`), Mobile, and backend `priceMap` (`server.ts:855-860`). Delete the divergent ladders.
2. **Kill the "only" claim everywhere** (hero, README, onboarding, brochure, pricing). *(false as of Jan 2026)*
3. **Reposition the hero** on the three *real* claims: **local-first (code never leaves your machine) + inspectable proof-of-work (the trace) + remote supervision (approve your local agent from your phone).**
4. **Badge or hide every simulated row** on public pricing (Remote containers, Team workspaces, RBAC, SSO — `Web-app/src/App.tsx:80-89`) via the existing `featureStatus`/`FeatureBadge` mechanism.
5. **Make the "KEYCHAIN SECURED" badge truthful, not gone.** *(verified nuance: `electron.cjs:103-134` DOES implement real `safeStorage` with an AES-256 fallback; `App.tsx:71/413/465` wires keys through it. The badge at `ConfigHeader.tsx:659` is **conditionally** true.)* Drive the badge from the existing `isEncryptionAvailable()` IPC: show "OS keychain secured" only when available, "encrypted local store" on fallback — never an unconditional pulsing "SECURED."
6. **Reconcile + surface legal copy.** *(verified: `terms.md:18-21` + `privacy.md:22-23` describe Stripe recurring billing + "Stripe Billing Customer Portal" cancellation — false after Phase 4; no Privacy/Terms route exists in `Web-app/src` — only the "Zero-Egress Privacy" headline at `App.tsx:1584`.)* Rewrite `Project-Documents/launch/terms.md` (§3) + `privacy.md` (§4) to the Gumroad-MoR + offline-key model (real cancel/refund channel; disclose the refunded-key-works-until-expiry limitation). **Link Privacy + Terms** in the web footer and the desktop first-run/checkout flow; **require acknowledgement before the first agent shell-command run.** *(Project-Documents is "locked" — unlock these two launch files for this task.)*
7. **Retire the 9.8 report.** Mark `RELEASE_QA_REPORT.md` superseded; adopt the hardened scorer + "beta/invited" verdict; remove stale "Matrix-Coding" naming and mockup-as-"live-capture" claims; reconcile the brochure/`17-Mobile-Companion`/`User-Guide` to the shipped **Scratchbook** model and fix the 4-vs-5-spaces contradiction.

**Exit gate:** One ladder everywhere; grep for "only"/"Matrix-Coding" clean on public surfaces; no simulated feature shown as delivered; the secured-storage badge matches actual backing; Privacy/Terms are accurate, reachable, and acknowledged before first command.

---

## Phase 3 — Trustworthy Core *(Weeks 3–4 · effort M)*

**Goal:** The two non-negotiables. This is what the whole pitch rests on.

**Tasks:**
1. **Comment/string-aware + workspace-scoped criteria matching.** *(verified nuance: `planningV2.ts:846` ALREADY builds a word-boundary regex `(?<![\w$])${escaped}(?![\w$])`, proven by `planningV2.integration.test.ts:144-167` — do **not** rebuild it.)* The genuine net-new work: (a) **comment/string-stripping** so a symbol in a comment doesn't pass, with a per-file-type strategy (AST for JS/TS; comment-strip fallback for `.md`/`.json`/`.txt` in the text corpus); (b) tighten `resolveWorkspace` (`:183-187`) — its full-root fallback and naive `startsWith` containment (sibling-prefix bug: `/root` vs `/root-evil`). Regression test: a symbol that appears **only in a comment** must **not** mark the criterion complete.
2. **Promote `llm_check` to a real standalone evaluator** *(today returns `unknown` synchronously, resolved only opportunistically in `saveTrace:950-1003`)* — an on-demand criterion with a budgeted, cached model call.
3. **One Ollama-backed FORGE end-to-end test in CI.** Plan item → agent edits a real file → criteria evaluate → trace written to `.kryleos/traces/`. The first time the money path runs under a real model in test.
4. **Provider contract tests — beta-scoped.** Cover **Ollama + one paid client** for the beta (recorded fixtures/nock). *(Full 7-provider matrix demoted to post-beta — see Timeline.)*

**Exit gate:** A comment-only match does **not** mark complete (regression test proves it); the Ollama FORGE e2e is green in CI; Ollama + one paid provider have passing contract tests.

---

## Phase 4 — Honest, Enforceable-Enough Monetization *(Week 5 · effort M)*

**Goal:** A user can pay and unlock; tiers can't be unlocked by editing JSON, `curl`-ing the local server, or pasting a well-formed-but-unsigned key. No dark patterns, no second granting path.

**Tasks:**
1. **Route purchase to Gumroad hosted checkout; remove the fake card form** *(today the web "Pay" validates a card then never calls the real endpoint at `server.ts:843`, which also has a mock short-circuit `:863-868`)*.
2. **License-key entry + offline signature validation** (Ed25519/RSA over `{tier, expiry}`, embedded public key, no server round-trip), with **short expiries re-issued on renewal** and optional HWID binding. **Replace the existing bypass:** `handleRedeemLicense` (`ConfigHeader.tsx:230-241`) currently activates **any** well-formed `KRYLEOS-(SOLO|SOLOPLUS|FOUNDER|AGENCY)-XXXX-XXXX` string via `onSubscribe(tier)` with no signature — rip it out and add a test that a well-formed-but-**unsigned** key is **rejected**.
3. **Remove ALL tier-from-request-body/query trust.** *(verified: not just the 3 first cited — also `server.ts:835` (subscribe), `:848` (checkout), `:2234` (`req.query.tier`), `:2310`, `:2478`, `:2624`, `:2660`, `:2856`.)* Derive tier from the validated license/session. Add a **grep/regression gate**: no route derives `tier` from `req.body`/`req.query`.
4. **Retire or quarantine Stripe** (per Phase-0 decision): remove `create-checkout-session` (`:843`) + the webhook (`:230-294`) + the `stripe` dep, **or** document Stripe as the one chosen processor. No second path may grant a tier.
5. **Define refund/expiry/offline edge UX:** documented refund flow via Gumroad; clear offline messages for expired/invalid/clock-skewed keys (grace window + re-enter path).

**Exit gate:** A real test purchase issues a key that unlocks the tier; a malformed/tampered/**unsigned** key is rejected; editing local JSON or forging a `tier` over the API no longer escalates (grep gate green); **no live Stripe entitlement path remains**; expired/refunded-key behavior is defined and tested. *(Honest limit: revocation of an already-issued **valid** key before expiry is a documented beta limitation.)*

---

## Phase 5 — Companion Sync, Remote Execution & Hardening *(Weeks 6–7 · effort M–L)*

**Goal:** Make the mobile/web companion a real remote control for FORGE over the LAN / a Tailscale mesh — **drive and supervise execution from the phone** — and secure that path, since it is the most security-critical surface in the product. *(Internet "from anywhere" with no tunnel = the post-beta relay; see the Gaps table.)*

**What already exists (verified — build on it, don't rebuild):** the companion WS (`companionHub.ts`) + mobile client (`Mobile-app/App.tsx:221-409`) already do remote **APPROVE / REJECT / STOP** of a running FORGE workflow (`companionHub.ts:121-180`) and push planning notes to the desktop scratchbook. The transport is a direct WS to the desktop (`backendUrl`, `Mobile-app/App.tsx:136`) — LAN or a user-pasted tunnel URL. So *remote supervision* is done; the gaps are *initiation*, *state sync down*, *off-LAN transport*, and *security/honesty*.

**Tasks:**
1. **Remote FORGE-run *initiation*.** Add a signed `START_FORGE_RUN` companion message (plan-item id + workspace) that routes into the existing "Send to FORGE" orchestrator entry point, so the phone can **launch** work, not only approve/stop it. *(today: no trigger verb exists — only approve/reject/stop.)*
2. **Session-state sync *down* to the companion.** Stream the live Forge session to paired devices via `broadcastToCompanions`: board/task status, the active run's agent log, criteria pass/fail, and the resulting trace. **Replace the simulated `Math.random()` telemetry** (`companionHub.ts:26-32`) with real run/session state. *(today: companion gets only connection status + fake telemetry + approval prompts — it can't actually "see" the session.)*
3. **Raise pairing strength on top of the existing mitigations.** *(verified: `companionHub.ts:49-92` already has `crypto.randomInt`, a 10-min TTL, `crypto.timingSafeEqual`, and a 5-attempt/60s lockout — do not rebuild these.)* Add **higher entropy + QR + ephemeral key exchange + a revocable per-device token**; shorten the pairing window.
4. **Sign remote approvals AND initiations.** Wire the existing-but-unused `security.ts:37/45` `signCommandApproval`/`verifyCommandApproval` (RSA-SHA256) into the approval **and** the new initiation channel *(today: plain `commandId` string-matching, `companionHub.ts:122-138`)*, so neither a tampered message nor (later) a compromised relay can forge an approve/run.
5. **Strengthen *what* a remote command can do.** *(verified: `tools.ts:671-722` blocklist is shallow AND overbroad — `rm -rf ~`/`$HOME`/`find -delete` pass, while whole-word `/kill/` and `/format/` break `npm run format`, `git format-patch`.)* Add a real allow/deny policy in UI, input normalization (defeat `~`/`$HOME`/quoting/pipe evasions), an explicit "this is destructive" confirmation for remote approvals, and remove the overbroad word blocks.
6. **Remote audit trail.** Extend the existing `.kryleos/command_approvals.json` (already written by the local path) with **device id + remote-source** fields for every remote initiation/approval.
7. **Honest connectivity copy + simulated-claim purge.** Default tunnel guidance to **Tailscale private-mesh** (explicit warning against public/Funnel exposure); ship **only after** tasks 3–5 land. Remove the fake "**WebRTC pair-programming rooms** / upgrade to **Enterprise**" copy (`Mobile-app/App.tsx:1430`) and "Enterprise preview for pair-session indicators" (`:1218`).
8. **Rewrite `companion-pairing.e2e.ts`** *(hard-asserts a 6-digit code at `:35-57`)* to the new pairing — lands **with** Phase 5, not after.

**Exit gate:** From a paired phone on LAN/Tailscale, a user can **launch** a FORGE run, **watch** its live board/log/trace, and **approve/reject/stop** it; every remote initiate/approve is signed, verified, audited; a phone-approved `rm -rf ~/work` is blocked/confirmed, not silently run; no simulated telemetry or "Enterprise pair-programming" copy remains; companion e2e green.

---

## Phase 6 — Activation & First-Run *(Weeks 7 · effort M; start the demo in Week 3)*

**Goal:** A stranger reaches a green trace in **under 2 minutes**, with no API key — and never hits a dead end.

**Tasks:**
1. **No-key Demo Project (net-new build — start it in Week 3).** A bundled sample repo + plan whose first "Run in FORGE" produces a **green acceptance-criteria trace** with no provider configured (deterministic/replayed run, clearly labeled "demo"). It depends only on the stable trace/criteria format, so build it early; it doubles as a test fixture for Phase 3.
2. **Free-path-first defaults.** *(verified: `App.tsx:82` defaults to paid `deepseek-chat`; `App.tsx:2254` `hasProvider` omits `ollamaUrl`, so Ollama-only users read as "no provider" at `ProjectSetupScreen.tsx:134`.)* Detect Ollama and count it in `hasProvider` (audit all ~20 `ollamaUrl` call sites); stop defaulting to a paid provider.
3. **Scratchbook starter prompts**; **persistent 3-step activation checklist** (connect model → run demo trace → point at your repo).
4. **Trace = hero artifact.** Surface the per-criterion pass/fail + files-changed + commands-run proof-of-work card prominently.
5. **Narrow the Preview Deck gate.** Keep **Files + Review + tracing**; **make the Side Chat tab call a real model or delete it** *(today `PreviewDeck.tsx:106-118` returns a canned "Context note queued" string)*.
6. **First-run error UX** for the common failures: no provider, Ollama missing, model downloading, invalid/expired key, companion host not found — each a clear message + next action, never a dead end.

**Exit gate:** On a clean machine with no key, first green trace in < 2 min; Ollama users never told "no provider"; no tab fakes an AI reply; the top first-run errors produce actionable messages.

---

## Phase 7 — Polish, Crash-Safety & Real-Runtime QA *(Weeks 8–9 · effort M–L)*

**Goal:** Replace dev-server claims with packaged-runtime evidence; make the trace crash-safe; close the security/privacy hygiene gaps.

**Tasks:**
1. **Fix live UX defects + sanitize the new renderer (security).** Fix literal `**markdown**` rendering by rendering **through a sanitizer (DOMPurify or sanitize-html)** added on task-content render/write *(verified: zero sanitizer in `Desktop-app/src` today — adding a renderer without it reopens stored XSS / SEC-7)*; fix duplicate login POST; add mobile hamburger nav.
2. **Crash-safety + atomic traces.** *(verified: no `uncaughtException`/`unhandledRejection`/`crashReporter` in `electron.cjs`.)* Add global handlers (+ optional `crashReporter`); write traces atomically (temp file + rename); on next launch, detect an interrupted run and mark it failed/recoverable. **Label any FORGE run that hit `maxSteps=15` or history-compression as incomplete** so a partial trace is never shown as clean green.
3. **Data-deletion / credential-clear.** *(verified: no such handler in `Desktop-app/src`; `06-Data-and-Storage.md` + `07-Security-and-Privacy.md` flag it required.)* Add a "Clear stored credentials / wipe local data" action in CONFIG + an uninstall note on what remains under `.kryleos/`/userData.
4. **Re-measure performance on the packaged Electron build** (cold start, memory) — replace the dev-server `1.7s/67ms` numbers.
5. **Wire the existing e2e into CI + add a packaged-Electron driver.** *(verified: e2e files exist for all three apps, but only Web-app has an e2e npm script; `ci.yml` runs only `npm test` = vitest + lint — Playwright runs in no CI job.)* Add `test:e2e` scripts for Desktop/Mobile, run them in CI, and build the genuinely net-new **packaged-binary Playwright driver**.
6. **Soak + stress:** 30-min session soak + 1,000-file workspace stress; record results. **(Incremental commit-hash drift cache demoted to post-beta — perf, not a correctness gate.)**

**Exit gate:** Packaged-build perf recorded; markdown rendered **sanitized** (an injected `<img onerror>` does not execute); crashes can't corrupt a trace; partial runs are labeled; data-wipe works; e2e runs in CI and a packaged-binary smoke passes.

---

## Phase 8 — Launch Readiness & Demand Validation *(Week 10 · effort S–M)*

**Goal:** Everything needed to open an invited beta — except certs.

**Tasks:**
1. **Differentiator reality check** on a realistic **8B-quant local model** (`llm_check`/Diverged/"What's Left"). If they degrade, sell privacy as a *configurable mode* and demo on a strong model.
2. **Launch assets:** the **60-second trace GIF** and the **companion-approval clip** (approve a command from the phone).
3. **Public "What's real vs. preview vs. simulated" page** (published after Phase 2).
4. **Hand-held install guide** past the SmartScreen/Gatekeeper warning, with a transparent "why unsigned (certs coming)" note. *(Keep it live past cert purchase — an OV cert needs SmartScreen reputation burn-in; only EV earns instant trust.)*
5. **Demand signal:** recruit **1 design partner + a 25–50 person waitlist** with intent before treating revenue as a plan.

**Exit gate:** Hardened `release-score.mjs` ≥ 8.5; the **Definition of Release-Ready** checklist green except certs; assets + waitlist exist.

---

## Definition of Release-Ready (Invited Beta) — Final Checklist

- [ ] `npm run dist` installer **boots standalone to first green trace, no dev server**.
- [ ] One pricing ladder everywhere; no simulated feature shown as delivered; "only" claim gone; secured-storage badge matches actual backing.
- [ ] Privacy + Terms accurate to the Gumroad/offline-key model, reachable, and acknowledged before first shell command.
- [ ] "Complete" verdict trustworthy (comment/unrelated-file matches rejected; partial/crashed runs labeled, not green; regression-tested).
- [ ] PLAN→FORGE loop proven against a real model in CI (Ollama e2e) + Ollama/one-paid contract tests.
- [ ] Real Gumroad checkout issues a license; unsigned/tampered key rejected; forged `tier` over API/JSON no longer escalates (grep gate); **no live Stripe path**; expired/refunded-key UX defined.
- [ ] From a paired phone (LAN/Tailscale): **launch** a FORGE run, **watch** live board/log/trace, and **approve/reject/stop**; pairing high-entropy + key-exchanged + expiring; remote initiate/approve signed/verified/audited; destructive remote commands gated; no simulated telemetry or "Enterprise pair-programming" copy; companion e2e green.
- [ ] First green trace < 2 min, no key; Ollama counted; no fake AI tab; first-run errors actionable.
- [ ] Markdown rendered **sanitized**; crash-safe atomic traces; data-wipe/credential-clear works; packaged-Electron perf measured; e2e runs in CI.
- [ ] Hardened `release-score.mjs` ≥ 8.5 (reflects real pass/fail); 9.8 report retired; docs match shipped UX.
- [ ] Launch assets + hand-held install guide + design partner/waitlist in place.

---

## The Gaps That Remain After This Plan (and why)

| Gap | Status | Closeable by |
|---|---|---|
| **Apple + Windows code-signing certs** | **Deferred (funding).** Unblocks public GA without malware warnings + trusted auto-**apply** updates. ~$99/yr Apple + Windows OV (or EV). | Buying certs. Then: macOS = mostly config + a notarization CI step; **Windows = a small task** (electron-updater Authenticode verify + `publisherName` must exactly match cert CN). |
| **OV-cert SmartScreen reputation burn-in** | **Documented reality.** Even after buying an OV cert, first-launch warnings persist for a window (only EV earns instant trust). | EV cert, or time + download volume. Keep the install guide live past cert day. |
| **Offline-license revocation** | **Documented beta limitation.** A refunded/leaked **valid** key works until its signed expiry. Mitigated by short expiries (+ optional HWID). | The optional **relay/entitlement service** (post-beta) — the same service closes this *and* the row below. |
| **Companion remote-from-anywhere (off-LAN, no tunnel)** | **Deferred to post-beta.** The beta companion **launches, watches, and approves/stops** FORGE over LAN / a Tailscale mesh (real). True "desktop online → phone just works" with zero network setup needs a rendezvous broker. | The **relay broker** (cheap always-on: Cloudflare Durable Objects / Fly.io / ~$5 VPS). **Execution stays on the desktop — the relay only brokers signed control traffic — so the local-first promise holds.** This is also the honest paid "remote anywhere" tier. |

**Bottom line:** After this plan, the only gap requiring **money you've chosen not to spend yet** is code-signing certs. The other items are honest, disclosed limitations of the low-cost choices — defensible for an invited beta. The optional **relay** closes two of them at once (license revocation **and** companion-from-anywhere) and is the natural first post-beta paid build — but note the beta companion already **launches, watches, and supervises** FORGE over LAN/Tailscale.

---

## Council/Verification Finding → Phase Traceability

| Finding | Addressed in |
|---|---|
| **Packaged app can't boot (no production run path)** | **Phase 1 T1 (BLOCKER)** |
| Gameable readiness score (file-existence, hardcoded findings) | Phase 1 T2 |
| 3 contradictory pricing ladders | Phase 2 T1 |
| "Only" category claim false | Phase 2 T2 |
| Simulated rows shown as delivered | Phase 2 T4 |
| Fake "KEYCHAIN SECURED" badge | Phase 2 T5 |
| Legal docs false post-migration + unlinked | Phase 2 T6 |
| 9.8 QA theater / stale docs | Phase 2 T7 |
| "Complete" can lie (comments/cross-file/scope) | Phase 3 T1 |
| `llm_check` deferred | Phase 3 T2 |
| Zero real-LLM e2e on money path | Phase 3 T3 |
| Provider clients untested | Phase 3 T4 (beta-scoped) |
| Fake checkout / card form charges nothing | Phase 4 T1 |
| Client-side regex license bypass (`handleRedeemLicense`) | Phase 4 T2 |
| Tier-from-body un-enforceable gate (9 sites) | Phase 4 T3 |
| Live Stripe webhook still grants tiers | Phase 4 T4 |
| Offline-key revocation / refund UX | Phase 4 T5 + documented limitation |
| **Mobile/web can't launch or see a FORGE session (your ask)** | **Phase 5 T1 (remote launch) + T2 (session-state sync down)** |
| Simulated companion telemetry + fake "WebRTC/Enterprise" pair-programming claims | Phase 5 T2 + T7 |
| Weak 6-digit pairing (entropy/key-exchange) | Phase 5 T3 |
| Unsigned remote approvals/initiations | Phase 5 T4 |
| Shallow + overbroad command blocklist | Phase 5 T5 |
| Companion e2e asserts 6-digit | Phase 5 T8 |
| Activation: paid default, "no provider", slow aha | Phase 6 T1–T3 |
| Preview Deck Side Chat fakes AI | Phase 6 T5 |
| First-run error UX | Phase 6 T6 |
| Stored XSS reopened by markdown renderer | Phase 7 T1 |
| No crash recovery / atomic trace writes / partial-trace labeling | Phase 7 T2 |
| No data-deletion / credential-clear | Phase 7 T3 |
| Dev-server perf numbers | Phase 7 T4 |
| e2e not wired to CI; no packaged-runtime driver | Phase 7 T5 |
| Unsigned binary / auto-update | **Deferred (certs)** + feed wired (Phase 1) |
| Local model degrades the "wow" tiers | Phase 8 T1 |
| No demand evidence | Phase 8 T5 |

---

## Timeline & Sequencing Notes (solo founder, honest)

- **~11–12 weeks serial.** A solo founder runs phases **serially** — there is no second worker, so the earlier "Phase 1 ∥ Phase 2" parallelism is removed. Phases 3, 5, and 7 each contain a genuine M/L item (real-model e2e; companion remote-launch + session-sync + pairing crypto + command-content gate; packaged-binary driver) that consumes most of its time. **Phase 5 grew to ~1.5 weeks** when remote initiation + session-state sync were added (your companion-sync requirement), shifting later phases by ~1 week.
- **Critical path:** Phase 1 (boot + trustworthy gate) → Phase 2 (pricing source of truth) → Phase 4 (checkout depends on it). The **no-key demo (Phase 6 T1) is net-new build — start it in Week 3** (it depends only on the stable trace format), so a slip in later weeks doesn't drop the launch screenshot.
- **Hard ordering:** Phase 5 (new pairing) **must precede** the Phase-7 e2e-green work for the companion suite (it rewrites `companion-pairing.e2e.ts`). Phase 5 command-content hardening **must precede** any tunnel guidance.
- **Demoted to post-beta** (to protect the window): the full 7-provider contract matrix (keep Ollama + one paid), the incremental commit-hash drift cache (perf, not correctness), and the RNTL mobile harness (mobile is a thin companion; web e2e covers most). The **relay/entitlement service** (true license revocation + internet companion) is the deliberate post-beta build.
- **Do-not-do this iteration:** team/RBAC infra, internet relay, marketplace, VS Code extension publish (the in-tree `kryleos-forge-vscode/` stays unbuilt — it is not dead code), net-new engine features beyond the no-key demo.
