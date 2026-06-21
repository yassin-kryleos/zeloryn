# Data Model and Storage

## Storage Principles

- User workspace data stays local unless explicitly synced/exported.
- `.kryleos` is the canonical workspace metadata folder.
- Legacy `.matrix` folders are read-only migration fallbacks.
- Provider keys must use OS secure storage or encrypted backend storage.
- Plan, trace, review, and criteria data must be portable and inspectable.

## Core Entities

### Project

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  workspaceFolder: string;
  workspacePaths: string[];
  gitUrl?: string;
  createdAt: string;
  updatedAt: string;
}
```

### PlanWorkspaceItem

```typescript
interface PlanWorkspaceItem {
  id: string;
  title: string;
  description: string;
  category: 'frontend' | 'backend' | 'testing' | 'security' | 'docs' | 'infra' | 'performance';
  status: 'draft' | 'ready_for_crew';
  context?: string;
  feasibility?: {
    verdict: 'feasible' | 'needs_clarification' | 'potential_conflict';
    reason: string;
  };
  githubIssueNumber?: number;
  githubRepo?: string;
  htmlUrl?: string;
  acceptanceCriteria?: AcceptanceCriterion[];
}
```

### ProjectTask

```typescript
interface ProjectTask {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  assignee?: string;
  category?: string;
  source?: 'plan' | 'crew' | 'manual' | 'github';
  workspace?: string;
  blockedBy?: string[];
  acceptanceCriteria?: AcceptanceCriterion[];
  driftStatus?: DriftClassification;
  latestTraceId?: string;
  bootstrapLikelyComplete?: boolean;
  lastModified?: string;
  githubIssueNumber?: number;
  githubRepo?: string;
  htmlUrl?: string;
}
```

### AcceptanceCriterion

```typescript
type AcceptanceCriterionType =
  | 'file_exists'
  | 'symbol_exists'
  | 'git_grep'
  | 'test_passes'
  | 'llm_check';

type CriterionPhase = 'phase1' | 'phase2';
type CriterionResultStatus = 'pass' | 'fail' | 'unknown';

interface AcceptanceCriterion {
  id: string;
  type: AcceptanceCriterionType;
  description: string;
  target: string;
  phase: CriterionPhase;
  status?: CriterionResultStatus;
  evidence?: string;
}
```

### ExecutionTrace

```typescript
interface ExecutionTrace {
  id: string;
  planItemId: string;
  timestamp: string;
  filesChanged: string[];
  commandsRun: string[];
  outcomes: string[];
  criteriaResults: CriterionResult[];
  suggestedStatus: 'todo' | 'in_progress' | 'done';
  summary: string;
  mode?: 'live' | 'demo';
  incompleteReason?: string;
  swarmSessionId?: string;
  agentRuns?: SwarmAgentRun[];
  learningSignalIds?: string[];
}
```

### SwarmSession

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
```

### SwarmAgentRun

```typescript
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
```

### LearningSignal

```typescript
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
```

### LearningRecommendation

```typescript
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

### DriftClassification

```typescript
type DriftClassification =
  | 'complete'
  | 'in_progress'
  | 'not_started'
  | 'diverged'
  | 'needs_review'
  | 'blocked';
