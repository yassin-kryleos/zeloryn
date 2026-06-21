# Native Task Swarm and Suggest-Only Learning

## Purpose

This document adds two planned core capabilities to Kryleos Forge:

- Native task swarm orchestration, inspired by Ruflo-style multi-agent coordination but implemented as Forge-owned architecture.
- Suggest-only local self-learning, where Forge learns from traces and review evidence but never mutates behavior without user approval.

These features are planned product work, not simulator behavior. They must be implemented only after the Tool API Gateway, trace capture, drift evaluation, and command approval path are stable.

## Native Task Swarm

V1 swarm goal:

```text
FLOW task
  -> Run with Swarm
  -> coordinator plans specialist lanes
  -> workers execute through Tool API Gateway
  -> trace groups evidence by lane
  -> user reviews outcome
```

Rules:

- Topology is `hierarchical`.
- Default max concurrency is 3 active worker lanes.
- File writes, Git mutations, commands, network calls, and admin actions remain serialized through Tool API approval policies.
- No Ruflo hard dependency.
- No federation, public agent marketplace, or autonomous consensus in V1.
- Swarm execution remains subordinate to Flow tasks and acceptance criteria.

Default lanes:

- `coordinator`: decomposes the task and maintains sequencing.
- `builder`: implements changes.
- `reviewer`: inspects trace, diff, risk, and evidence.
- `tester`: added when criteria, package files, or task text imply tests.
- `security`: added for auth, secrets, permissions, sandbox, privacy, or token work.
- `docs`: added for documentation, changelog, guide, or copy work.
- `devops`: added for CI, deployment, Docker, package, build, or infrastructure work.

## Suggest-Only Learning

V1 learning goal:

```text
TRACE + VERIFY
  -> evidence-backed learning signals
  -> local recommendations
  -> user approve/reject/rollback
  -> approved hints inform future runs
```

Rules:

- Learning data is local-only under `.kryleos/learning`.
- Inputs are traces, criteria results, tool/command approval outcomes, drift results, review outcomes, and explicit user corrections.
- Outputs are recommendations with evidence references and confidence.
- Approved recommendations update only local approved patterns.
- Rejected recommendation signatures suppress repeated suggestions.
- Rollback disables an approved pattern and records the rollback.
- No cross-user learning.
- No model fine-tuning.
- No autonomous prompt, tool, policy, billing, credential, or MCP mutation.

Recommendation types:

- `agent_routing`
- `context_selection`
- `criteria_template`
- `test_command`
- `tool_sequence`
- `prompt_improvement`
- `failure_pattern`

## Contracts

```typescript
type SwarmRole =
  | 'coordinator'
  | 'builder'
  | 'tester'
  | 'reviewer'
  | 'security'
  | 'docs'
  | 'devops';

interface SwarmSession {
  id: string;
  taskId: string;
  planItemId?: string;
  topology: 'hierarchical';
  status: 'pending' | 'running' | 'paused' | 'succeeded' | 'failed' | 'aborted';
  maxConcurrency: number;
  agentRunIds: string[];
  traceId?: string;
  startedAt: string;
  completedAt?: string;
}

interface SwarmAgentRun {
  id: string;
  swarmSessionId: string;
  role: SwarmRole;
  status: 'pending' | 'running' | 'blocked' | 'succeeded' | 'failed' | 'aborted';
  assignedGoal: string;
  filesTouched: string[];
  commandIds: string[];
  summary?: string;
}

interface LearningSignal {
  id: string;
  projectId: string;
  source: 'trace' | 'criteria' | 'tool_invocation' | 'drift' | 'review' | 'user_feedback';
  taskId?: string;
  summary: string;
  evidenceRefs: string[];
  outcome: 'success' | 'failure' | 'rejected' | 'corrected' | 'unknown';
  createdAt: string;
}

interface LearningRecommendation {
  id: string;
  projectId: string;
  type:
    | 'agent_routing'
    | 'context_selection'
    | 'criteria_template'
    | 'test_command'
    | 'tool_sequence'
    | 'prompt_improvement'
    | 'failure_pattern';
  title: string;
  recommendation: string;
  confidence: number;
  evidenceRefs: string[];
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'rolled_back';
  createdAt: string;
  appliedAt?: string;
}
```

`ExecutionTrace` gains optional fields:

```typescript
interface ExecutionTrace {
  swarmSessionId?: string;
  agentRuns?: SwarmAgentRun[];
  learningSignalIds?: string[];
}
```

## Storage

```text
.kryleos/
  swarm/
    sessions.json
    agent-runs.json
  learning/
    signals.jsonl
    recommendations.jsonl
    approved-patterns.json
    rollback-log.jsonl
```

## API and Events

REST:

```text
GET  /api/swarm/sessions/:id
GET  /api/swarm/sessions/:id/trace
GET  /api/learning/signals
GET  /api/learning/recommendations
POST /api/learning/recommendations/generate
POST /api/learning/recommendations/:id/approve
POST /api/learning/recommendations/:id/reject
POST /api/learning/recommendations/:id/rollback
```

WebSocket:

```json
{ "type": "start_swarm_run", "taskId": "task_123" }
```

```json
{ "type": "stop_swarm_run", "swarmSessionId": "swarm_123" }
```

Backend events:

- `swarm_started`
- `swarm_agent_update`
- `swarm_tool_approval_required`
- `swarm_completed`
- `swarm_failed`
- `learning_recommendations_update`

## Acceptance Criteria

- Flow shows `Run with Swarm` beside normal execution.
- Swarm run creates a persisted `SwarmSession` and lane records.
- Swarm trace groups evidence by agent lane.
- Stop aborts active lane work and marks session aborted.
- All worker tools pass through the Tool API Gateway.
- Learning signals are created only from evidence-backed events.
- Recommendations remain pending until approved.
- Approved patterns can influence later prompts as concise local hints.
- Rejected recommendations do not apply or repeat by signature.
- Rollback disables approved patterns.
- Zero Egress blocks cloud or cross-user learning.
- Secret scanning blocks credentials from learning memory.
