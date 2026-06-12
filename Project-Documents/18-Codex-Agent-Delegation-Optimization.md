# Codex Agent Delegation and Optimization

## 1. Purpose

Use this guide when a Kryleos Forge implementation is large enough to benefit from explicit model selection, reasoning-level discipline, and subagent delegation.

The goals are:

- Preserve quota for work that genuinely needs deep reasoning.
- Keep the main implementation thread clean and decision-focused.
- Route repetitive scanning, fixture generation, log triage, and isolated test loops to worker agents.
- Prevent parallel writes from corrupting the same files.

## 2. Model Tier Selection

Match the task to the smallest model tier that can complete it reliably.

| Model tier | Quota footprint | Primary strength | Best deployment stage |
| --- | ---: | --- | --- |
| `gpt-5.5` / `gpt-5.4` | 100% | Deep structural reasoning, high-context ambiguity resolution, complex refactoring | System architecture, final reviews, cross-module integration gates |
| `gpt-5.4-mini` | About 30% | High-throughput execution, predictable implementation, read-heavy scans | Isolated implementation, parallel test generation, log analysis |

## 3. Reasoning Intensity

### Medium Reasoning

Use medium reasoning as the default for:

- Localized file modifications.
- Single-component additions.
- Standard data parsing logic.
- Focused unit tests.
- Small bug fixes with clear reproduction steps.

Medium reasoning should be enough when the implementation path is already known and the risk is mostly correctness within a narrow surface area.

### High Reasoning

Use high reasoning for:

- Complex state management.
- Concurrency or asynchronous execution behavior.
- Multi-file integration work.
- Shared interface changes that must flow through networking, persistence, UI state, and tests.
- Security-sensitive or release-blocking changes.

High reasoning is appropriate when preserving semantic equivalence across several modules matters more than raw speed.

### Avoid XHigh By Default

Do not use `xhigh` for standard engineering workflows. It should be reserved for unusually ambiguous architecture decisions or final integration reviews where a wrong assumption would be expensive.

## 4. Subagent Delegation Matrix

### Phase A: Read-Heavy Discovery

Delegate to a worker agent when the task is mostly exploration and summarization:

- Trace where a type, route, command, or state field is used across the workspace.
- Reduce long build, CI, container, or stack-trace logs to the failing call path.
- Scan third-party API documentation and return the small actionable subset needed by the main thread.

Expected output: a compact brief with file paths, relevant symbols, and concrete next actions.

### Phase B: Isolated Scaffolding

Delegate predictable file generation when write targets are isolated:

- Database schemas.
- Standard controllers or CRUD handlers.
- Mock data and fixtures.
- Type translations from legacy payloads into TypeScript namespaces, structs, or schema definitions.
- Boilerplate UI views that follow an existing local pattern.

Expected output: a verified patch or generated files scoped to the assigned directory.

### Phase C: Testing and Debugging

Delegate test loops when the worker can stay inside a narrow boundary:

- Add unit tests for pure functions or independent utilities.
- Build fixtures for integration tests.
- Run a test, inspect failure output, patch the assigned file, and repeat until green.

Expected output: final diff plus the exact test command and result.

### Phase D: Guardrails and Housekeeping

Delegate cleanup and verification sweeps after core implementation is stable:

- Static security scans for hardcoded secrets, unsafe exception handling, or risky database calls.
- Lint and formatting alignment.
- Import ordering.
- README or internal documentation updates tied to changed behavior.

Expected output: findings first, then any patch if the task authorized edits.

## 5. Delegation Guardrails

Never allow multiple subagents to write the same file at the same time.

Use these boundaries:

- Assign each worker an explicit directory or file list.
- Keep final merge decisions in the primary thread.
- Ask workers to return patches or findings rather than broad rewrites.
- Have the primary thread perform integration edits that cross ownership boundaries.
- For release-facing changes, run final tests from the primary thread after merging worker output.

## 6. Prompt Patterns

### Multi-Agent Branch Review

```text
Spawn three parallel gpt-5.4-mini subagents to review this implementation branch:

1. explorer: analyze the diff for unhandled error paths.
2. worker: identify missing unit test coverage.
3. reviewer: cross-check parameter and type alignment.

Return one consolidated engineering brief with findings ordered by severity.
```

### Isolated Test-Execute-Tweak Loop

```text
Initialize an isolated gpt-5.4-mini worker. Point it at tests/auth_service_test.go.

Scope:
- Run the targeted test suite.
- Analyze failures.
- Apply targeted patches only to services/auth.go.
- Repeat until the suite passes.

Return only the verified patch, the final command, and the final test result.
```

## 7. Kryleos Forge Application Notes

In Kryleos Forge, these patterns should map to product behavior as follows:

- The primary FORGE session remains the integration owner.
- CREW personas may propose delegation, but write scopes must be explicit before execution.
- FLOW tasks should record delegated work as separate execution traces.
- Review tabs should display worker patches independently before merge.
- Agent logs should label the model tier, reasoning level, command scope, and files modified by each worker.

## 8. Verification Checklist

Before considering a delegated implementation complete:

1. Confirm every worker stayed inside its assigned file or directory scope.
2. Inspect the final consolidated diff in the primary thread.
3. Run the narrow tests used by workers.
4. Run the broader integration, lint, and build checks required by the touched app.
5. Update documentation when workflows, APIs, storage, security assumptions, or release behavior changed.
