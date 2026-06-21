# User Experience and Flows

## UX Principles

- Begin with the user's project, not an empty chat.
- Keep Plan, Crew, Flow, and Forge visually distinct.
- Never mutate important state without review.
- Label incomplete infrastructure honestly.
- Put execution evidence close to the task it came from.
- Use calm, professional UI. Matrix-style visuals may remain as an opt-in theme, not the default.

## Primary Navigation

Top-level spaces:

- Plan.
- Crew.
- Flow.
- Forge.

Labels must be plain words. Keyboard shortcuts can appear in tooltips, not primary tab labels.

## First-Run Flow

1. App launches.
2. If setup is incomplete, show Project Setup.
3. User enters:
   - Project name.
   - Workspace folder.
   - Description of what they are building.
   - Model provider setup or skip.
4. User clicks Start Building.
5. App opens Plan Scratchbook with the project description preloaded.
6. App offers to generate or import plan items.
7. User reviews generated items before they enter Plan Workspace.

## Existing Codebase Bootstrap Flow

1. User selects workspace.
2. App scans workspace.
3. App shows project fingerprint.
4. App opens guided Scratchbook:
   - "Tell me what this project does and what is already done."
5. App generates plan items and Phase 1 criteria.
6. App evaluates structural criteria using scan evidence.
7. App proposes likely-complete items.
8. User confirms or rejects each likely-complete proposal.
9. App stores bootstrap evidence as traces.
10. App runs first What's Left report.

## PLAN Flow

Scratchbook:

- User ideates in natural language.
- The session persists.
- Chat messages do not change Plan Workspace automatically.

Summarize and Push:

1. User clicks Summarize and Push.
2. AI extracts one or more structured items.
3. User sees a review modal.
4. User edits title, description, category, and context if needed.
5. User confirms.
6. Items appear in Plan Workspace as Draft.

Plan Workspace:

- User can edit items.
- User can check feasibility.
- User can mark items Ready for CREW.
- User can export Markdown on Free tier.
- User can sync to CREW on Solo and above.

## CREW Flow

1. User sends selected plan items to CREW.
2. App suggests bundled personas:
   - Technical Reviewer.
   - Scope Guard.
   - Risk Identifier.
3. Personas produce structured Markdown.
4. App parses `### [ITEM]` blocks.
5. User reviews revisions and flags.
6. User clicks Push to FLOW.
7. App shows diff:
   - New tasks.
   - Modified tasks.
   - Unchanged tasks.
   - Conflicts.
8. User confirms before FLOW changes.

## FLOW Flow

Default returning view: Today.

Today includes:

- 3-5 prioritized unblocked items.
- Execute Next.
- Execute All Today.
- Swap in/out controls.
- Visible blocker/category/workspace labels.

Kanban includes:

- Todo.
- In Progress.
- Done.

Task detail includes:

- Description.
- Category.
- Workspace.
- Blockers.
- Acceptance criteria.
- Trace history.
- Drift status.
- Actions: Break down, Estimate, Execute.
- Optional action: Run with Swarm.

## FORGE Flow

1. User starts execution from Flow or Plan item shortcut.
2. App selects agent:
   - Exact category match.
   - Capability overlap.
   - General orchestrator fallback.
3. Agent receives plan item context and workspace.
4. Agent streams reasoning/status/logs.
5. Agent actions appear in the tool activity timeline.
6. If a write, execute, network, or admin tool needs approval, app pauses for approval.
7. User approves, rejects, or stops workflow.
8. Agent writes files only inside allowed workspace.
9. App captures files changed, commands, tool invocations, outcomes, and criteria results.
10. User reviews trace and Git review.
11. User confirms status update if criteria pass.

## Native Task Swarm UX

1. User clicks Run with Swarm from a Flow task.
2. App shows planned lanes before execution:
   - Coordinator.
   - Builder.
   - Reviewer.
   - Conditional Tester, Security, Docs, or DevOps lanes.
3. App starts the swarm only after blocker checks pass.
4. Forge shows a swarm timeline with lane status, assigned goal, files touched, commands, and summaries.
5. Tool and command approvals remain the same approval UI used by normal Forge runs.
6. Stop Current Workflow stops all active lanes and marks the swarm run aborted.
7. Trace and review screens group evidence by lane.

## Learning Review UX

Learning Review shows:

- Pending recommendations.
- Recommendation type.
- Confidence.
- Evidence references.
- Approve.
- Reject.
- Rollback for applied recommendations.

Learning recommendations must never apply silently. Approved recommendations appear as local learning hints in future swarm/Forge runs.

## Tool and Command Approval UX

Approval prompt must show:

- Tool.
- Action summary.
- Invocation ID.
- Command ID when the tool runs a shell command.
- Destination when the tool uses network access.
- Destructive classification if applicable.
- Permission level: read, write, execute, network, or admin.
- Approve and Run.
- Reject.
- Stop Current Workflow.

Stale approvals must be rejected by invocation ID.

Mobile approvals must require signed device messages.

Remote approval is allowed only for tools marked `remoteApprovalAllowed`.

## Tool API and MCP Config UX

Config must provide:

- Built-in tool registry with status, permission, and approval policy.
- Provider capability detection for native tool/function calling.
- MCP server list with enabled/disabled status.
- Add/test/discover MCP server flow.
- Tool allowlist and denylist controls per MCP server.
- Tool audit log viewer with redacted arguments.

MCP servers must not become active until the user tests and enables them.

## Git Review UX

Review tab must show:

- Changed file list.
- Working vs staged status.
- Additions/deletions.
- Risk notes.
- Diff preview.
- Evidence from commands/tests.
- Accept/reject status.
- Stage/unstage.
- Safe revert.

Review status is advisory. Git remains source of truth.

## Preview Deck UX

Tabs:

- Files: reuse file browser.
- Live Preview: user-entered local URL plus refresh/open controls.
- Terminal: command evidence, stdout/stderr, pending approval.
- Side Chat: context Q&A only, no file writes or commands.
- Artifacts: Markdown/text/HTML preview.
- Review: compact Git review summary.

Unavailable panes should be labeled Preview, Planned, Simulator, or Mock.

## Mobile Companion UX

Mobile home:

- Pairing status.
- Today tasks.
- Current active agent/run.
- Latest trace.
- Pending approvals.
- Offline notes.

Remote approval:

- Vibrate/notify on approval request.
- Show command text.
- Show destructive warning if needed.
- Require explicit confirmation for destructive commands.
- Sign approve/reject/stop/start messages.

Offline notes:

- User can capture planning notes without connection.
- Notes sync to desktop Scratchbook after signed pairing.
- Offline FORGE execution is out of scope.

## Web Companion UX

Web supports:

- Product landing/marketing.
- Pricing.
- Planning draft.
- Desktop sync/import.
- Demo Build Loop simulation.
- Settings.
- Auth/account preview.

Web must not imply it is a full cloud IDE unless real hosted infrastructure exists.

## Upgrade UX

When user hits a tier gate:

- Show inline nudge below the locked action.
- Include feature name, tier, and price.
- Open a comparison modal on Upgrade.
- Link to checkout or license flow.
- Do not block unrelated work.