```

### AgentDefinition

```typescript
interface AgentDefinition {
  name: string;
  role: string;
  prompt: string;
  primaryCategory?: string;
  capabilities?: string[];
}
```

### SkillDefinition

```typescript
interface SkillDefinition {
  name: string;
  type: 'script' | 'markdown';
  content: string;
}
```

### ToolDefinition

```typescript
interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  source: 'built_in' | 'custom_skill' | 'mcp';
  featureStatus: 'production' | 'preview' | 'simulator' | 'mock' | 'planned';
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  permission: 'read' | 'write' | 'execute' | 'network' | 'admin';
  approvalPolicy: 'never' | 'on_write' | 'on_execute' | 'always';
  remoteApprovalAllowed: boolean;
  tierGate?: 'free' | 'solo' | 'solo_plus' | 'founder' | 'agency';
  workspaceScoped: boolean;
  zeroEgressAllowed: boolean;
}
```

### ToolInvocation

```typescript
interface ToolInvocation {
  id: string;
  toolId: string;
  sessionId: string;
  planItemId?: string;
  requestedBy: 'model' | 'user' | 'system' | 'companion';
  provider?: string;
  argumentsRedacted: Record<string, unknown>;
  approval?: {
    required: boolean;
    decision?: 'approved' | 'rejected' | 'aborted' | 'stale';
    source?: 'local' | 'remote';
    deviceId?: string;
    commandId?: string;
  };
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked';
  startedAt: string;
  completedAt?: string;
  resultSummary?: string;
}
```

### MCPServerConfig

```typescript
interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'streamable_http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  authTokenRef?: string;
  enabled: boolean;
  allowedTools?: string[];
  deniedTools?: string[];
  workspaceTrust: 'trusted' | 'untrusted';
  featureStatus: 'preview' | 'production';
  createdAt: string;
  updatedAt: string;
}
```

### ProviderToolCapability

```typescript
interface ProviderToolCapability {
  provider: 'ollama' | 'deepseek' | 'gemini' | 'openai' | 'anthropic' | 'openrouter';
  model?: string;
  supportsStreaming: boolean;
  supportsStructuredOutput: boolean;
  supportsNativeToolCalls: boolean;
  supportsBuiltInTools: boolean;
  supportsToolSearch: boolean;
  compatibilityFallback: 'none' | 'text_action_blocks';
  checkedAt: string;
}
```

### PairedDevice

```typescript
interface PairedDevice {
  deviceId: string;
  publicKey: string;
  tokenHash: string;
  label: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}
```

### CostRecord

```typescript
interface CostRecord {
  id: string;
  sessionId?: string;
  timestamp: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  tokenSavings: number;
}
```

## Workspace Paths

Canonical workspace metadata:

```text
.kryleos/
  agents/
  skills/
  traces/
  swarm/
  learning/
  criteria/
  reviews/
  reverted/
  tools/
  founder/
  agency/
  docs/
  plan-workspace.json
  mcp-servers.json
  provider-capabilities.json
  tool-invocations.jsonl
  cost_history.json
  scratchbook.txt
```

Swarm storage:

```text
.kryleos/swarm/
  sessions.json
  agent-runs.json
```

Learning storage:

```text
.kryleos/learning/
  signals.jsonl
  recommendations.jsonl
  approved-patterns.json
  rollback-log.jsonl
```

Legacy migration reads:

```text
.matrix/agents/
.matrix/skills/
```

Workspace rules:

```text
.cursorrules
.cursor/rules/
CLAUDE.md
INSTRUCTIONS.md
.kryleosrc.json
```

## Local App Data

Backend app data should live under configured data directory where possible:

```text
KRYLEOS_DATA_DIR/
  chat_history.json
  .kryleos_db.key
  sync users/state
  paired devices
  credentials
  cached tool registry metadata
  MCP token references
```

`chat_history.json` must be encrypted at rest with a per-install key.

## Browser/Renderer State

Allowed in localStorage:

- Theme.
- Last active project ID.
- Non-secret UI preferences.
- Tutorial completion.
- Response mode.
- Zero Egress preference.
- Provider disclosure acknowledgements.

Not allowed in localStorage:

- Provider API keys.
- GitHub tokens.
- Sync tokens.
- Pairing secrets.
- Device private keys.

## Mobile Secure Storage

Mobile should store:

- Device ID.
- Device keypair.
- Device token.
- Desktop public key.

Use platform secure storage where available.

## Review State

Review state persists under:

```text
.kryleos/reviews/review-state.json
```

Untracked safe-revert files are moved to:

```text
.kryleos/reverted/
```

## Data Retention

Beta defaults:

- Local sessions retained until user deletes them.
- Traces retained until user deletes project metadata.
- Review state retained per workspace.
- Cost history retained per workspace.
- Tool invocation audit retained per workspace until user clears project metadata.
- MCP server configs retained until disabled or deleted by the user.
- Swarm sessions retained with traces until user clears project metadata.
- Learning signals and recommendations retained locally until user clears learning memory or project metadata.
- Offline mobile notes are removed from queue after successful signed sync.

Future settings should add:

- Clear session history.
- Clear traces.
- Clear swarm sessions.
- Clear learning memory.
- Export plan and traces.
- Delete paired devices.
- Delete credentials.
- Reset project metadata.
