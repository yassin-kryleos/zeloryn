# Subscription and Feature Tiers

## 1. Overview

Kryleos Forge uses a six-tier subscription model. The current implementation uses dynamic tier state to gate and display feature availability. Several advanced capabilities are represented as simulations or indicators rather than production cloud infrastructure.

For the full commercial packaging strategy, see `13-Growth-and-Pricing-Strategy.md`.

The previous prototype tier model (Free / Basic / Pro / Enterprise B2B) has been replaced by the commercial ladder below. Internal code still uses the old tier names in places and must be updated during Phase 9 billing work.

**Pricing philosophy:** users bring their own AI (BYOK + Ollama). Forge charges only for the workflow layer — execution tracing, drift detection, sync, and multi-repo management — that makes AI useful across a whole project, not just a single file.

## 2. Tier Summary

| Tier | Price | Target User | Primary Access |
|---|---:|---|---|
| Free | $0 | Curious users, hobby testing | Full access to all four Build Loop spaces (PLAN, CREW, FLOW, FORGE). Local tools, Ollama/local models, BYOK hosted models, community agent starter packs, command approval, Zero Egress Mode. Manual PLAN→CREW handoff via .md export and copy-paste. No sync, no execution tracing, no drift detection. Single workspace. No artificial item caps. |
| Solo | $5/mo | Budget solo developers | Everything Free plus basic execution tracing, PLAN→CREW direct Desktop sync, AI-generated acceptance criteria at plan item creation, basic drift detection (Not Started / In Progress / Complete), basic docs generation, response modes, basic Cost Guard. |
| Solo Plus | $9/mo | Serious solo developers | Everything Solo plus full drift detection (Diverged + confidence scoring), trace history, cross-device sync, automated backups, mobile/web PLAN space with Desktop sync, voice input, richer Docs Autopilot, project memory, Cost Guard history, prompt optimization controls. |
| Founder | $15/mo | Indie founders building products | Everything Solo Plus plus multi-repo plan scope, cross-repo drift detection, "What's Left" summary report, plan versioning, plan item dependencies (blockedBy), agent specialization per plan item, PRD generator, architecture docs, roadmap/backlog docs, release checklist, founder summaries, monthly project health report. |
| Agency/Team | $39/mo | Small agencies or small teams | Everything Founder plus shared plan editing, team trace visibility, per-member execution history, client handoff packs, branded exported docs, collaboration preview indicators, RBAC simulator indicators, priority support, small-team workflow templates. |
| Early Lifetime | $99–$149 one-time | Early supporters | Limited-time offer at Solo Plus or Founder level. Delivered via Gumroad or Lemon Squeezy before full Stripe integration. Launches only after Preview Deck and execution tracing are both working. Not a permanent plan. |

## 3. Feature Entitlements

