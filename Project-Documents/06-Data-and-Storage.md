# Data and Storage

## 1. Data Categories

Kryleos Forge handles these categories of data:

- Workspace files selected by the user.
- PLAN sessions (Build/Ask mode), Build Loop agent logs, and execution traces.
- Plan items, acceptance criteria, execution traces, and project checklists.
- Model provider API keys.
- Git remote/token configuration.
- Google OAuth tokens.
- Kryleos Sync account state.
- Subscription tier and account role state.
- Custom agents and skills.
- Workspace rule files such as `.cursorrules` and `.cursor/rules`.
- Pending command approval state during active agent workflows.
- Backend-generated pending command IDs for active approval prompts.
- In-memory active child process references for currently running shell commands.

## 2. Workspace Data

The selected workspace is the main project directory. All file operations should resolve paths inside that directory.

Important workspace folders:

```text
.kryleos/agents
.kryleos/skills
```

Workspace rule files:

```text
.cursorrules
.cursor/rules
```

These files are read as developer instruction inputs and appended to agent system prompts when present.

Legacy fallback folders:

```text
.matrix/agents
.matrix/skills
```

## 3. Custom Agent Format

JSON agents should include:

```json
{
  "name": "API Reviewer",
  "role": "api_reviewer",
  "prompt": "Review API code for consistency, validation, and error handling."
}
```

Markdown agents use the filename as the role and the Markdown content as the prompt.

## 4. Custom Skill Format

Supported skill types:

- JavaScript or TypeScript executable scripts.
- Markdown procedural instructions.

Scripts receive an arguments file path during execution. Markdown skills are injected as instructions for the agent to follow.

## 5. Local UI State

The frontend stores app preferences in localStorage. Some keys still use legacy lowercase `matrix_*` names for compatibility.

Examples:

- API key inputs.
- selected model.
- theme.
- custom instructions.
- last sync timestamp.
- tutorial completion.

## 6. Backend State

Backend data includes:

- PLAN session database (Build/Ask mode sessions).
- Plan item records with fields: `id`, `title`, `status`, `category`, `workspace`, `blockedBy[]`, `criteria[]`.
- Acceptance criteria per plan item (stored under `.kryleos/criteria/` or embedded in plan item record): `file_exists`, `symbol_exists`, `test_passes`, `git_grep`, `llm_check` types.
- Execution trace records under `.kryleos/traces/` linking agent runs to plan items with per-criterion pass/fail results.
- Account/sync simulation JSON files in the user home directory.
- Tier and role metadata used by `sync.ts` for subscription gates and RBAC simulator checks.
- Credential JSON file in the user home directory.
- Google tokens where configured.

## 7. Data Retention

Current behavior is local-first. Data remains on the user machine unless explicitly synced or published.

Free-tier users do not sync cross-device state. Solo and higher tiers can push/pull state through the WebSocket-powered sync layer. Founder and Agency/Team tier state also controls execution scope, multi-repo tracking, and collaboration indicators.

Command approval state is transient runtime state. It should not be persisted beyond the active workflow except as terminal log history. The reviewed implementation stores the pending command, tool, and `commandId` in frontend/backend runtime state only.

Active command process references are also runtime-only. `WorkspaceSandbox` tracks child processes created by `runCommand`, removes them on `close` or `error`, and clears the set during abort handling.

Important workspace storage paths:

```text
.kryleos/traces/          — execution trace files per plan item
.kryleos/criteria/        — acceptance criteria per plan item (if stored separately)
.kryleos/reviews/         — Git-backed review state
.kryleos/reverted/        — untracked files moved here on safe revert
.kryleos/agents/          — custom agent definitions
.kryleos/skills/          — custom skills
```

Future production behavior should define:

- How long sync data is retained.
- Whether PLAN session history can be deleted/exported.
- Whether execution traces and criteria are included in exports.
- Whether users can clear provider credentials.
- Whether logs include sensitive file content.
- How billing tier changes are audited once mocked subscription behavior is replaced.

## 8. Migration Notes

The new standard project folder is `.kryleos`. Legacy `.matrix` folders should be treated as read-compatible migration paths. New generated files should prefer `.kryleos`.

Marketplace-style agents/skills currently rely on on-disk scanning and deletion routes. Documentation should mention both `.kryleos` and legacy `.matrix` only when describing compatibility or migration.

## 9. Latest Reviewed Patch Notes

- `.cursorrules` and `.cursor/rules` are documentation-relevant workspace instruction files.
- `commandPendingApproval` is not durable data; it exists only while the orchestrator waits for user approval.
- `commandId` is used to reject stale approvals in the WebSocket flow.
- Process tracking is not persisted and is only used to support graceful abort.
