# Growth and Pricing Strategy

## 1. Purpose

This document records the product strategy for Kryleos Forge. It explains how Forge should move from a personal tool into a consumer-facing product by owning a category that no competitor has claimed: project-level AI execution.

The strategy is category creation, not price competition. Forge does not win by being cheaper than Cursor. It wins by doing something Cursor, Claude Code, Codex, and Antigravity cannot: manage a project from plan to board to execution and show the user what closed — through the Build Loop: PLAN → CREW → FLOW → FORGE.

## 2. Conversation Decision Log

### Initial Concern

The original question was how Kryleos Forge could survive in a market led by strong AI coding products such as Cursor, Claude Code, Codex, and Antigravity.

The key conclusion was blunt: Kryleos Forge should not compete head-on with those products. It is not realistic to beat them on model access, infrastructure, editor maturity, brand trust, sandboxing, or distribution in the near term.

### Initial Revenue Target

An early target of `$30k-$100k/month` was discussed as a stretch goal.

That target is possible only with either:

- thousands of low-price consumer users, or
- hundreds of higher-value team/founder customers.

For the current product stage, that target was treated as unrealistic.

### Revised Revenue Target

The realistic early target is `$2k-$3k/month`.

This is a healthier goal for a tool that started as a personal app and is now being considered for consumer use.

### Strategic Correction

The product should not be marketed as:

- a Cursor replacement,
- a Claude Code replacement,
- a Codex replacement,
- enterprise-grade software,
- secure remote container infrastructure,
- full production team collaboration.

Forge should be marketed as the first tool in a new category:

> The only AI coding tool that manages your project — from plan to board to execution — not just your current file.

### Core User Motivation

The primary customer is a solo developer or technical founder who has a plan (a doc, a PRD, a checklist, a list of tasks) and currently has no tool that connects that plan to AI-driven code execution and shows them what actually got built.

That user wants:

- to know whether their code matches their plan without manually checking,
- to track what got built and what didn't across multiple agent runs,
- to execute plan items with one click and see the result traced back automatically,
- local-first operation so their codebase stays on their machine,
- affordable pricing because they're not an enterprise.

"Affordable" and "local-first" are supporting reasons to choose Forge over competitors once the category claim lands. They are not the headline.

### Pricing Concern and BYOK Adjustment

The app should remain affordable enough that solo developers are not alienated. Users already pay for AI API costs through BYOK. Forge must not be seen as adding a significant second bill on top.

The pricing philosophy: **"You bring the AI. We charge only for the workflow that makes it useful across a whole project."**

The strategy is not to make every user pay founder or enterprise pricing. The strategy is to keep a low-cost solo path while adding higher-value plans for users who are using Kryleos Forge to earn money. Free tier must not have artificial item caps — gate on workflow features (tracing, sync, drift detection), not on project or task counts.

### Final Strategy

Use a mixed pricing ladder:

- low-cost Free, Solo, and Solo Plus plans for solo developers,
- Founder plan for indie builders shipping products,
- Agency/Team plan for small client-work teams,
- Enterprise-style features only as previews/simulators until they are production-grade.

### Important Warning

Simulated capabilities must be described honestly.

Remote execution, hosted IDE behavior, collaboration, RBAC, and enterprise controls should be labeled as previews or simulators unless they are backed by real production infrastructure.

## 3. Positioning

### Primary Positioning Statement

> Kryleos Forge is the only AI coding tool that manages your project from plan to board to execution. Define what you're building, track it on a Kanban board, execute with AI agents, and watch your plan close against real code changes.

This statement must lead every surface where Forge is described: landing page, README, app onboarding, pricing page, and launch messaging. It is not a supporting bullet point. It is the product identity.

### Supporting Claims (secondary)

Once the category claim lands, these supporting claims explain why Forge rather than a competitor:

- Local-first: your code stays on your machine.
- Zero Egress Mode: server-side guarantee that nothing leaves when enabled.
- BYOK: use your own API keys across any provider.
- Local models: Ollama support with no cloud dependency.
- Affordable: priced for solo developers, not enterprise teams.

### Messaging to Avoid

- "Affordable AI coding workspace" as the headline — this is a price claim that invites comparison to cheaper tools.
- Cursor replacement, Claude Code replacement, Codex replacement.
- Enterprise-grade, secure remote containers, full team collaboration, production RBAC.

These claims should only be used when the implementation is genuinely production-ready.

## 4. Target Customers

| Segment | Priority | Description |
|---|---:|---|
| Technical founders | Primary | Building multi-file, multi-repo products who need plan-to-execution traceability, not just per-file edits. |
| Solo developers | Primary | Have a plan or task list and want to execute it with AI without losing track of what's done. |
| Multi-repo builders | Secondary | Managing frontend, backend, and infra simultaneously; need cross-repo task routing. |
| Small agencies | Later | Client-focused builders who need project docs, handoff packs, and repeatable workflows. |
| Teams/Enterprise | Later | Only after collaboration, RBAC, auth, billing, and audit controls are production-grade. |