| Feature | Free | Solo | Solo Plus | Founder | Agency/Team |
|---|:---:|:---:|:---:|:---:|:---:|
| **Build Loop spaces (PLAN, CREW, FLOW, FORGE)** | Yes | Yes | Yes | Yes | Yes |
| Local workspace access | Yes | Yes | Yes | Yes | Yes |
| File browser and local tools | Yes | Yes | Yes | Yes | Yes |
| Local models with Ollama (desktop offline) | Yes | Yes | Yes | Yes | Yes |
| Bring-your-own-key hosted models | Yes | Yes | Yes | Yes | Yes |
| Community agent starter packs | Yes | Yes | Yes | Yes | Yes |
| CREW agent personas (Technical Reviewer, Scope Guard, Risk Identifier) | Yes | Yes | Yes | Yes | Yes |
| Local agents and skills | Yes | Yes | Yes | Yes | Yes |
| Zero Egress Mode | Yes | Yes | Yes | Yes | Yes |
| AI shell command approval gates | Yes | Yes | Yes | Yes | Yes |
| Graceful workflow abort | Yes | Yes | Yes | Yes | Yes |
| PLAN→CREW handoff (manual .md export + copy-paste) | Yes | Yes | Yes | Yes | Yes |
| Unlimited local projects | Yes | Yes | Yes | Yes | Yes |
| Basic docs generation | No | Yes | Yes | Yes | Yes |
| Response modes (concise, critical, brutal audit) | No | Yes | Yes | Yes | Yes |
| Basic Cost Guard | No | Yes | Yes | Yes | Yes |
| Local-only privacy badge | No | Yes | Yes | Yes | Yes |
| Execution tracing (basic) | No | Yes | Yes | Yes | Yes |
| PLAN→CREW direct Desktop sync | No | Yes | Yes | Yes | Yes |
| AI acceptance criteria generation at plan item creation | No | Yes | Yes | Yes | Yes |
| Drift detection: Not Started / In Progress / Complete | No | Yes | Yes | Yes | Yes |
| Agent specialization per plan item (category tagging) | No | Yes | Yes | Yes | Yes |
| Full drift detection (Diverged + confidence scoring) | No | No | Yes | Yes | Yes |
| Execution trace history | No | No | Yes | Yes | Yes |
| Cross-device state sync | No | No | Yes | Yes | Yes |
| Automated backups | No | No | Yes | Yes | Yes |
| Mobile/web PLAN space with Desktop sync | No | No | Yes | Yes | Yes |
| Voice input | No | No | Yes | Yes | Yes |
| Richer Docs Autopilot | No | No | Yes | Yes | Yes |
| Project memory | No | No | Yes | Yes | Yes |
| Cost Guard history | No | No | Yes | Yes | Yes |
| Prompt optimization controls | No | No | Yes | Yes | Yes |
| Multi-repo plan scope | No | No | No | Yes | Yes |
| Cross-repo drift detection | No | No | No | Yes | Yes |
| "What's Left" summary report | No | No | No | Yes | Yes |
| Plan versioning | No | No | No | Yes | Yes |
| Plan item dependencies (blockedBy) | No | No | No | Yes | Yes |
| PRD and architecture docs | No | No | No | Yes | Yes |
| Roadmap and backlog generator | No | No | No | Yes | Yes |
| Release checklist | No | No | No | Yes | Yes |
| Founder summaries | No | No | No | Yes | Yes |
| Monthly project health report | No | No | No | Yes | Yes |
| Shared plan editing | No | No | No | No | Yes |
| Team trace visibility | No | No | No | No | Yes |
| Per-member execution history | No | No | No | No | Yes |
| Client handoff packs | No | No | No | No | Yes |
| Branded exported docs | No | No | No | No | Yes |
| Collaboration Preview indicators | No | No | No | No | Yes |
| RBAC simulator indicators | No | No | No | No | Yes |
| Priority support | No | No | No | No | Yes |
| Cloud IDE Preview indicators | No | No | Yes | Yes | Yes |
| Remote Container Simulator indicators | No | No | No | Yes | Yes |

## 4. Feature Implementation Matrix

| Feature | Tier Level | Backend Implementation | Frontend Representation |
|---|---|---|---|
| Collaboration Preview | Agency/Team | Hooked into WebSocket routes to check connection authorization levels. | Agency/Team users see live online peer count indicators and cloud sync logs in `CoworkSpace.tsx`. |
| Role-Based Access Controls (RBAC) Simulator | Agency/Team | Mapped within user schemas inside `sync.ts` to verify permissions before pushes. | Shows role indicators such as OWNER inside the Crew specialist dashboard. |
| Cloud IDE Preview | Founder / Agency/Team | Represented by account/sync indicators and desktop backend linkage. | Connects user accounts through Google/Apple login SSO portal in `ConfigHeader.tsx`. |
| Remote Container Simulator | Founder / Agency/Team (future roadmap) | Handled in `runCommand` inside `tools.ts`. Free/Solo/Solo Plus users execute on the local host OS with security warnings. Founder/Agency/Team users activate simulator banners only. | Shows stdout shell banners matching the active tier: `[REMOTE CONTAINER SIMULATOR ACTIVE]` or `[WARNING: LOCAL HOST EXECUTION ACTIVE]`. |
| Marketplace for Agents/Skills | All Tiers | Handled through file deletion and scanning routes for on-disk skills and agents. Current code supports legacy `.matrix/skills` and the rebranded `.kryleos/skills` convention. | Unlocks the Specialists tab and Workspace Skills Factory, supporting `.js` scripts and `.md` prompts. |
| Mock Billing | Premium Tiers | Mocked checkout integration routed through `/api/auth/subscribe` mapping. | Upgrades toggle active tiers dynamically and push configuration changes to the database. |
| Command Approval and Graceful Interrupt | All Tiers | `AgentOrchestrator` pauses before `runCommand`, `server.ts` routes `approve_command`/`abort_execution`, and `WorkspaceSandbox` tracks child processes for termination. | `App.tsx` stores pending command state and `ChatConsole.tsx` renders `[APPROVE & RUN]` / `[REJECT]`. |

