# Kryleos Forge User Guide

## 1. What Kryleos Forge Does

Kryleos Forge manages your project from plan to board to execution. You define what you're building, track it on a Kanban board, run AI agents to execute tasks, and the app shows you which plan items closed against real code changes — automatically.

The four spaces form the **Build Loop**: **PLAN → CREW → FLOW → FORGE**.

## 2. First Setup

1. Open Kryleos Forge. The app opens to the **Project Setup screen**.
2. Enter your project name.
3. Select your workspace folder (the root directory of your project).
4. Describe what you're building in 2–3 sentences — this seeds your PLAN.
5. Open `CONFIG` to set your model provider and API key, or configure Ollama for local models.
6. Click **Start Building** — you land in the PLAN Scratchbook with your description pre-loaded.

If you're connecting an existing codebase, the app detects this and runs the bootstrap flow (see Section 8).

## 3. Subscription Plans

| Plan | Price | What It Unlocks |
|---|---:|---|
| Free | $0 | All four Build Loop spaces, local workspace, BYOK models, Ollama, community agent packs, manual PLAN→CREW export. No sync, no execution tracing, no drift detection. |
| Solo | $5/mo | Execution tracing, AI acceptance criteria, basic drift detection, PLAN→CREW direct Desktop sync. |
| Solo Plus | $9/mo | Full drift detection (Diverged), trace history, cross-device sync, mobile/web PLAN with Desktop sync. |
| Founder | $15/mo | Multi-repo plan scope, plan item dependencies, unlimited What's Left, plan versioning, agent specialization. |
| Agency/Team | $39/mo | Shared plan editing, team trace visibility, client handoffs, branded docs, collaboration indicators. |
| Early Lifetime | $99–$149 one-time | Solo Plus or Founder access. Available only after Preview Deck + execution tracing are live. |

To upgrade: hit any locked feature → click "Upgrade →" → pay via the external link → enter your license key in CONFIG.

## 4. The Build Loop — Four Spaces

### PLAN

The PLAN tab has two areas side by side: the **Scratchbook** (left) and the **Plan Workspace** (right).

**Scratchbook — ideation chat:**

Chat freely with the AI to explore ideas, features, and requirements. Nothing you type here automatically updates your plan — the scratchbook is always a safe space to think. Session history persists so you can pick up where you left off.

When you've confirmed an idea in the conversation, click **Summarize & Push** at the bottom of the chat. The AI reads your conversation and generates structured items for your Plan Workspace. You review each item (edit the title, description, or category if needed) and confirm — then they appear in the workspace.

You can do this at any point in the project lifecycle — even if code is already running in FORGE.

**Plan Workspace — staging list:**

Each workspace item shows a title, 2–3 sentence description, category badge, status (Draft / Ready for CREW), and a collapsed "From conversation" block with the chat context that produced it.

Per item:
- **Check Feasibility** — optional, non-blocking. AI checks the idea against your project description and current FLOW board. Returns: ✓ Feasible, ⚠ Needs Clarification, or ✗ Potential Conflict. Item stays in the workspace regardless — you decide the next step.
- **Edit** — update title, description, or category at any time.
- **Delete** — remove from workspace.

**Workspace → CREW handoff:**
- Free: export selected workspace items as a structured `.md` file and paste into CREW manually.
- Solo+: select items and click **Push to CREW** — a diff shows what will change before anything transfers.

### CREW

Specialist agent review before execution. Three bundled personas are auto-suggested when you hand off from PLAN:

| Persona | What They Do |
|---|---|
| Technical Reviewer | Reviews feasibility, architecture consistency, implementation risk. |
| Scope Guard | Flags scope creep, ambiguous requirements, over-specified items. |
| Risk Identifier | Flags security, dependency, and operational risks before execution. |

CREW personas produce a structured plan document with `[ITEM]` blocks per task — status, suggested changes, and criteria hints. When you're done, click **Push to FLOW**. The app shows a diff of CREW's output against your existing FLOW tasks. You confirm before anything changes.

You can also install community agent packs from the CREW space with one click.

### FLOW

