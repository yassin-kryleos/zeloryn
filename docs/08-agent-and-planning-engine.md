# Agent and Planning Engine

## Purpose

The planning engine is the core differentiator of Kryleos Forge. It connects intent, work items, execution, evidence, and verification. The agent engine performs implementation only within that plan-aware context.

## Planning Lifecycle

```text
Scratchbook conversation
  -> structured Plan Workspace item
  -> CREW review
  -> FLOW task
  -> criteria generation/enrichment
  -> FORGE execution
  -> execution trace
  -> drift evaluation
  -> user-confirmed status update
```

## Plan Workspace Extraction

Extraction input:

- Scratchbook conversation.
- Project name.
- Project description.
- Existing Flow task titles.

Extraction output:

```json
{
  "items": [
    {
      "title": "Implement JWT Auth",
      "description": "Add password login and JWT middleware...",
      "category": "backend",
      "context": "Short excerpt or summary..."
    }
  ]
}
```

Rules:

- Nothing is saved without user confirmation.
- If no concrete task exists, return empty array.
- Category must be one of frontend, backend, testing, security, docs, infra, performance.

## Feasibility Check

Inputs:

- Project description.
- Proposed item title/description/category.
- Current FLOW board task titles/statuses.

Output:

```json
{
  "verdict": "feasible",
  "reason": "No obvious conflict with existing tasks."
}
```

Valid verdicts:

- `feasible`
- `needs_clarification`
- `potential_conflict`

Feasibility is advisory and never blocks item persistence.

## CREW Structured Output

CREW agents must produce parseable Markdown:

```markdown
### [ITEM] Authentication System
- Status: Revised
- Category: backend
- Changes: OAuth deferred to V2; email/password only for V1.
- Criteria hint: login endpoint exists and auth middleware protects private routes.
```

Push to Flow:

- Match by original item ID if present.
- Fallback to fuzzy title match.
- Offer unmatched items as new Flow tasks.
- Show before/after diff.
- Require confirmation.

## Acceptance Criteria Strategy

Criteria are the evaluation contract for both trace and drift.

### Phase 1: Abstract Criteria

Generated before exact files may exist.

Examples:

- `symbol_exists: authenticateUser`
- `test_passes: auth suite`
- `llm_check: Login flow rejects invalid credentials`

### Phase 2: Enriched Criteria

Generated after workspace scan or first run.

Examples:

- `file_exists: src/auth/session.ts`
- `git_grep: createSession`
- `test_passes: npm test -- auth`

Phase 2 must be shown as a diff for user review.

## Criteria Evaluation

Structural checks:

- `file_exists`: target path exists.
- `symbol_exists`: symbol is found in code, excluding comments/strings where possible.
- `git_grep`: raw grep-style evidence exists.
- `test_passes`: command or suite evidence passes.

LLM checks:

- Use only when structural evidence cannot decide.
- Ground the prompt in retrieved workspace evidence.
- Return `pass`, `fail`, or `unknown`.

## Drift Classification

Classification logic:

- Blocked: any `blockedBy` task is not done.
- Complete: all required criteria pass.
- In Progress: at least one criterion passes and at least one fails/unknown.
- Not Started: no criteria pass.
- Needs Review: low-confidence/unknown-heavy evidence.
- Diverged: targeted LLM says failing structural evidence conflicts with item intent.

Budget rules:

- Maximum 10 divergence LLM evaluations per drift run.
- Maximum 10 standalone `llm_check` evaluations per drift run.
- Defer remaining items with visible count.
- Cache by task ID, criteria signature, and workspace/Git hash.

## Execution Trace Extraction

After a FORGE run:

1. Collect logs.
2. Extract files changed.
3. Extract commands run.
4. Evaluate structural criteria.
5. Call LLM only for `llm_check` or summary extraction where needed.
6. Store trace locally.
7. Notify UI.

Trace extraction prompt must ask for strict JSON and tolerate fenced or tagged JSON.

## Agent Roles

Default orchestrator roles:

- Coordinator/Planner.
- Developer/Builder.
- Researcher/Analyst.
- Debugger/Reviewer.

CREW personas:

- Technical Reviewer.
- Scope Guard.
- Risk Identifier.

Starter agents:

- React Expert.
- Security Auditor.
- Test Writer.
- Documentation Writer.
- Performance Reviewer.
- Python Backend Specialist.
- DevOps Specialist.