Web and Mobile companion surfaces must use the same maturity language as Desktop. Web pricing, sandbox, settings sync, collaboration, semantic cache, rollback, RBAC, telemetry, keychain, and billing surfaces now show production/preview/simulator/mock badges. Mobile sync, collaboration, semantic cache, rollback, RBAC, and account billing surfaces now show preview/simulator/mock badges.

## 5. Tier Behavior Notes

### Free Tier

Free is for trust-building and evaluation. It provides full access to all five Build Loop spaces (PLAN, CREW, FLOW, FORGE, Chat) with no artificial item caps. Local-first, BYOK model support, Ollama, community agent packs, and all three CREW agent personas are available. The PLAN→CREW handoff on Free uses structured .md export and manual copy-paste — no automatic sync. Core safety features (command approval, graceful abort, Zero Egress Mode) are available on Free. Execution tracing, drift detection, and cross-device sync are not available.

### Solo Plan

Solo is the entry point for active builders. It unlocks execution tracing, AI acceptance criteria generation at plan creation, basic drift detection (Not Started / In Progress / Complete), and direct PLAN→CREW Desktop sync. The key upgrade from Free: your plan items are now tracked against real code evidence automatically.

### Solo Plus Plan

Solo Plus is for continuity and full drift intelligence. It adds Diverged classification + confidence scoring, trace history, cross-device sync, and mobile/web PLAN space with Desktop sync — so you can ideate on your phone and execute on Desktop without copy-paste.

### Founder Plan

Founder is for people managing multi-repo products and needing full project governance. It adds multi-repo plan scope, cross-repo drift detection, "What's Left" summary, plan versioning, plan item dependencies (blockedBy), and agent specialization routing. Also includes founder-level docs workflows (PRD, architecture, roadmap, release checklist, founder summaries, monthly project health report).

### Agency/Team Plan

Agency/Team is for users packaging work for clients or collaborating in small groups. Adds shared plan editing, team trace visibility, per-member execution history, client handoff packs, and branded exported docs. Collaboration and RBAC remain labeled as preview/simulator until production-grade.

### Early Lifetime

Early Lifetime is a limited-time early-supporter offer at Solo Plus or Founder level, delivered via Gumroad or Lemon Squeezy. It must launch only after the Preview Deck and execution tracing are both working — not before. It must be time-bound and must not become the default business model.

## 6. In-App Upgrade Flow (Pre-Stripe)

Before full Stripe integration is live, tier upgrades use a license key model:

1. **Tier gate nudge:** when a user hits a locked feature, an inline nudge appears directly below the locked action — feature name, unlocking tier, price, and "Upgrade →" button. Not a blocking modal.
2. **Upgrade modal:** "Upgrade →" opens an in-app modal showing a two-column tier comparison (current vs next tier) with the specific locked feature highlighted. One CTA: "Get [Tier] for $X/mo →" opens Gumroad or Lemon Squeezy in the system browser.
3. **License key entry:** after external payment, the user receives a license key by email. A "License Key" field in CONFIG accepts it. The app validates locally (hash check against a bundled key format — no server round-trip). Tier state updates immediately.
4. **Post-launch:** replace license key entry with a Stripe checkout modal. Same gate → modal → payment entry points; no UX redesign required.

Early Lifetime license keys must be validated as Founder-level or Solo Plus-level accordingly.

## 7. Production Readiness Notes

- Billing is currently mocked and must be replaced with real checkout/subscription provider integration before launch.
- RBAC is currently schema/indicator based and must be backed by server-enforced permissions for production.
- Team collaboration is currently indicator/sync based and must be expanded for production multi-user editing.
- Remote container execution is currently a simulator and must be backed by real isolated infrastructure before being marketed as actual remote execution.
- Command approval and graceful abort are available across all tiers and should not be positioned as paid features.
- Browser-side cryptographic command approval signatures are not currently part of the reviewed UI flow; the implemented guard is explicit user approval plus active `commandId` matching.