Your project board and execution prep. Returning users land here. A collapsible **Today** panel sits at the top of the Kanban board (Todo / In Progress / Done columns are always visible below it).

**Today panel** shows the top 3–5 non-done tasks, prioritized automatically by a deterministic score (no AI call): in-progress items with an active trace first, then recently unblocked items, then those with the most dependents, then oldest. It recalculates whenever the board changes.

- **Execute Next** — sends the highest-priority unblocked task to FORGE (traced to that plan item).
- **Execute All Today** — dispatches all unblocked Today tasks as one sequential batch directive; you still approve each command.

Each task card has these actions:
- **Run** (▶) — send the task to FORGE.
- **Criteria** (checklist icon) — open the acceptance-criteria editor; for an item with none, this drafts Phase 1 criteria (AI when a model is configured, deterministic otherwise) for you to review and **Save**.
- **Dependencies** (link icon) — pick which tasks must finish first. Options that would form a circular dependency are disabled.
- Move / Delete.

Cards show **badges**: drift status, category, criteria count, `trace`, `likely complete` (from bootstrap), and `blocked`. Blocked items are greyed — you can't send them to FORGE until every blocker is Done; they auto-unblock when blockers complete.

Board toolbar: **BOOTSTRAP** (scan existing code, flag likely-complete items — see Section 8) and **CHECK PLAN DRIFT** (Section 6).

### FORGE

Code execution and workspace inspection.

FORGE runs your plan items using specialist agents routed by task category:

| Category | Agent Used |
|---|---|
| frontend | React Expert |
| backend | Python Backend Specialist |
| security | Security Auditor |
| testing | Test Writer |
| infra | DevOps Specialist |
| docs | Documentation Writer |
| performance | Performance Reviewer |

If no specialist matches, the general orchestrator handles it with a visible indicator: "No [category] specialist — using general agent."

After execution, FORGE emits an **execution trace** — which files changed, which commands ran, and which acceptance criteria passed or failed. If all criteria pass, the app suggests marking the item Complete (you confirm).

The **Preview Deck** in FORGE gives you a right-side supervision surface: Files, Live Preview, Terminal, Side Chat, Artifacts, and Review.

## 5. Acceptance Criteria

Every plan item has acceptance criteria — the conditions that define "done."

**Phase 1 (abstract):** drafted on demand from the FLOW criteria editor — no file paths assumed. Types: `symbol_exists`, `test_passes`, `llm_check`. Example: `symbol_exists: "authenticateUser"`. AI-drafted when a model is configured, deterministic otherwise; you review and Save before they apply. Durable across refactors.

**Phase 2 (concrete):** enriched with real file paths from a workspace scan. Example: `file_exists: src/auth/LoginForm.tsx`. Run it from the FLOW criteria editor (`Scan & Enrich`) or the PLAN Build Loop enrichment banner. The app shows the added criteria as a diff — confirm or discard.

All drift detection and execution tracing evaluates criteria, never raw plan text.

## 6. Plan Drift Detection

Run "Check Plan Drift" at any time to see how your codebase compares to your plan.

Each item gets one of five classifications:

| Status | Meaning |
|---|---|
| Complete | All criteria pass against the current codebase. |
| In Progress | Some criteria pass, others don't. |
| Not Started | No criteria pass, no execution traces. |
| Diverged | Criteria fail in a conflicting way — code exists but contradicts the plan. Decided by a single targeted LLM call (cached per commit; capped per run, with "N deferred" shown when the cap is hit). |
| Needs Review | Low-confidence signals; manual inspection needed. |
| Blocked | Has unresolved dependencies (see Section 7). |

Drift runs automatically after every agent run. You can also trigger it manually.

**What's Left** (PLAN → Build Loop view): an AI-prioritized report of unresolved items, each with a one-line reason (deterministic ordering when no model is configured). Item limits: Free = 5, Solo = 25, Solo Plus = 50, Founder = unlimited + Markdown export. The first run right after bootstrap is free and unlimited regardless of tier.

## 7. Plan Item Dependencies

Open the **Dependencies** editor (link icon on a FLOW card) and check which tasks must finish first. Choices that would create a circular dependency are disabled. Blocked items are greyed in FLOW and can't be sent to FORGE until their blockers are Done; dependents unblock automatically when blockers complete.

