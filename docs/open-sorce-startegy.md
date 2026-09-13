# Kryleos Forge — Open Source Strategy

Status: proposed, awaiting execution
Owner: yassin.muhammed@gmail.com
Prepared: 2026-09-13

## 1. Goal

Convert Kryleos Forge from a monetized/gated product into a **free, open-source,
BYOK (bring-your-own-key)** developer tool: a project-management workflow
(Kanban-style task execution) wrapped around terminal-capable AI coding agents
(Claude Code today, pluggable to others later). No account login, no payment
processing, no license tiers. Installable straight from a terminal command and
from GitHub releases on **Windows, Linux, and macOS**.

Not in scope for this doc: iOS. Apple's sandboxing model blocks
terminal-install and direct GitHub-binary install entirely — iOS software can
only ship through the App Store / TestFlight. The existing `Mobile-app/`
(Expo/React Native companion) already targets that channel separately and is
untouched by this plan.

## 2. Current state (audit findings, 2026-09-13)

**Completeness: beta, not production.** The project's own QA docs
(`RELEASE_QA_REPORT.md`) already concluded this — an earlier "9.5/10 ready"
self-assessment was retracted as overstated. Core loop is more built than a
rewrite would need:

| Stage | State | Evidence |
|---|---|---|
| Core shell (Electron/React/Express, WebSocket, multi-provider model routing incl. Ollama) | Functional | `src/backend/server.ts`, `ollama.ts`, `openai.ts` + passing tests |
| PLAN (ideation) | Functional/partial | `PlanningScreen.tsx`, `planningV2.ts` |
| CREW (specialist review personas) | Partial, just landed | `crewPersonas.ts`, `CoworkSpace.tsx` |
| FLOW (Kanban, drift detection, dependencies) | Functional | `ProjectBoard.tsx`, Build Loop V2 |
| FORGE (agent execution, command approval/abort) | Functional | `agents.ts`, `tools.ts`, approval audit tests |
| Preview Deck (file browser, live preview, terminal, code review) | Partial, deliberately deferred scope | `PreviewDeck.tsx`, `InteractiveTerminal.tsx` |
| VS Code companion extension | Partial, unfinished verification | `kryleos-forge-vscode/src/extension.ts` |

**Terminal / agent execution — already real, not a stub:**
- Genuine PTY terminal (`node-pty` + xterm.js) in `terminalManager.ts` /
  `InteractiveTerminal.tsx`, with a command classifier that pauses destructive
  commands for human approval before they reach the shell.
- `claudeCodeRunner.ts` shells out to the **actual `claude` CLI binary**
  (discovery, JSON/print/stdin negotiation, env sanitization) — not a
  reimplementation, not raw API calls.
- Command approval + audit trail already implemented and tested
  (`.kryleos/command_approvals.json`).
- Gaps: no MCP client/server (spec'd in `docs/17-tool-api-mcp-provider-integration.md`,
  not built), Claude Code output is buffered rather than streamed live through
  a PTY, and the runner is Claude-Code-specific rather than a pluggable
  interface for other CLI agents (Codex CLI, Gemini CLI, etc.).

**Payment/login gating — cleanly separable, no phone-home dependency**
(license verification is offline Ed25519; no license server to shut down):

- Backend, mostly trivial whole-file deletes: `license.ts`, `razorpay.ts`,
  `sync.ts` (the entire fake "cloud account" system), Stripe wiring in
  `server.ts`, `/api/auth/*`, `/api/billing/*`, `/api/license/*` routes,
  `scripts/issue-license.mjs`, billing test files.
- Frontend, needs detangling (not deletion — the underlying features stay,
  gates come off): `App.tsx` (Desktop + Web), `ConfigHeader.tsx`,
  `PlanningScreen.tsx` all thread `tier`/`isPremium`/`user` through core UI
  state. Semantic indexing is currently hard-gated behind Pro/Enterprise in
  `tools.ts` — that gate is deleted, the feature becomes free.
- `scripts/pricing.source.mjs` / `pricing.generated.ts` / `TierId` is a
  codegen'd type imported across Desktop-app, Web-app, and Mobile-app — must
  be removed project-wide, not just in one app.
