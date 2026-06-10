# Developer Workflow Safety

## 1. Overview

Kryleos Forge now includes developer-focused workflow and safety features inspired by modern AI coding environments. These features improve control over shell execution, workspace-specific rule loading, active workflow interruption, and explicit sandbox permissions.

Core capabilities:

- Interactive command approvals and confirmations.
- Git-backed code review before commit.
- `.cursorrules` compatibility engine.
- Graceful agent interrupts through Ctrl+C-style abort simulation.
- Local autocompletion integration hooks.
- Explicit sandbox permission modal patterns.

## 2. Interactive Command Approvals

### Purpose

Agent-proposed shell commands should not always execute silently. When the orchestrator schedules a CLI command, Kryleos Forge pauses the agent loop and asks the user to approve or cancel the command.

### Backend Behavior

Implementation references:

- `Desktop-app/src/backend/agents.ts`
- `Desktop-app/src/backend/server.ts`

Expected behavior:

- `AgentOrchestrator` parses proposed tool actions.
- If the action is `tool: runCommand`, the orchestrator enters `commandPendingApproval` state.
- The agent loop pauses while awaiting a WebSocket response.
- `server.ts` maps WebSocket message `type: "approve_command"` to resume or reject execution.
- Approval messages include `approved` and the backend-generated `commandId`.
- Stale approvals are rejected when the supplied `commandId` does not match the active pending command.
- Cancel/deny behavior releases the lock and returns a controlled cancellation result to the agent log.

### Frontend Behavior

Implementation references:

- `Desktop-app/src/components/ChatConsole.tsx`

Expected behavior:

- Pending command logs render an approval panel.
- The panel should show the proposed command clearly.
- Actions:
  - `[APPROVE & RUN]`
  - `[REJECT]`
- Approval resumes the backend loop.
- Cancellation prevents execution and updates the terminal log.
- `App.tsx` stores `tool`, `command`, and `commandId` in `commandPendingApproval`.

## 3. `.cursorrules` Compatibility Engine

### Purpose

Kryleos Forge should respect workspace-level developer rules already used by Cursor-compatible projects.

### Discovery Paths

The backend scans the workspace root for:

```text
.cursorrules
.cursor/rules
```

### Backend Behavior

Implementation reference:

- `Desktop-app/src/backend/agents.ts`

Expected behavior:

- If discovered, rule contents are read from the workspace root.
- Rules are parsed/formatted as developer instructions.
- Rules are appended to the agent system instructions prompt.
- Existing Kryleos and legacy rule files may still be loaded according to the broader workspace instruction loading flow.

### Rule Precedence

Recommended precedence:

1. Explicit user custom instructions from the config UI.
2. Workspace rules such as `.cursorrules` and `.cursor/rules`.
3. Existing project instruction files such as `.kryleosrc.json`, `.matrixcode.json`, `CLAUDE.md`, `.clauderc`, and `INSTRUCTIONS.md`.
4. Built-in Kryleos Forge agent instructions.

## 4. Graceful Agent Interrupts

### Purpose

Users need a reliable way to stop an active agent workflow without closing the app or leaving the orchestrator locked.

### Frontend Behavior

Implementation reference:

- `Desktop-app/src/App.tsx`

Expected behavior:

- While `isStreaming` is active, the top status/header area renders a red `[STOP CURRENT WORKFLOW]` button.
- Clicking the button sends a WebSocket message:

```json
{
  "type": "abort_execution"
}
```

### Backend Behavior

Implementation references:

- `Desktop-app/src/backend/server.ts`
- `Desktop-app/src/backend/agents.ts`
- `Desktop-app/src/backend/tools.ts`

Expected behavior:

- `server.ts` listens for `type: "abort_execution"`.
- The active orchestrator receives an abort request.
- `killActiveProcesses()` terminates active command child processes.
- Streaming locks and pending approval locks are released.
- UI state returns to a safe idle state.
- If the workflow is waiting for command approval, abort resolves that pending approval as rejected.

## 5. Process Termination

The backend should keep track of active command child processes created during `runCommand`.

Expected `killActiveProcesses()` behavior:

- Terminate any currently running child processes.
- Clear active process references.
- Mark the interrupted command as cancelled.
- Broadcast an abort/status update to the frontend.
- Avoid leaving the orchestrator in a locked or streaming state.