## 5. Pricing and Included Features

This pricing ladder is the preferred future commercial strategy. It may differ from the current in-app prototype subscription labels until billing and product packaging are updated.

| Plan | Price | Target User | Included Features |
|---|---:|---|---|
| Free | `$0` | Curious users, hobby testing | Full Build Loop (PLAN + CREW + FLOW + FORGE + Chat), local workspace, BYOK/Ollama, community agent packs, command approval, manual PLAN→CREW .md export. No sync, no tracing, no drift detection. No artificial item caps. |
| Solo | `$5/mo` | Budget solo developers | Everything Free plus basic execution tracing, PLAN→CREW direct Desktop sync, AI acceptance criteria generation, basic drift detection (Not Started / In Progress / Complete), basic docs generation, response modes, basic Cost Guard. |
| Solo Plus | `$9/mo` | Serious solo developers | Everything Solo plus full drift detection (Diverged + confidence scoring), trace history, cross-device sync, mobile/web PLAN with Desktop sync, voice input, richer Docs Autopilot, project memory, Cost Guard history. |
| Founder | `$15/mo` | Indie founders building products | Everything Solo Plus plus multi-repo plan scope, cross-repo drift detection, "What's Left" summary, plan versioning, plan item dependencies, agent specialization, PRD generator, architecture docs, roadmap/backlog docs, release checklist, founder summaries, monthly project health report. |
| Agency/Team | `$39/mo` | Small agencies or small teams | Everything Founder plus shared plan editing, team trace visibility, per-member execution history, client handoff packs, branded exported docs, collaboration preview, RBAC simulator, priority support. |
| Early Lifetime | `$99-$149 one-time` | Early supporters | Limited-time offer for Solo Plus or Founder-level access. Launches only after Preview Deck + execution tracing are working. Must not remain permanent. |

## 6. Revenue Goal Math

The realistic early monthly recurring revenue target is:

```text
$2k-$3k/month
```

Example path:

| Customer Mix | MRR |
|---|---:|
| 200 Solo users at `$5` | `$1,000` |
| 100 Solo Plus users at `$9` | `$900` |
| 30 Founder users at `$15` | `$450` |
| 10 Agency users at `$39` | `$390` |
| Total | `$2,740/month` |

This target is plausible without requiring the product to beat market leaders. It requires a focused product, clear messaging, and a small but loyal base of paying users.

## 7. Differentiation

### Primary Differentiator — The Build Loop

No competitor does this:

The Build Loop — PLAN → CREW → FLOW → FORGE — is a named, end-to-end project execution workflow that no competitor has:

- **Execution tracing:** after an agent run, Forge links the result back to the plan item that originated it using AI-generated acceptance criteria (structured verifiable conditions set at item creation: file_exists, symbol_exists, test_passes, git_grep, llm_check). Users see which item was targeted, which criteria were met, whether the item should close — automatically, not manually.
- **Plan drift detection:** Forge compares the codebase against the active plan on demand and after every agent run. It classifies each item as Complete, In Progress, Not Started, or Diverged — based on acceptance criteria evaluation against code evidence, not user status updates.
- **Multi-repo plan scope:** a single plan spanning multiple repos, with per-repo task assignment and agent routing. Cursor is file-level. Claude Code is session-level. Neither manages multi-repo projects.
- **Build Loop:** the only tool where a plan item can go from AI ideation (PLAN) → specialist refinement (CREW) → Kanban card (FLOW) → agent execution (FORGE) → verified closure without leaving the app or copy-pasting.

Cursor edits files. Claude Code runs tasks in a session. Codex executes jobs in a VM. None of them know what you're building, track completion, or surface drift. Forge does.

### Secondary Differentiators

- Zero Egress Mode: server-side enforcement that no workspace code reaches any external provider when enabled. Not a frontend toggle — a backend block.
- Custom local agents and skills per project, with community starter packs and Gist-based sharing.
- Project documentation as a first-class workflow (Docs Autopilot).
- Preview Deck for files, local app preview, terminal evidence, side chat, artifacts, and review status in one coding workspace.
- BYOK + local models (Ollama) for cost and privacy control.
- Cost Guard and concise prompt optimization.
- Affordable pricing for solo developers and founders.

## 8. Product Priorities

Prioritize in this order:

1. Desktop stability and polish.
2. Honest preview labels for simulated features.
3. Preview Deck for coding workspace supervision.
4. Docs Autopilot.
5. Cost Guard.
6. Smooth Ollama/local model setup.
7. Mobile companion as planning/monitoring, not full coding.
8. Founder and agency templates.
9. Stripe/payment integration after core value is polished.

