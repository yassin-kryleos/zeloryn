# Preview Deck and Workspace Panes

## 1. Purpose

This document defines the planned Kryleos Forge Preview Deck: a dockable right-side workspace surface inspired by the strongest practical ideas in Claude Code, Codex, and Antigravity.

The goal is not to clone any competitor. The goal is to give solo developers a compact, useful supervision surface where they can inspect files, preview running apps, watch terminal output, ask side questions, and review generated artifacts without leaving Kryleos Forge.

## 2. Product Positioning

The Preview Deck is the execution visibility surface for Forge's **Build Loop** (PLAN → CREW → FLOW → FORGE). When the FORGE agent runs a plan item, the user watches it happen in the Preview Deck: terminal output streams in real time, files change in the Files tab, and the execution trace (with acceptance criteria checklist results) appears in the Review summary. The deck is where the plan-to-code loop becomes visible.

It should support the primary product promise:

> The only AI coding tool that manages your project — from plan to board to execution — not just your current file.

The Preview Deck is the answer to "how do I know what the agent actually did?" — the surface that connects agent execution to acceptance criteria evidence.

## 3. Competitor-Inspired Feature Mix

| Source Inspiration | Useful Idea | Kryleos Forge Adaptation |
|---|---|---|
| Claude Code Desktop | Arrangeable panes for chat, diff, preview, terminal, file, plan, tasks, and subagent. | Start with a fixed right-side deck, then add dock/resize support after the MVP is stable. |
| Claude Code Desktop | Embedded app preview and preview server controls. | Add local dev-server detection, start/stop controls, and embedded browser preview for local URLs. |
| Claude Code Desktop | Static file previews for HTML, PDFs, images, and videos. | Add rich artifact/file preview for common generated outputs and docs. |
| Codex Desktop | In-app browser for frontend iteration and rendered UI inspection. | Add a browser preview tab that opens local apps, public docs, and generated HTML safely. |
| Codex Desktop | Multiple files/terminals and artifact-oriented review. | Add preview tabs for Files, Terminal, Artifacts, and Review context. |
| Antigravity | Agent access across editor, terminal, and browser. | Keep the user in control with approval gates, while letting the agent reference preview state and terminal evidence. |

## 4. MVP Scope

### Preview Deck Tabs

The first implementation should add a right-side Preview Deck in the coding workspace with these tabs:

1. **Files**
   - Browse project files.
   - Open file preview/edit panel.
   - Pin recent files.

2. **Live Preview**
   - Open a local URL such as `http://localhost:3000`.
   - Detect common dev ports from terminal output where possible.
   - Refresh preview.
   - Open preview externally.
   - Show preview status: `Not configured`, `Starting`, `Running`, `Stopped`, or `Error`.

3. **Terminal**
   - Show command history and output evidence.
   - Provide command approval state.
   - Show active execution trace progress in real time when an agent run is in flight (linked to the originating plan item).
   - MVP may be a terminal log viewer, not a full interactive PTY.
   - Full interactive terminal should be treated as a later feature.

4. **Side Chat**
   - Ask a side question using current workspace/session context.
   - Side chat must not derail the active main agent workflow.
   - Side chat should be clearly labeled as context-only unless it can write files through normal approval paths.

5. **Artifacts**
   - Preview generated Markdown, HTML, images, PDFs, and exported docs.
   - Connect with Docs Autopilot outputs.
   - Provide open, copy path, and export actions.

6. **Review**
   - Surface the existing Git-backed Review tab state in a compact panel.
   - Show changed file count, risk notes, and latest command/test evidence.
   - After Phase 2.6, also show the execution trace linked to the last agent run: which plan item was executed, what closed, what the agent changed.

## 5. Non-MVP Scope

Do not try to build these in the first slice:

- Full drag-and-drop pane layout.
- Multiple independent terminal PTYs.
- Browser automation/clicking by the agent.
- Persistent browser profiles/cookies.
- Remote preview tunnels.
- SSH/devbox preview.
- Multi-user shared preview sessions.
- Production-grade computer-use control.

These can be later Pro, Founder, or Agency workflow enhancements after the local Solo workflow is stable.

## 6. Technical Strategy

### Frontend Components

Add planned components under `Desktop-app/src/components`:

```text
PreviewDeck.tsx
PreviewLivePane.tsx
PreviewTerminalPane.tsx
PreviewSideChatPane.tsx
PreviewArtifactsPane.tsx
PreviewReviewSummary.tsx
```

### App Integration

`App.tsx` should own:

- whether the Preview Deck is open,
- active preview tab,
- current preview URL,
- detected dev server candidates,
- artifact list,
- side chat session ID,
- compact review summary.

The existing right-side file explorer in the coding workspace can become the first Preview Deck tab rather than a separate competing panel.

### Backend Additions