## Tool Execution Model

Agents may request actions only through the Tool API Gateway.

Primary execution path:

```text
Agent chooses action
  -> provider-native tool/function call where supported
  -> Tool API Gateway validates schema, permission, tier, workspace, and Zero Egress
  -> approval if required
  -> built-in, custom skill, or MCP tool executes
  -> redacted audit log is written
  -> sanitized result returns to agent and UI
```

Compatibility path:

- Local or older models may emit strict text action blocks.
- Text action blocks must be parsed into a `ToolInvocation`.
- Parsed actions must validate against the same `ToolDefinition` schemas.
- Parsed actions must never bypass approval, workspace, tier, or Zero Egress checks.

Provider behavior:

- OpenAI tool-capable flows should use the Responses API.
- Anthropic should use native tool use and MCP connector where applicable.
- Gemini should use function calling.
- Ollama, OpenRouter, and DeepSeek should use native tool support where available, with strict text fallback otherwise.

## Built-In Tool Families

Required built-in families:

- File: read, write, apply patch, list, search, safe delete.
- Git: status, diff, stage, unstage, commit, push, pull, branch, safe restore.
- Command and verification: run command, detect tests, run tests, parse test output, run build, inspect packages, security audit.
- Code intelligence: symbol search, references, AST search, dependency graph, semantic index.
- Browser and preview: open local preview, screenshot, console logs, Playwright check.
- Network and data: approved HTTP request, read-only DB query, log parser.
- Planning and artifacts: criteria generation/evaluation, trace creation, drift, What's Left, artifact read/write.
- Security: secret scan, command classifier, diff risk scan, prompt-injection scan.

## Agent Routing

Routing order:

1. Exact match: task category equals agent primary category.
2. Capability overlap: category appears in agent capabilities.
3. General orchestrator fallback.

When fallback occurs, show:

```text
No [category] specialist - using general agent.
```

## Native Task Swarm Routing

Flow tasks may use `Run with Swarm` when the user wants multi-lane execution.

V1 swarm rules:

- Topology is hierarchical.
- Coordinator, Builder, and Reviewer lanes are always present.
- Tester is added for testing, QA, coverage, package-script, or verification work.
- Security is added for auth, secrets, permissions, sandbox, privacy, token, or RBAC work.
- Docs is added for documentation, changelog, guide, or copy work.
- DevOps is added for CI, deployment, Docker, package, build, release, or infrastructure work.
- Max active worker lanes is 3.
- Mutating tools remain serialized through Tool API approval.
- Swarm traces group evidence by lane but still evaluate the same acceptance criteria.

## Suggest-Only Learning Loop

After Trace and Verify:

1. Extract learning signals from evidence-backed traces, criteria results, drift results, tool approvals, review outcomes, and user feedback.
2. Store signals locally under `.kryleos/learning`.
3. Generate recommendations with evidence references and confidence.
4. Show recommendations in Learning Review.
5. Apply only user-approved recommendations as local hints in future prompts.

Learning may suggest:

- Agent routing.
- Context selection.
- Criteria templates.
- Test commands.
- Tool sequences.
- Prompt improvement drafts.
- Failure patterns.

Learning may not:

- Mutate prompts silently.
- Change tool permissions or command policy silently.
- Create permanent agents silently.
- Train model weights.
- Share learning across users.
- Bypass Zero Egress.

## Command Tool Safety

Agent can propose `command.run`, but the Tool API Gateway and orchestrator must:

- Generate invocation ID and command ID.
- Broadcast approval request.
- Pause execution.
- Resume only on matching approved invocation/command ID.
- Return rejection result if rejected.
- Kill active child processes on abort.

## Workspace Rule Loading

Instruction precedence:

1. User custom instructions.
2. `.cursorrules` and `.cursor/rules`.
3. `.kryleosrc.json`, `CLAUDE.md`, `.clauderc`, `INSTRUCTIONS.md`.
4. Built-in role prompts.

Rules must be scoped to the active workspace.

## Prompting Constraints

- Do not ask models to invent file paths.
- Do not ask models to call tools by free-form prose when a typed tool schema is available.
- Do not rely on raw plan prose for completion.
- Do not infer command success without real output.
- Do not auto-commit without user request/approval.
- In Zero Egress Mode, use only local models.