## 9. Plan-Level Feature Meaning

### Free

Free is for trust-building and evaluation.

It should prove the product works locally without forcing a user into paid sync or cloud features too early.

### Solo

Solo is the main budget-friendly daily-driver plan.

It should feel cheap enough for independent developers while still offering real value beyond basic chat.

### Solo Plus

Solo Plus is for convenience and continuity.

It should unlock the features that make Kryleos Forge easier to use across machines and devices, especially sync, mobile companion behavior, voice input, and richer docs workflows.

### Founder

Founder is for people building products, not just writing code.

It should package planning, launch, documentation, and product-readiness outputs into repeatable workflows.

### Agency/Team

Agency/Team is for users who need to package work for clients or collaborate in small groups.

This plan can be priced higher because it supports business workflows. However, collaboration and RBAC must remain labeled as preview/simulator until they are production-grade.

### Early Lifetime

Early Lifetime can be used as an early-supporter funding mechanism.

It should be limited and time-bound. It should not become the default business model.

## 10. Commercial Principles

- Keep solo developer pricing approachable.
- Charge more only when the user is using the product to earn money.
- Do not bury core local-first value behind expensive tiers.
- Keep safety features such as command approval and graceful abort available across all tiers.
- Label preview/simulated features honestly.
- Use annual plans to improve cash flow without making monthly plans feel expensive.

## 11. Launch Messaging

### Primary Message (all surfaces)

> Kryleos Forge is the only AI coding tool that manages your project — from plan to board to execution — not just your current file.

This is the headline. Everything else is supporting copy.

### Demo Hook

> Import your plan. Watch tasks appear on your board. Click execute. See your plan close against real code changes.

### For Solo Developers

> You have a plan. Forge executes it, tracks what closed, and tells you what the code is missing. No more switching between a doc, a task tool, and an AI assistant.

### For Technical Founders

> Plan your product, not just your files. Forge manages multi-repo execution, traces every agent run back to your plan, and generates the docs your team needs — all local-first.

### Privacy-Focused Users

> Zero Egress Mode: when enabled, your code never reaches an external provider. Server-side block, not a frontend toggle.

### Early Lifetime Pre-Launch

> Kryleos Forge is in early access. Lock in lifetime Solo Plus or Founder access for a one-time payment before public pricing goes live. No subscription. No renewal.

This offer should run during Phase 3/4, but **only after the Preview Deck and execution tracing are both working**. Do not launch paid tiers — including Early Lifetime — before execution tracing is functional. The product promise must be demonstrable before asking anyone to pay. It should be capped by time or seat count and removed once the product reaches general availability.

### Messaging to Retire

The following messages must be retired from all surfaces. They position Forge as a price-competitive chat tool rather than a category-defining project execution tool:

- "Stop paying for five separate tools."
- "Affordable local-first AI coding workspace."
- "One workspace for AI coding, planning, documentation, voice capture, local models, and cost control."

These can survive as secondary supporting copy but must not be the headline on any surface.

## 12. Launch Timeline

Target window: **1–2 months** from current state. This is a race condition — Claude Code adding persistent project memory in 6–12 months would erode PLAN's primary differentiator. The durable moat is the visual Build Loop (CREW + FLOW + acceptance criteria tracing), which Anthropic cannot replicate with a single feature flag. Shipping fast and locking in early adopters before that window closes is the strategic priority.

Pre-launch gate: Preview Deck + execution tracing must both be functional before any paid tier or Early Lifetime offer goes live. Do not open payments before the product promise is demonstrable.

## 13. In-App Upgrade Conversion

The upgrade funnel before full Stripe integration:

1. **Tier gate nudge** — inline, below the locked action. Feature name + price + "Upgrade →". Never a blocking modal.
2. **Upgrade modal** — two-column tier comparison, specific locked feature highlighted, CTA opens Gumroad/Lemon Squeezy in browser.
3. **License key entry** — user receives key by email after payment, enters in CONFIG. Local hash validation, no server round-trip. Tier activates immediately.
4. **Stripe phase** — replaces license key entry post-launch. Same entry points, no UX redesign.

Key principles:
- No paywall on first launch — Free users must reach meaningful value before seeing any upgrade prompt.
- Upgrade prompts appear at the moment of value (when the user wants to use the feature), not on an arbitrary timer.
- Never show more than one upgrade prompt per session for the same feature.

## 14. Success Criteria

The strategy is working if:

- solo developers understand the product in one sentence,
- Free users can reach value quickly,
- Solo and Solo Plus feel affordable,
- Founder and Agency/Team plans justify their higher pricing through workflow outputs,
- simulated capabilities are not mistaken for production infrastructure,
- the product can plausibly reach `$2k-$3k/month` without needing mass-market scale.
