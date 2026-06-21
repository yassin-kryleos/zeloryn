# Antigravity 2.0 Build Brief

## Role

You are implementing Kryleos Forge from a clean architecture baseline. Treat the current project as reference only. The source of truth is the Markdown documentation in `docs/`.

## Product Objective

Build a local-first AI project execution workspace organized around:

```text
PLAN -> CREW -> FLOW -> FORGE -> TRACE -> VERIFY
```

The app must preserve all product concepts and feature requirements documented in:

- `01-product-vision-and-boundaries.md`
- `02-product-requirements.md`
- `15-feature-inventory-and-preservation-checklist.md`

## Implementation Priorities

Build in this order:

1. Hardened app shell, backend supervisor, local auth, storage, logging, and workspace sandbox.
2. Project setup and existing-project bootstrap.
3. PLAN Scratchbook and Plan Workspace.
4. CREW structured review and starter personas.
5. FLOW Today/Kanban/task detail.
6. Tool API Gateway and minimal FORGE execution.
7. Provider adapters and native tool calling.
8. MCP/custom skill governance.
9. Code intelligence and developer tool depth.
10. Criteria, traces, drift, What's Left.
11. Native task swarm and suggest-only learning.
12. Git review and Preview Deck.
13. Companion pairing/mobile approvals.
14. Billing/tier gates/sync.
15. Founder/Agency workflows.
16. Packaging and beta QA.

Use `11-implementation-roadmap.md` for phase gates.

## Non-Negotiable Guardrails

- Do not start from a generic chat app.
- Do not let chat silently mutate the plan.
- Do not execute shell commands without approval.
- Do not let any model, MCP server, or custom skill bypass the Tool API Gateway.
- Do not rely on text-parsed action blocks as the primary tool path when provider-native tools are available.
- Do not make Ruflo or another external swarm framework a hard dependency.
- Do not let swarm workers bypass Tool API permissions, command approval, workspace containment, or Zero Egress.
- Do not let learning mutate prompts, tools, policies, agents, credentials, or billing without explicit user approval.
- Do not store API keys in localStorage.
- Do not allow file access outside allowed workspace roots.
- Do not claim simulator/mock/preview features are production.
- Do not implement Drift from raw plan text; use criteria.
- Do not auto-complete tasks silently.
- Do not let companion clients access admin local REST credentials.
- Do not bypass Zero Egress server-side.
- Do not launch local stdio MCP servers for discovery without explicit user trust/approval.
- Do not write `.kryleos` metadata through direct in-place overwrite.
- Do not expose local session data through health, logs, renderer responses, or companion routes.
- Do not treat custom script skills as passive content.

## Required Architecture

Use these layers:

- Desktop renderer.
- Electron main/preload.
- Authenticated local backend.
- Backend supervisor and port broker.
- Storage service.
- Planning service.
- Agent orchestration service.
- Swarm orchestration service.
- Learning engine.
- Tool API Gateway.
- Workspace sandbox.
- Provider clients.
- MCP client manager.
- Companion hub.
- Shared types.

See:

- `05-system-architecture.md`
- `06-data-model-and-storage.md`
- `07-api-and-event-contracts.md`
- `08-agent-and-planning-engine.md`
- `17-tool-api-mcp-provider-integration.md`
- `18-native-task-swarm-and-suggest-only-learning.md`

## Required UX

Top-level app spaces:

- Plan.
- Crew.
- Flow.
- Forge.

Default flows:

- First-time users see Project Setup.
- Returning users land on Flow Today.
- Existing codebases get bootstrap scan.

See:

- `03-user-experience-and-flows.md`
- `04-information-architecture.md`

## Required Security

Implement and test:

- Local session secret.
- Per-session capability token delivered only through typed preload APIs.
- Origin restrictions.
- Electron hardening: `contextIsolation`, `nodeIntegration:false`, restrictive production CSP, IPC validation, blocked untrusted navigation, gated external URL opening.
- Backend readiness checks, bounded restart behavior, and crash diagnostics.
- Minimal `/health` output with no session details.
- `.kryleos` schema version, atomic writes, fsync where supported, and PID/hostname/start-token lock files.
- Workspace containment.
- Command approval with command IDs.
- Tool approval with invocation IDs.
- Tool schema validation, output sanitization, and redacted audit logs.
- MCP allowlists/denylists, token references, and disabled-server enforcement.
- Explicit local stdio MCP trust/approval before process launch.
- Custom script skill permissions and sandbox policy.
- Swarm lane execution through Tool API Gateway.
- Local-only learning memory with approval, rejection, and rollback.
- Abort process tracking.
- Zero Egress routing.
- Hosted provider disclosure.
- Companion signed messages.
- Webhook verification.
- Secret scanning for generated docs/exports.
- Prompt-injection handling for external/MCP tool output.
- Structured log redaction, rotation, and export sanitization.

See:

- `09-security-privacy-threat-model.md`
- `12-quality-test-and-acceptance-plan.md`

## Feature Preservation Checklist

Before removing, renaming, or redesigning a feature, check:

- `15-feature-inventory-and-preservation-checklist.md`

If a feature is not production-ready, keep it but label it:

- Preview.
- Simulator.
- Mock.
- Planned.

## Testing Expectation

Every phase must include:

- Unit tests for domain logic.
- Integration tests for backend contracts.
- E2E smoke for critical UI flows.
- Security regression tests for dangerous boundaries.

Do not mark a phase complete because UI renders. Mark it complete only when acceptance criteria in `12-quality-test-and-acceptance-plan.md` pass.

Phase 0 must pass before product surfaces expand:

- Electron boot and preload smoke test.
- Authenticated health call through preload.
- Local API rejects missing/invalid session token.
- Backend supervisor restart and port broker test.
- Atomic storage write and lock validation tests.
- Redacted structured log test.
- Diagnostic screen for preload/backend crash.

## Output Discipline

When implementing:

- Keep modules small.
- Keep domain logic outside React components.
- Prefer shared typed contracts.
- Add migrations rather than destructive state resets.
- Preserve local-first behavior.
- Keep Web/Mobile companions subordinate to Desktop.
- Use provider-native tool/function calling for tool-capable providers.
- Keep fallback text actions behind the same schema, approval, and audit path.

## First Task Recommendation

Start by creating the clean shared domain contracts for:

- Project.
- PlanWorkspaceItem.
- ProjectTask.
- AcceptanceCriterion.
- ExecutionTrace.
- DriftReport.
- AgentDefinition.
- ToolDefinition.
- ToolInvocation.
- MCPServerConfig.
- ProviderToolCapability.
- SwarmSession.
- SwarmAgentRun.
- LearningSignal.
- LearningRecommendation.
- PairedDevice.
- Entitlement.

Then build the Phase 0 foundation in this order:

1. Repository skeleton, locked Node/package-manager version, and shared TypeScript config.
2. Shared types for project, criteria, trace, tool, provider, swarm, learning, pairing, and entitlement.
3. `.kryleos` storage service with atomic writes, schema version, and lock validation.
4. Local backend with minimal health, session-token auth, and loopback binding.
5. Electron shell with secure preload, IPC validation, backend supervisor, and port broker.
6. CI with install, typecheck, lint, unit tests, and Electron smoke test.

Only after Phase 0 acceptance passes should Project Setup and UI workflow implementation begin.