- **Must be preserved** — not payment-related despite living nearby:
  `LOCAL_SESSION_SECRET` (protects the local command-execution server from
  other local processes), companion device pairing (`COMPANION_AUTH_TOKEN`,
  QR pairing for the mobile companion), per-install encryption seed
  (`OS_FINGERPRINT`). These are real security boundaries, not monetization.
- Docs to retire and replace with a short "free, BYOK, open-source" section:
  `docs/10-monetization-tiers-and-gating.md`,
  `Project-Documents/11-Subscription-and-Feature-Tiers.md`,
  `Project-Documents/13-Growth-and-Pricing-Strategy.md`.

**Market position:** closed IDEs (Cursor, Windsurf, Antigravity) sell
convenience via metered backends; open BYOK tools (Cline, Aider, Zed) are
excellent at a single chat/edit loop but treat tasks as ephemeral
conversations. The two prior attempts at open-source + BYOK + kanban +
terminal-agent wrapping — Vibe Kanban and Kandev — are either orphaned
(Vibe Kanban's company, Bloop, shut down) or a thin community skill on top of
someone else's CLI. Nobody currently ships a maintained, opinionated product
doing what Forge's PLAN → CREW → FLOW → FORGE loop already does.

## 3. Differentiation to lean into once open

1. Kanban cards carry structured spec/acceptance-criteria/diff-review state
   that survives agent crashes and model swaps — task state as source of
   truth, not a chat log.
2. Multi-agent-per-card with git-worktree isolation and a review lane before
   merge.
3. Model-agnostic worker pool: generalize `claudeCodeRunner` so Codex CLI /
   Gemini CLI / other agent CLIs plug in the same way (see Phase 4).
4. Dependency-aware task scheduling — agents self-pick up work unblocked by
   completed cards. No competitor in this space has this.
5. Self-hostable, exportable audit trail (command approvals, cost tracking)
   — fills the gap left by Vibe Kanban's disappearance, useful for
   regulated/enterprise-adjacent self-hosters even though the product itself
   is free.

## 4. Phased execution plan

Each phase ends with Antigravity producing a written **exit report** (see
§5) before the next phase starts. Do not let Antigravity proceed
unsupervised past a phase boundary — the human/Claude reviewer verifies the
report and the actual diff before authorizing the next phase.

### Phase 0 — Branch & safety prep
- Create a dedicated branch off `main` for this work (do not build on top of
  `features/forge-extensions` unless that's confirmed as the intended base).
- Snapshot current `docs/`, `Project-Documents/` monetization docs before
  deletion (git history already preserves them; no separate backup needed).
- Confirm no production users currently depend on the billing/license flow
  before ripping it out (repo owner sign-off, not a code check).

### Phase 1 — Strip payment & login gating
- Delete: `Desktop-app/src/backend/license.ts`, `razorpay.ts`, `sync.ts`,
  `scripts/issue-license.mjs`, associated test files
  (`billing.test.ts`, `billing_processors.test.ts`, `tier_trust.test.ts`).
- In `server.ts`: remove Stripe SDK init, `/api/auth/register`,
  `/api/auth/login`, `/api/auth/subscribe`, `/api/billing/*`,
  `/api/license/activate`, and the `syncController` references. **Keep**
  `/api/companion/pairing-code` and `LOCAL_SESSION_SECRET` checks untouched.
- In `tools.ts`: remove the Pro/Enterprise gate on semantic indexing; keep
  the feature itself, make it unconditionally available.
- In `App.tsx` (Desktop and Web), `ConfigHeader.tsx`, `PlanningScreen.tsx`:
  remove `user`/`tier`/`isPremium`/`billingProvider` state and every gate
  built on it (sync, drift detection, item caps, PLAN→CREW sync banner,
  template `requiredTier`). The features these gates protect become
  always-on, not removed.
- Remove `scripts/pricing.source.mjs`, `scripts/generate-pricing.mjs`, and
  every `pricing.generated.ts` import / `TierId` reference across
  Desktop-app, Web-app, Mobile-app.
- Delete or rewrite `docs/10-monetization-tiers-and-gating.md`,
  `Project-Documents/11-Subscription-and-Feature-Tiers.md`,
  `Project-Documents/13-Growth-and-Pricing-Strategy.md` into a single short
  "Free & BYOK" doc.
- Update `featureStatus.ts` entries (`billing`, `cloudSync`, `rbac`,
  `remoteContainer`) to drop payment-tier framing.
- Run the full test suite; fix fallout from removed imports.

### Phase 2 — Open-source packaging
- Pick and add a LICENSE (MIT or Apache-2.0 recommended for a permissive
  developer-tool project; flag the choice back for owner sign-off rather
  than deciding unilaterally).
- Rewrite `README.md` (root and per-app) for a public audience: what it is,
  BYOK setup, install instructions, screenshots.
- Add `CONTRIBUTING.md`, issue/PR templates.
- Sanitization pass: scan for any leaked secrets, internal URLs, private
  Kryleos-specific references, `.env` values, API keys committed by
  accident, or anything that assumed a paid/private deployment. (The
  `ecc:opensource-pipeline` skill's `opensource-sanitizer` step is built
  exactly for this — use it as a checklist even if not invoked as an agent.)
- Confirm `.gitignore` covers `.env`, `.kryleos/`, license/db key files
  before the repo (or a public mirror of it) goes public.

### Phase 3 — Cross-platform terminal + GitHub installable release
- Windows: winget manifest and/or a signed MSI/EXE via `electron-builder`
  (already configured — `electron-builder.yml` exists), published to GitHub
  Releases.
- macOS: Homebrew tap (`brew install kryleos/forge/forge`) plus notarized
  `.dmg`/`.pkg` via `electron-builder`, published to GitHub Releases.
- Linux: AppImage + `.deb` via `electron-builder`, plus a `curl | sh` install
  script that resolves OS/arch and pulls the right GitHub Release asset.
- Add a GitHub Actions release workflow: on tag push, build all three
  targets, sign/notarize what's required, attach to a GitHub Release,
  update the Homebrew tap and winget manifest automatically.
- One-line terminal install story for each OS, documented in the README:
  - macOS/Linux: `curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/main/install.sh | sh`
  - Windows: `winget install Kryleos.Forge` (or a PowerShell equivalent)
- Version/update check: since there's no license server anymore, decide
  whether the app checks GitHub Releases for updates (opt-in, no phone-home
  by default) or leaves updates fully manual.

### Phase 4 — Generalize agent execution (close the "do what Claude Code
does" gap)
- Extract a pluggable `CliAgentRunner` interface out of
  `claudeCodeRunner.ts` so other terminal-based coding agents (Codex CLI,
  Gemini CLI, Aider, etc.) can register the same way Claude Code does today.
- Move Claude Code execution from buffered `execFile` into a `terminalManager`
  PTY session so its tool-call output streams live into the UI instead of
  arriving only on completion.
- Build the MCP client (stdio + remote HTTP/SSE) and the Tool API Gateway
  already specified in `docs/17-tool-api-mcp-provider-integration.md` and
  `docs/08-agent-and-planning-engine.md` — today `claudeCodeRunner` and
  `terminalManager` are two separate ad hoc paths rather than one registry
  with schemas/permissions.

### Phase 5 — Polish the PM-workflow story
- Finish Preview Deck (multiple PTYs, live preview pane) per the scope
  `Project-Documents/01-Project-Brief.md` deliberately deferred.
- Complete VS Code extension live verification (`HANDOFF.md` §7 ends
  mid-verification — finish it).
- Land the differentiators from §3: dependency-aware scheduling, worktree
  isolation per card, exportable audit trail.
- **Remote mobile companion access (zero-cost, no hosted backend):**
  today's companion pairing (`COMPANION_AUTH_TOKEN`, QR pairing) is
  **LAN-only** — it cannot reach a home desktop from across the internet.
  The target use case is: ideate/plan on the mobile app while traveling,
  then trigger real code execution back on the home desktop remotely.
  - Mobile app must work **offline-first for PLAN/ideation** — no
    connection required while traveling; queued locally, synced when back
    online (via Option 1's file/git sync between desktop instances, or
    simply reconnecting on the same network).
  - Extend the existing companion pairing flow to accept a **tunnel
    address** in addition to a LAN IP, so it works over the internet
    without Kryleos hosting anything. Recommended zero-cost paths the user
    sets up themselves: **Tailscale** (free tier, encrypted mesh VPN,
    simplest setup) or **Cloudflare Tunnel** (free). Same pairing/auth
    code path as today (`COMPANION_AUTH_TOKEN`), just pointed at a
    tunnel-exposed address instead of a LAN-only one.
  - Explicitly do not build or host a Kryleos-run relay/proxy service for
    this — that would reintroduce a hosting cost and an account/login
    surface, contradicting the zero-cost/no-backend goal. Document the
    Tailscale/Cloudflare Tunnel setup in the README instead.

### Phase 6 — Multi-engine execution: in-app runners + external handoff

Two distinct mechanisms, not one flat registry. Conflating them is what
created the Cursor/Antigravity licensing problem in the first draft of
this phase — they need to stay architecturally separate.

**Tier 1 — In-app execution runners.** Forge drives the tool itself:
spawns it, streams its output live, applies the command-approval gate,
writes to the audit trail. This requires the tool to have a genuine BYOK
CLI mode. Phase 4 already built the architecture for this: `CliAgentRunner`
interface, `CliAgentRegistry` (`Desktop-app/src/backend/cliAgentRunner.ts`),
and a WebSocket protocol (`server.ts`) that already accepts a `runner`
field to route a task to any registered engine. `claude-code` is fully
working; `codex-cli` is registered but stubbed (`run()` throws "planned
scaffold").

**Tier 2 — External handoff (export/launch).** For everything else —
Cursor, Antigravity, Windsurf, VS Code, JetBrains AI Assistant, or any
other desktop AI tool a user wants to finish execution in. Forge does
NOT drive these programmatically and does NOT touch their backend,
billing, or account. Instead, after PLAN (and optionally CREW review) is
done on a card, Forge:
1. Generates a structured handoff bundle from the card: the spec,
   acceptance criteria, relevant file context — the same shape of prompt
   `ClaudeCodeRunner.buildPrompt` already generates for the in-app path,
   written to e.g. `.kryleos/handoff/<card-id>.md`.
2. Either launches the target desktop app pointed at the project folder
   (an OS-level `open`/`start`/`xdg-open` app launch, exactly like a
   "Open in VS Code" button — not an API call, not automation of the
   target app's own agent), or copies the bundle to the clipboard with
   instructions, whichever the target app supports.
3. Stops there. The user drives execution inside their own,
   already-authenticated session of that other app. Forge has no further
   involvement — no streaming, no approval gate, no audit trail for work
   done inside the external tool, because Forge isn't the one doing it.

This is why Tier 2 sidesteps the licensing problems Tier 1 would hit:
launching an app and handing it a file/clipboard content the user
themselves pastes in is not "using third party software to access the
Service" (Google's Antigravity Clause 6 concern) and never touches
Cursor's account/billing (the BYOK concern) — it's functionally
identical to the user manually opening that app themselves, which no
ToS anywhere prohibits. This reasoning extends, but was not verified
line-by-line against, the ToS research below — if the repo owner wants
certainty before shipping, a one-line confirmation from Cursor/Google
support would close the gap, but the "just launch the app" mechanism is
standard industry practice (VS Code's `vscode://` deep links, JetBrains
Toolbox, etc.) and carries materially lower risk than Tier 1 automation.

**License/ToS research (2026-09-13) — governs Tier 1 eligibility only:**

| Engine | Real CLI? | BYOK-compatible? | Tier 1 eligible? |
|---|---|---|---|
| Claude Code | Yes | Yes | Yes — already integrated |
| Codex CLI | Yes | Yes | Yes — implement for real this phase |
| Cursor (`cursor-agent`) | Yes, officially supported headless mode ([cursor.com/docs/cli/headless](https://cursor.com/docs/cli/headless)) | **No** — auth is `CURSOR_API_KEY` from Cursor's own dashboard or account login; confirmed no third-party provider key support ([forum.cursor.com/t/can-i-use-provider-api-keys-with-cursor-cli-agent/149158](https://forum.cursor.com/t/can-i-use-provider-api-keys-with-cursor-cli-agent/149158)) | No — Tier 2 (handoff) only |
| Antigravity CLI/desktop | Yes ([antigravity.google/docs/cli/headless/](https://antigravity.google/docs/cli/headless/)) | Unclear — typical auth path is Google-account OAuth | No — Google's Antigravity Additional Terms ([antigravity.google/terms/](https://antigravity.google/terms/), Clause 6) explicitly prohibit *"third party software... to access the Service"*, with account suspension as the stated consequence. **Tier 2 (handoff) only** — never build a Tier 1 runner for this. |

**Deliverables:**
- **Tier 1: implement `CodexCliRunner` for real**, mirroring
  `ClaudeCodeRunner`'s binary discovery, capability probing, and `runPty`
  streaming execution.
- **Tier 1: add a card-level runner picker to the UI** for the in-app
  engines (currently missing — the backend routing exists, nothing in
  `App.tsx` lets a user choose). Default to `claude-code`, offer
  `codex-cli`.
- **Tier 2: build the generic handoff mechanism** — handoff bundle
  generation from a card, app-launch config (a small registry mapping
  app name → OS launch command, e.g. `cursor <folder>`, and a fallback
  "copy spec to clipboard + show me how to open X" path for apps with no
  known launch command). Ship Cursor and Antigravity as Tier 2 handoff
  targets — both are fine here since Forge never automates them.
- **Never build a Tier 1 (automated, in-app-driven) runner for Cursor or
  Antigravity.** If Cursor ever ships BYOK support, or Google ever offers
  an API-key-only auth path clear of Clause 6, this can be revisited —
  not before, and only after re-confirming the terms at that time.
- Other genuinely BYOK CLI agents (Gemini CLI, Aider) are reasonable
  future Tier 1 additions using the same `CliAgentRunner` pattern, though
  not requested here.

### Phase 7 — Retrieval, verification loops & merge safety

Grounded in a direct check of the current code (2026-09-13), not
speculation: `CostGuard` (`Desktop-app/src/backend/costGuard.ts`) only
records spend history, no budget enforcement exists anywhere in it;
`scanSecrets` (`secretScanner.ts`) is called at several content-generation
points but never before `mergeCardWorktree`; the self-healing rollback in
`agents.ts` is in-memory, per-file, and lost on restart; nothing detects
two cards' worktrees touching the same file; and the Sentinel failsafe
(`agents.ts:1049`) runs `tsc`/build once, never actual tests, and doesn't
retry.

**7a. Post-execution CREW reviewer**
- Add a fourth persona to `Desktop-app/src/shared/crewPersonas.ts` (e.g.
  `post_execution_reviewer`) using the same shape as the existing three.
- New handoff trigger point: today `installCrewPersona`/CREW only fires
  at PLAN→CREW. This persona fires at FORGE completion instead — after
  `runFailsafeCompilationCheck` passes, run it against the card's actual
  diff (via the card's worktree branch) and the card's acceptance
  criteria.
- Block the "mark Done" UI action on a card until this reviewer reports
  clean, or until a human explicitly overrides it.

**7b. Real retry loop on the Sentinel check**
- Wrap `runFailsafeCompilationCheck` (`agents.ts`) in a bounded retry
  loop (cap at 3 attempts): run check → on failure, feed the error back
  into `coordinatorHistory` as today → let the coordinator respond → re-run
  → stop on pass or attempt-cap, whichever comes first. Surface attempt
  count in the UI/log so a capped-out failure is visibly different from a
  pass.
- Extend the check beyond `tsc`/`build` to also run the project's actual
  test command when one is detectable (e.g. `npm test` / existing
  `package.json` script), and capture pass/fail + count, not just exit
  code — this doubles as the data source for 7e below.

**7c. Tree-sitter + PageRank semantic index**
- Replace the regex-based scanner in `Desktop-app/src/backend/tools.ts`
  (`buildSemanticCache`, currently just matching `function`/`class`/
  `interface`/arrow-function declarations via regex) with real tree-sitter
  parsing: per-file symbol extraction plus import/call edges between
  files.
- Rank retrieved symbols with **PageRank over that call graph** — Aider's
  public repo-map recipe is the concrete reference implementation
  (tree-sitter → graph → PageRank → fit top-ranked symbols into token
  budget). Same idea, don't reinvent the ranking approach.
- `querySemanticCache`'s current lowercase-substring match becomes a
  graph-ranked lookup instead of flat text matching.
- New dependency: `tree-sitter` plus grammars for the languages already
  supported (`.ts`, `.tsx`, `.js`, `.jsx` at minimum, matching current
  scope). This is the largest single lift in this phase — land it last if
  time-constrained, since 7a/7b/7d/7e are all independently valuable and
  smaller.

**7d. Worktree + staging-branch merge safety**
- Worktree isolation itself already shipped in Phase 5
  (`createCardWorktree`/`mergeCardWorktree` in `tools.ts`). This item
  closes the remaining gaps:
  - **Staging branch**: `mergeCardWorktree` should target a staging
    branch (not the card's final target branch directly) — run the
    project's test command there, catch conflicts/failures once, then
    fast-forward/merge to the real target only after that passes.
  - **File-ownership / collision warning**: when a new worktree is
    created, check its intended file set (or check at merge time) against
    other currently-open worktrees' changed files; surface a warning in
    the UI rather than silently allowing overlapping edits.
  - **Secret-scan gate on merge**: call `scanSecrets` on the worktree's
    diff before `mergeCardWorktree` completes; block or clearly warn on
    any hit, same severity treatment as other destructive-action gates in
    this app.

**7e. Durable per-card rollback + spend enforcement (grouped: both are
safety rails, both small)**
- **Rollback**: add a card-level "Revert" action using the worktree/branch
  that already exists from 7d/Phase 5 (`git worktree remove` + branch
  reset/delete) instead of relying on the in-memory per-file snapshot
  system, which is lost on restart and doesn't cover a whole card's
  changes.
- **Spend enforcement**: add a configurable per-project and/or per-day
  spend cap to `CostGuard` — when the running total from `cost_history.json`
  crosses the cap, block new agent runs (FORGE, CREW, Tier 1 execution)
  with a clear message, rather than only ever recording spend after the
  fact.

**7f. Fix the flaky Codex smoke test from Phase 6**
- `Desktop-app/src/backend/__tests__/cliAgentRunner.test.ts`'s "real
  binary smoke test: probes capabilities if codex is installed" shells
  out to whatever `codex` resolves to on the machine running the test
  suite. Verified during Phase 6 review: on this machine `codex` is a
  `mise` (tool version manager) shim that can hang indefinitely resolving
  the real binary — the test passed once, then hung/failed on a
  same-environment re-run minutes later with no code changes in between.
- Fix: make the smoke test skip gracefully (not hard-fail) when the
  binary is slow, unavailable, or resolves through a shim that doesn't
  respond within a short bound (a few seconds) — this is inherently
  machine-dependent and shouldn't be a hard assertion in `npm test`. Keep
  the deterministic/mocked `CodexCliRunner` tests as hard assertions;
  only the live-binary smoke test needs this treatment.

This phase touches six independent areas (7a–7f); treat them as
separately landable, same guidance as prior phases — if one can't be
completed safely in one pass, land the rest and scope the remainder as a
"Known gap."

### Phase 8 — Close the raw-CLI approval-gate gap (tracked follow-up)

**Status: unresolved as of Phase 7 review (2026-09-13).** Traced and
re-confirmed three times across Phase 4, 5, and 7 reviews — this is a
real, consistent architectural gap, not a one-off oversight:

- `createAgentSession`/`runPty` (`Desktop-app/src/backend/terminalManager.ts`,
  `cliAgentRunner.ts`) — the code path used when `ClaudeCodeRunner` or
  `CodexCliRunner` run the real `claude`/`codex` binary in a live PTY —
  has **no `onCommand`/`classifyCommand` wiring**. Whatever that binary's
  own internal tool-use does (file edits, shell commands it runs itself)
  is not intercepted by Forge's approval gate.
- This is different from Forge's own internal multi-agent orchestrator
  (`agents.ts`'s `runCommandWithApproval`), which does have this gate —
  Phase 7's exit report correctly implemented that path but its wording
  was easy to misread as having closed the PTY-runner gap too. It did
  not. Re-verified directly against `terminalManager.ts` after Phase 7
  landed: unchanged from Phase 4.
- Why it's hard: `claude`/`codex` are opaque external binaries. Forge
  doesn't control their internal execution — only what's written to
  their PTY stdin (human keystrokes) and what appears in their stdout.
  There's no clean way to intercept "what command is this external
  process about to run" from outside it without either (a) the binary
  itself exposing that decision point to a caller, or (b) OS-level
  process/syscall interception.

**Candidate approaches to evaluate in this phase (research first, pick
one, don't build all three):**
1. **Route through the Tool API Gateway / MCP path instead of raw PTY.**
   Phase 4 already built `toolApiGateway.ts` and `mcpClient.ts` with
   real permission levels, approval policies, and Zero Egress gating.
   If Claude Code/Codex ever support acting as an MCP client themselves
   (calling out to Forge's own registered tools instead of running shell
   commands directly), tool calls would flow through the existing gate
   for free. Check current MCP support in each CLI's own docs before
   assuming this is available.
2. **Rely on the binary's own interactive confirmation prompts**, relayed
   through the PTY to the human. Both `claude` and `codex` have their own
   internal permission-prompt UX in interactive mode; today Forge runs
   Claude Code with `--print` (non-interactive), which likely bypasses
   this entirely. Running in interactive mode and forwarding its prompts
   through xterm.js (already wired for `terminal_input`/`terminal_data`)
   may recover human-in-the-loop control without needing to intercept
   anything — but changes the execution UX (no longer a clean one-shot
   run) and needs verification that print/non-interactive mode doesn't
   silently skip confirmations by design.
3. **OS-level interception (ptrace/eBPF)** — technically the most
   complete solution, but heavyweight, platform-specific (Linux-only for
   eBPF, different mechanisms on macOS/Windows), and a large increase in
   attack surface/complexity for a desktop app. Treat as last resort;
   likely disproportionate to the risk for a BYOK tool where the user
   already trusts the CLI binary they installed.

**Deliverable for this phase:** a short written recommendation (which of
the three above, or a combination, or "accept the gap and document it
clearly in the README/security docs as a known limitation") before any
implementation — this is a design decision, not a mechanical build like
Phases 1–7. Do not implement blindly; the cheapest and most honest
outcome may simply be documenting the boundary clearly (Forge's approval
gate covers its own orchestrator and human-typed terminal input; it does
not cover a wrapped external CLI's own autonomous actions) rather than
building complex interception machinery for marginal benefit.

### Phase 9 — Differentiator features (post-audit additions, 2026-09-13)

Identified after a deliberate "what's missing that isn't gimmicky" review
against the completed Phases 1–8 and the competitive landscape (Vibe
Kanban, Kandev — see §3). Each closes a specific gap rather than adding
surface polish; none require new infrastructure beyond what Phases 1–8
already built.

**9a. Cross-card decision memory**
- Problem: a card's context today is self-contained — its spec, diff, and
  review. Architectural decisions made resolving one card (e.g. "chose
  Postgres over Mongo," "auth uses JWT not sessions") aren't visible to
  agents working later cards, so a FORGE run on a later card can
  contradict an earlier decision with no way to know.
- This is distinct from the Phase 7c semantic index, which indexes code
  structure, not decision rationale.
- Build: a lightweight, append-only `.kryleos/decisions.md` (or JSON) that
  CREW/post-execution-reviewer agents write a one-line entry to when a
  card resolves a real architectural choice. Inject its contents into
  every future card's prompt context alongside semantic-index results
  (same injection point used for `buildPrompt` in `cliAgentRunner.ts` and
  the CREW persona prompts).
- Extends the "task state as source of truth" differentiator already
  claimed in §3 — this is that principle applied across cards, not just
  within one.

**9b. Cost-aware model routing**
- Problem: every agent step (CREW review, FORGE execution, post-execution
  review) uses whatever single model the user configured, uniformly. For
  a BYOK tool whose entire pitch is "you pay your own bill, no markup,"
  routing cheap triage steps to a cheaper model is a direct cost
  reduction, not a nice-to-have.
- Build: add an optional "fast model" override per provider alongside the
  existing model config (`ConfigHeader.tsx`). Route lower-stakes steps —
  Scope Guard persona review, simple diff/compile checks — to the fast
  model when configured; keep FORGE execution and Technical
  Reviewer/post-execution-reviewer on the primary model. Ties directly
  into the spend-cap work from Phase 7e — same settings surface, one more
  field, no new infrastructure.

**9c. Auto-generated PR description from completed cards**
- Problem: when a staging-branch merge (Phase 7d) succeeds, all the data
  needed for a good PR description already exists on the card — spec,
  acceptance criteria, diff, post-execution reviewer verdict — but nothing
  assembles it into one.
- Build: on successful `mergeCardWorktree` staging-to-target promotion,
  generate a PR description (and/or CHANGELOG entry) from the card's
  existing fields. Pure assembly over data already captured by Phases 5/7
  — no new data collection required.

This phase touches three independent, small items — land them
separately, same guidance as prior phases. None are load-bearing for
each other.

### Phase 10 — Fix orphaned-process leak in the Codex smoke test

**Found during Phase 8 review (2026-09-13), reproduced on demand three
times.** Phase 7f's fix for the flaky Codex smoke test
(`Desktop-app/src/backend/__tests__/cliAgentRunner.test.ts`, "real binary
smoke test: probes capabilities if codex is installed") only stops the
*test* from hanging — it does not kill the underlying subprocess.

- The test wraps `runner.probeCapabilities(realBin)` in
  `Promise.race([...,  new Promise(resolve => setTimeout(() => resolve(null), 2500))])`.
  When the 2500ms timeout branch wins, the test moves on and reports a
  clean skip — but the abandoned `probeCapabilities` call, and the child
  process it spawned via `execFileSimple` (`cliAgentRunner.ts:127`,
  `execFile(bin, ['--version'], { timeout: 5000 })`), keeps running.
- Confirmed directly: every run of this test on this machine (where
  `codex` resolves through a `mise` version-manager shim that hangs
  resolving the real binary) leaves behind a new orphaned
  `mise x codex -- codex --version` process still consuming ~40% CPU
  minutes later. Found and killed three separate instances accumulated
  from Phase 7/8 verification runs alone. `execFile`'s own `timeout: 5000`
  option does not reliably kill it either — likely because `mise` spawns
  `codex` as a grandchild process that doesn't receive the SIGTERM sent
  to the immediate child.
- This will leak processes on any CI runner or contributor machine where
  `codex` resolves slowly or through a shim, accumulating over repeated
  test runs.

**Fix:** don't abandon the promise — get a real handle on the spawned
child process and kill it (and its process group/tree, not just the
immediate child, given the grandchild-process pattern observed here) when
the race's timeout branch wins. If `execFileSimple`/`probeCapabilities`
doesn't currently expose the child process handle to callers, that's
part of the fix — thread it through so the test (and any other caller
with similar timeout-race logic) can actually terminate what it started.
Verify the fix by running the test multiple times in a loop and confirming
no orphaned process remains after each run (`ps aux | grep codex` or
equivalent), not just that the test itself reports pass/skip.

## 5. Antigravity execution protocol

Run each phase above as a separate Antigravity work cycle. Use the prompt in
§6, substituting the phase number/description. After each cycle, require
Antigravity to produce an **exit report** in this exact shape before
stopping:

```
## Exit Report — Phase <N>: <name>

### Changes made
- <file path>: <what changed and why>
  (repeat per file touched)

### Deviations from plan
- <anything done differently than the doc specified, and why>

### Tests run
- <command run> → <pass/fail, with failure detail if any>

### Known gaps / follow-ups
- <anything intentionally left unfinished for a later phase>

### Verification needed from reviewer
- <specific things the human/Claude reviewer should check manually>
```

The reviewer (Claude, in this project) verifies the report against the
actual diff (`git diff`, `git status`, test run) before Phase N+1 starts.
Do not chain phases automatically — each is a checkpoint.

## 6. Antigravity prompt (use per phase)

```
You are executing Phase <N> of docs/open-sorce-startegy.md in the
Kryleos-Forge repo. Read that file in full first, especially the section
for Phase <N> and the "Must be preserved" list in §2 (do not touch
LOCAL_SESSION_SECRET, companion pairing, or OS_FINGERPRINT — those are
legitimate security features, not payment gating).

Scope: only do the work described under "Phase <N>" in that doc. Do not
start on later phases. Do not add features, refactors, or cleanup beyond
what's listed — if you notice something else worth fixing, note it in the
exit report's "Known gaps" section instead of doing it.

When finished:
1. Run the full relevant test suite(s) for whatever you touched.
2. Run `git status` and `git diff --stat` and make sure nothing outside
   this phase's scope changed.
3. Produce the Exit Report in the exact format specified in §5 of
   docs/open-sorce-startegy.md.
4. Stop. Do not commit, push, or start the next phase — a human/Claude
   reviewer verifies this phase before you continue.
```

## 7. Open decisions requiring owner sign-off

- License choice (MIT vs Apache-2.0 vs other).
- GitHub org/repo name and visibility timing (make public before or after
  Phase 1–2 land on a private branch?).
- Whether Phase 4 (MCP + pluggable agent runners) ships before or after the
  initial public release — it's the biggest differentiator but also the
  largest remaining engineering lift.
- Update-check behavior in Phase 3 (silent GitHub Release polling vs fully
  manual, given no phone-home is otherwise acceptable for a privacy-forward
  free tool).
