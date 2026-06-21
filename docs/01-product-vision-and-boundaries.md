# Product Vision and Boundaries

## Product Thesis

Kryleos Forge is an AI project execution workspace for builders who need more than file-level code assistance. Its core promise is that a user can define what they are building, refine it, operationalize it, execute it with AI agents, and verify that the code matches the plan.

Most AI coding tools begin at a prompt box. Forge begins at the project.

## Core Product Idea

The product owns the Build Loop:

```text
PLAN -> CREW -> FLOW -> FORGE -> TRACE -> VERIFY
```

- PLAN captures and structures intent.
- CREW reviews intent with specialist perspectives.
- FLOW turns reviewed intent into executable project work.
- FORGE runs agent-assisted implementation.
- TRACE links execution evidence back to the originating plan item.
- VERIFY checks current code against the plan through criteria and drift detection.

## Value Proposition

Forge operates at the project level, not just the file level.

It helps users answer:

- What am I building?
- What is ready to implement?
- What should I work on today?
- Which agent should execute this?
- What changed in the code?
- Which acceptance criteria passed?
- What is still missing?
- Has the code drifted from the plan?

## Target Users

### Solo Developer

Needs a local-first coding workspace that can plan, execute, review, and verify project work without requiring a cloud IDE.

### Technical Founder

Needs to move from product idea to working software with visible progress, traceable execution, and "what is left" summaries.

### Multi-Repo Builder

Needs one plan that spans frontend, backend, mobile, infra, and docs repositories, with task-level workspace routing.

### AI Power User

Needs provider choice, BYOK, Ollama, custom agents, custom skills, external tools, MCP servers, and workflow control.

### Early Small Team or Agency

Needs handoff docs, shared visibility, client-ready exports, and future collaboration/RBAC paths, while current beta labels simulated or preview features honestly.

## Product Pillars

1. Project-first, not chat-first.
2. Local-first by default.
3. BYOK and local model friendly.
4. Explicit safety gates for commands and file operations.
5. Plan-driven execution with traceable evidence.
6. Honest feature status labeling: production, preview, simulator, mock, planned.
7. Strong user control: no silent plan changes, no silent auto-completion, no silent command execution.
8. Tool-native execution: Forge exposes its local abilities through a typed Tool API and uses native provider tool/function calling when available.
9. Native task swarm execution: complex Flow tasks can run through a Forge-owned specialist swarm without depending on an external orchestration framework.
10. Suggest-only self-learning: Forge learns local patterns from traces and review evidence, but user approval is required before learned patterns affect future behavior.

## Hard Boundaries

The rebuild must preserve these boundaries:

- Chat must not silently mutate the plan.
- PLAN Scratchbook is for ideation; Plan Workspace is structured and user-confirmed.
- Code execution happens in FORGE, not inside planning chat.
- FLOW prepares and prioritizes work; it does not write code directly.
- CREW produces a structured review artifact, not only loose chat messages.
- Agent shell commands require explicit approval.
- File operations must stay inside the active workspace or explicitly whitelisted multi-repo paths.
- Zero Egress Mode must be enforced in backend model routing.
- Hosted model requests must disclose that prompt/context leaves the machine.
- External tools and MCP servers must use explicit allowlists, scoped credentials, and audit logs.
- Native provider tool calls are preferred over text-parsed action blocks; text parsing is fallback only.
- Swarm orchestration must remain subordinate to Flow tasks, acceptance criteria, Tool API permissions, and user approval.
- Self-learning must be local-only and suggest-only in V1; no cross-user learning, model fine-tuning, or silent prompt/tool/policy mutation.
- Simulated features must be visibly labeled as simulator/mock/preview.
- Plan item completion from traces must require user confirmation.

## App Surfaces

### Desktop App

Primary product. Electron shell with React renderer, local backend, local file/Git tools, provider configuration, planning layer, agent orchestration, companion pairing, and packaging.

### Web Companion

Product surface for marketing, pricing, remote PLAN ideation, lightweight demos, account/billing preview, and desktop pairing where supported. It must not replace the desktop local workspace.

### Mobile Companion

Mobile planning, monitoring, approvals, offline notes, Today view, and signed remote actions against a paired desktop session. Mobile coding execution itself is out of scope.

### VS Code Extension

Deferred companion surface. It should connect to the running desktop backend through a least-privilege credential handoff. It is not a standalone coding assistant.

## Success Criteria

A beta user should be able to:

- Create or connect a project in under 60 seconds.
- Generate or import a plan.
- Push plan items through CREW into FLOW.
- See a Today list of 3-5 unblocked tasks.
- Execute a task in FORGE with command approval.
- Review changed files, commands, and evidence.
- See execution traces tied to plan items.
- Run a drift check and understand what is complete, incomplete, blocked, or diverged.
- Use Ollama/local models when no data should leave the machine.
- Pair a mobile device for monitoring and approvals.