Add local backend routes only as needed:

```text
GET /api/preview/servers
POST /api/preview/server/start
POST /api/preview/server/stop
GET /api/artifacts
GET /api/artifacts/content?path={path}
```

MVP server start/stop can call approved commands through the existing command approval model. Do not silently start dev servers from agent output.

### Security Rules

- Only load local URLs or user-entered public URLs in the preview pane.
- Clearly label browser preview as local/user-directed, not autonomous computer use.
- Do not allow preview pages to bypass command approval.
- Do not expose API keys or workspace secrets into preview iframe/webview contexts.
- Treat public web pages as untrusted content.
- Keep the agent's browser-control capability planned until a dedicated safety design exists.

## 7. UX Strategy

The Preview Deck should feel utilitarian and fast:

- icon tabs with tooltips,
- compact status bar,
- clear empty states,
- resizable width after MVP,
- keyboard shortcuts after MVP,
- no marketing copy inside the work surface,
- no nested card-heavy layout.

Recommended tab order:

```text
Files | Live Preview | Terminal | Side Chat | Artifacts | Review
```

Recommended shortcut targets after MVP:

```text
Ctrl+P  Files
Ctrl+Shift+P  Live Preview
Ctrl+`  Terminal
Ctrl+;  Side Chat
```

## 8. Implementation Phases

### Slice 1: Deck Shell

- Replace the current coding right panel with a `PreviewDeck`.
- Keep existing File Browser as the Files tab.
- Add placeholder tabs for Live Preview, Terminal, Side Chat, Artifacts, and Review.
- Mark non-implemented tabs as `Planned` or `Preview`.

### Slice 2: Live Preview MVP

- Add URL input.
- Add iframe/webview preview for local URLs.
- Add refresh/open-external controls.
- Add detected server candidates from known ports and recent terminal logs.

### Slice 3: Terminal Evidence Pane

- Show command history from session logs.
- Show pending approval status.
- Show latest stdout/stderr.
- Keep full interactive PTY out of MVP unless safety and lifecycle handling are ready.

### Slice 4: Side Chat MVP

- Add side chat input and response stream.
- Use current workspace context.
- Keep writes disabled or route writes through the same command/file approval and review paths.

### Slice 5: Artifacts Pane

- List generated docs and outputs.
- Preview Markdown/HTML/text.
- Link to Docs Autopilot output paths.

### Slice 6: Review Summary

- Reuse existing Git-backed review data.
- Show changed count, risk notes, and verification evidence.
- Provide a button to open the full Review tab.

## 9. Acceptance Criteria

- Coding workspace has a visible Preview Deck with `Files`, `Live Preview`, `Terminal`, `Side Chat`, `Artifacts`, and `Review` tabs.
- Existing file browser behavior still works.
- Live Preview can render a user-entered local dev URL.
- Terminal pane shows command evidence and pending approval state.
- Side Chat can answer context questions without interrupting the main workflow.
- Artifacts pane can preview generated Markdown/text outputs.
- Review summary reflects current Git-backed review state.
- All incomplete capabilities are labeled `Preview`, `Planned`, or `Simulator` honestly.
- Build, tests, and lint pass after each implementation slice.

## 10. UI Professionalization Requirements

The same sprint that ships the Preview Deck must also ship the following UI professionalization changes. These are not cosmetic — they affect the first impression of every new user.

### V1 Implementation Status

The current V1 implementation has shipped:

- `PreviewDeck.tsx` in the FORGE workspace.
- Files tab with existing File Browser and Code Graph access.
- Live Preview tab with user-entered URL, refresh, open-external action, and sandboxed iframe rendering.
- Terminal tab with current session command evidence and pending approval state.
- Side Chat tab as a local context-only pane.
- Artifacts tab backed by `GET /api/artifacts` and `GET /api/artifacts/content`.
- Review tab using the existing Git-backed `CodeReviewPanel`.
- `theme-forge` as the default theme.
- Matrix Rain moved behind the optional `matrix` theme.
- Primary nav labels cleaned to `Plan`, `Crew`, `Flow`, and `Forge`.

Still pending:

- dev-server auto-detection suggestions,
- full interactive PTY,
- autonomous browser control,
- remote preview tunnels,
- drag-and-drop pane layout,
- richer media artifact previews.

### Default Theme

- Ship `theme-forge` as the default CSS class applied on first launch.
- `theme-forge` must use a dark background with matrix green used only as an accent colour: active states, status indicators, focused borders, and highlights.
- Matrix green must not be applied as primary body text colour. Most text should be white or light grey.
- `theme-matrix` remains available as a user-selectable preference.

### CodeRain Background

- Remove `CodeRain.tsx` from the default app background.
- Move it to an opt-in setting accessible from the preferences/config panel.
- The default state on first launch must show no animated background.
- CodeRain can be labelled something like "Matrix Rain Effect" in preferences to preserve its identity as an Easter egg.

### Tab Label Cleanup

- Primary tab labels in the navigation must be four plain words: `Plan`, `Crew`, `Flow`, `Forge`. The Chat tab is removed — PLAN absorbs chat functionality via its Build/Ask mode toggle.
- Remove all bracket/function-key annotations from the visible tab label text (e.g. remove `[F1]` or `(Comms)`).
- Keyboard shortcut hints may remain in tooltips and keyboard shortcut documentation, but not in the rendered tab label itself.

## 11. Community Agent Starter Packs in CREW

The CREW space must surface community agent starter packs in this sprint alongside the Preview Deck work.

### Surfacing Rules

- When a user opens the CREW space and has no custom agents installed, show a prominent starter pack panel above or in place of the empty agents list.
- When custom agents are installed, show the starter pack panel as a collapsed section titled "Get more agents" or similar.
- Each starter pack card must show: agent name, one-sentence description, and an `Install` button.

### Bundled Packs (V1)

| Agent Name | Primary Purpose |
|---|---|
| React Expert | Frontend component review, refactoring, and hook patterns. |
| Security Auditor | Security and dependency risk review. |
| Test Writer | Unit and integration test generation. |
| Documentation Writer | Inline doc, README, and API documentation. |
| Performance Reviewer | Bundle size, query, and runtime performance analysis. |
| Python Backend Specialist | Python API, data pipeline, and Django/FastAPI patterns. |
| DevOps Specialist | Docker, CI/CD pipelines, GitHub Actions, and deployment configuration. |

### CREW Specialist Personas (also bundled, auto-suggested on PLAN→CREW handoff)

| Persona | Primary Purpose |
|---|---|
| Technical Reviewer | Reviews plan for technical feasibility, architecture consistency, and implementation risk. |
| Scope Guard | Identifies scope creep, ambiguous requirements, and over-specified items that could delay delivery. |
| Risk Identifier | Flags security, dependency, and operational risks embedded in the plan before execution begins. |

These three personas are auto-suggested as a bundle when a user initiates a PLAN→CREW handoff, and are available on all subscription tiers.

### Install Behavior

- One-click install copies the agent definition JSON into `.kryleos/agents/`.
- Installed agents appear immediately in the agent list without restart.
- No network request is made — packs are bundled with the binary.

### Share Agent

- A `Share Agent` button on each installed agent must export the agent definition as a GitHub Gist via the existing `/api/artifacts/publish` route.
- After publishing, the user sees the Gist URL to share.

## 12. Plan→Flow Task Sync

The Plan→Flow sync and `Send to FORGE Agent` controls must ship in the same sprint as the Preview Deck. The PLAN space is the entry point; the FLOW Kanban and FORGE agent are the destinations.

### Workflow

1. User ideates in the PLAN space using any configured AI provider (same orchestration as Chat). The plan builds across sessions toward a refinable spec.
2. When a plan item is created, AI generates structured acceptance criteria for it. User reviews before saving.
3. The app parses checklist items from the plan (markdown `- [ ]` items or numbered task lines).
4. A prompt appears: "Add these X tasks to your FLOW board?"
5. User accepts: items are added to the FLOW Kanban board as `Todo` cards, with category tags and any dependency relationships.
6. On any individual plan item, a `Send to FORGE Agent` button is visible (disabled if the item has unresolved blockers).
7. Clicking it routes that item to the specialist agent matching its category in the FORGE space.
8. The user can navigate between PLAN, CREW, FLOW, and FORGE — the Build Loop — without losing context.
9. Free users export PLAN as a structured .md to hand off to CREW. Paid users use direct sync.

### What Not to Do

- Do not auto-execute plan items silently. User must explicitly send to FORGE.
- Do not populate the Kanban board without user confirmation.
- Do not mix plan items from different imports without clear labeling.

## 13. Launch Position

The Preview Deck is the visual proof of Forge's Build Loop. When demoing the product, the deck is what shows the agent's work in real time and connects it back to the plan's acceptance criteria.

For early Solo/Solo Plus launch, market this as:

> Watch your Build Loop close. The Preview Deck shows files changing, terminal output streaming, acceptance criteria ticking off, and plan items closing — in real time, from one surface.

Supporting:

> CREW Specialist Personas: Technical Reviewer, Scope Guard, and Risk Identifier review your plan before you execute. Install in one click.

> Community Agent Packs: install specialist coding agents in one click. Share your own.

> Plan to Board: ideate in PLAN, send to CREW for review, push to FLOW board, execute in FORGE — the full Build Loop without leaving the app.

Avoid claiming:

- autonomous browser control,
- production computer use,
- remote preview tunnels,
- full IDE replacement,
- full Claude/Codex/Antigravity parity.