Reviewed implementation details:

- `WorkspaceSandbox` tracks child processes created by `runCommand`.
- Child processes are removed from tracking on `close` and `error`.
- `AgentOrchestrator.abortExecution()` sets `isAborted`, rejects pending approval, and calls `killActiveProcesses()`.
- `server.ts` reports how many active command processes were terminated.

## 6. Sandbox Permission Modals

### Purpose

Sandbox permission prompts make risky actions explicit, especially when a command may affect files, execute processes, or cross a configured trust boundary.

### Expected UX

- Show the proposed command or action.
- Explain why permission is needed.
- Offer approve/cancel controls.
- Preserve the decision in the terminal log.
- Never hide command execution behind silent agent behavior.

### Relationship to Tiers

Command approval applies across all tiers. Remote/local execution banners still apply:

- Free/Solo/Solo Plus: `[WARNING: LOCAL HOST EXECUTION ACTIVE]`
- Founder/Agency/Team (future remote container): `[REMOTE CONTAINER SIMULATOR ACTIVE]`

## 7. Git-Backed Code Review

### Purpose

AI-generated file edits should be reviewed against the real workspace state before users stage, commit, or ship them.

### Backend Behavior

Implementation references:

- `Desktop-app/src/backend/tools.ts`
- `Desktop-app/src/backend/server.ts`

Expected behavior:

- `/api/review/current` reads Git status and returns working/staged diffs.
- `/api/review/status` persists `pending`, `accepted`, `rejected`, `staged`, and `reverted` review states.
- Review state is stored under `.kryleos/reviews/review-state.json`.
- `/api/review/stage` stages or unstages files through Git.
- `/api/review/revert` restores tracked files through Git.
- Untracked reverted files are moved into `.kryleos/reverted/` rather than deleted.
- Non-Git workspaces fall back to session-level agent diff logs where available.

### Frontend Behavior

Implementation reference:

- `Desktop-app/src/components/CodeReviewPanel.tsx`

Expected behavior:

- The coding Review tab shows changed files, additions/removals, working diffs, staged diffs, risk notes, evidence logs, and persistent review status.
- Accept and Reject are persistent review decisions.
- Stage and Unstage affect Git state.
- Revert is explicit and conservative.
- Open File previews the current workspace file.

## 8. Local Autocompletion Hooks

The latest structure includes local autocompletion integration hooks. Documentation should treat this as a developer experience feature that can be expanded to include:

- File path suggestions for `@` mentions.
- Command suggestions.
- Skill/agent name suggestions.
- Workspace symbol suggestions.

## 9. Manual Verification

### Rules Override Verification

1. Add a dummy `.cursorrules` file in the workspace root.
2. Include a rule such as:

```text
Always start replies with [FORGE-RULE] CODE:
```

3. Ask the agent a simple question.
4. Confirm the answer follows the injected rule.

### Command Approval Verification

1. Ask for a task that requires a terminal command, such as running lint.
2. Confirm the agent proposes the command instead of silently running it.
3. Confirm the terminal displays `[APPROVE & RUN]` and `[REJECT]`.
4. Approve the command.
5. Confirm stdout/stderr are logged after approval.
6. Reject a second command and confirm it does not execute.
7. Confirm stale `commandId` approvals are rejected.

### Graceful Interrupt Verification

1. Start a long-running command or agent workflow.
2. Click `[STOP CURRENT WORKFLOW]`.
3. Confirm active command processes terminate.
4. Confirm the UI stops streaming and returns to idle.
5. Confirm the orchestrator can accept a new request.

### Git Review Verification

1. Open a Git workspace with tracked, staged, and untracked changes.
2. Open the coding Review tab.
3. Confirm working and staged diffs render separately.
4. Accept a file and refresh; confirm status persists.
5. Reject a file and refresh; confirm status persists without reverting.
6. Stage and unstage a file from the Review tab.
7. Revert a tracked file and confirm Git restores it.
8. Revert an untracked file and confirm it moves into `.kryleos/reverted/`.

## 10. Latest Reviewed Verification

- `npm.cmd run build` passes for `Desktop-app`.
- `npm.cmd test` passes for the current backend/frontend test suite.
- `npm.cmd run lint` passes with React hook dependency warnings that predate the Review tab changes.