## 8. Existing Project Bootstrap

When you point Forge at a workspace that already has code:

1. **Fingerprint** — the Project Setup screen scans the folder and shows what it found: languages, package managers, git, tests, file count ("Existing codebase detected").
2. **Bootstrap scan** — once you have tasks on the FLOW board, click **BOOTSTRAP**. For each task it ensures Phase 1 criteria exist (dropping `llm_check` for this scan), evaluates the structural criteria against the code, and flags items whose criteria all pass with a **`likely complete`** badge for you to confirm. A bootstrap execution trace is saved per flagged item. Nothing is marked Done automatically.
3. **Free first What's Left run** — the run right after bootstrap is unlimited regardless of tier.

## 9. Multi-Repo Projects (Founder)

Plan items can carry a `workspace` field pointing to a specific repo directory. In FLOW, tasks are grouped by repo. When you send a multi-repo item to FORGE, the agent activates the correct workspace sandbox automatically.

## 10. Command Approval and Safety

Forge never silently runs shell commands. When an agent proposes a command:

1. The workflow pauses.
2. You see `[APPROVE & RUN]` or `[REJECT]` in the terminal.
3. You decide. If you approve, the command runs and output is logged.

You can stop any active workflow with `[STOP CURRENT WORKFLOW]` — active processes terminate, locks release, and the app returns to idle.

**Zero Egress Mode:** toggle in CONFIG. When enabled, all non-Ollama provider calls are blocked server-side and a persistent `[LOCAL ONLY]` badge appears. Your code never leaves your machine.

## 11. Custom Agents and Skills

Store custom agents under `.kryleos/agents/` and skills under `.kryleos/skills/`. The app loads them automatically.

- JSON agents: `{ "name": "...", "role": "...", "prompt": "..." }`
- Markdown agents: filename = role, content = prompt.
- Skills: JS/TS scripts or Markdown procedural instructions.

Share any agent as a GitHub Gist from the CREW space with the **Share Agent** button.

## 12. Workspace Rules

Place a `.cursorrules` or `.cursor/rules` file in your workspace root. The app loads it and appends its content to every agent system prompt. Compatible with existing Cursor configurations.

## 13. Model Providers

All tiers support BYOK. Forge charges for the workflow layer — not AI compute.

Supported providers: DeepSeek, Gemini, OpenAI, Anthropic, OpenRouter, Ollama.

**Minimum recommended models for Build Loop features:**

| Feature | Minimum | Recommended |
|---|---|---|
| FORGE execution | Any tool-use model | Claude Sonnet, DeepSeek V3, GPT-4o |
| Acceptance criteria, CREW, drift | Claude Haiku, Gemini Flash, GPT-4o-mini | Claude Sonnet, GPT-4o |

A non-blocking warning appears at model setup if your selected model is below the recommended threshold for Build Loop features.

## 14. Mobile Companion (Solo Plus+)

The Kryleos Forge Mobile Companion (native iOS/Android) extends the Build Loop to your phone:

- **Today view** — same 3–5 prioritized tasks as Desktop FLOW. Tap **Execute** to trigger a FORGE run on Desktop.
- **PLAN** — Scratchbook ideation on mobile, same as Desktop. Messages sync to Desktop session (Solo Plus+).
- **Push notifications** — get notified when a FORGE run completes on Desktop.

Execution always runs on Desktop — mobile triggers it, Desktop runs it with full approval gates.

## 15. Troubleshooting

**Backend is offline** — confirm port 3001 isn't in use; restart `npm run dev`; check terminal logs.

**Model calls fail** — confirm API key is valid; for Ollama, confirm the local service is running.

**Workspace operations fail** — confirm the workspace path is valid and inside the configured root.

**Git operations fail** — confirm the workspace is a Git repo; confirm remote credentials if pushing.

**Execution trace not appearing** — confirm the agent run was triggered from a plan item; check `.kryleos/traces/` for the JSON file.

**Criteria not enriching (Phase 2)** — confirm a workspace is selected; dismiss and recheck the enrichment banner in PLAN.
