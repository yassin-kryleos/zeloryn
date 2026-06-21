# Product Requirements

## 1. Product Overview

Kryleos Forge is a local-first AI project execution workspace. It helps users move from product intent to executable work, execute with agents, and verify implementation against the plan.

The app is organized into four main spaces:

- Plan
- Crew
- Flow
- Forge

## 2. Core Functional Requirements

### Project Setup

- The first launch must open with project setup, not a generic chat box.
- Setup collects exactly:
  - Project name.
  - Workspace folder.
  - "What are you building?" description.
  - Model provider setup prompt or skip option.
- If workspace folder is skipped, default to a safe user folder and show a "file tools limited" banner.
- Returning users land in Flow Today view.
- Existing codebases trigger bootstrap flow.

### Existing Project Bootstrap

- Scan README, package manifests, Git state, test folders, and docs.
- Show a fingerprint such as framework, language, package manager, repo/test/docs presence.
- Run a guided Plan Scratchbook session.
- Generate initial plan items and abstract acceptance criteria.
- Evaluate structural evidence where possible.
- Mark likely-complete items only after user review.
- Run the first "What's Left" report free regardless of tier.

### PLAN

- PLAN contains Scratchbook and Plan Workspace.
- Scratchbook is persistent ideation chat.
- Scratchbook does not auto-update Plan Workspace.
- "Summarize and Push" extracts structured items for user review.
- Plan Workspace items include:
  - ID.
  - Title.
  - Description.
  - Category.
  - Status.
  - Source context.
  - Feasibility result.
  - Acceptance criteria.
  - Optional GitHub issue metadata.
- Feasibility check returns:
  - Feasible.
  - Needs clarification.
  - Potential conflict.
- PLAN exports structured Markdown for Free users.
- PLAN syncs directly to CREW for Solo and above.

### CREW

- CREW reviews plan items using bundled specialist personas:
  - Technical Reviewer.
  - Scope Guard.
  - Risk Identifier.
- CREW output is structured Markdown using `### [ITEM] <title>` anchors.
- Each item block includes:
  - Status.
  - Category.
  - Changes.
  - Criteria hint.
- "Push to FLOW" shows a diff before mutating Flow tasks.
- CREW supports custom agents and starter packs.

### FLOW

- FLOW is project management and execution prep.
- Returning users land on Today view.
- Today view shows 3-5 unblocked prioritized tasks.
- Priority score:
  - +10 if in progress with active trace.
  - +5 if recently unblocked.
  - +3 per dependent item.
  - +1 per day old, capped at 7.
- FLOW supports full Kanban view.
- FLOW item actions:
  - Break down.
  - Estimate.
  - Execute.
  - Edit criteria.
  - Add/remove blockers.
  - Assign workspace/repo.
  - Override category.
- Blocked items are visually disabled and server-blocked from execution.

### FORGE

- FORGE executes plan items through agent orchestration.
- FORGE supports file explorer, code graph, Git review, Preview Deck, terminal evidence, artifacts, and side chat.
- Agents must receive:
  - Plan item.
  - Criteria.
  - Workspace assignment.
  - Category.
  - Relevant files/context.
  - User custom instructions and workspace rules.
- FORGE command execution requires approval.
- User can stop active workflow.
- FORGE emits execution traces.

### Native Task Swarm

- FLOW must support `Run with Swarm` beside normal single-run execution.
- Swarm orchestration is Forge-native and must not require Ruflo or any external orchestration framework.
- V1 topology is hierarchical with one coordinator and specialist worker lanes.
- Default max active worker lanes is 3.
- Required default lanes:
  - Coordinator.
  - Builder.
  - Reviewer.
- Conditional lanes:
  - Tester for test, QA, coverage, package-script, or verification work.
  - Security for auth, secrets, permissions, sandbox, privacy, token, or RBAC work.
  - Docs for documentation, changelog, guide, or copy work.
  - DevOps for CI, deploy, Docker, package, build, release, or infrastructure work.
- Worker lanes must execute all actions through the Tool API Gateway.
- File writes, Git mutations, shell commands, network calls, and admin changes remain approval-gated and serialized through tool policy.
- Swarm traces must group evidence by agent lane while preserving normal trace fields.
- Stop workflow must abort active swarm work and mark the swarm session aborted.
- V1 excludes federation, autonomous consensus, public agent marketplace, and cross-machine swarms.

### Suggest-Only Self-Learning

- Forge must extract local learning signals from traces, criteria results, tool/command approvals, drift results, review outcomes, and explicit user corrections.
- Learning data must stay local under `.kryleos/learning`.
- Learning outputs are recommendations, not automatic behavior changes.
- Recommendation types:
  - Agent routing.
  - Context selection.
  - Criteria template.
  - Test command.
  - Tool sequence.
  - Prompt improvement.
  - Failure pattern.
- Each recommendation must include evidence references, confidence, and status.
- Users can approve, reject, or rollback recommendations.
- Approved recommendations may inform future prompts only as concise local learning hints.
- Rejected recommendation signatures suppress repeated suggestions.
- Rollback disables an approved pattern and records the rollback.
- V1 excludes cross-user learning, cloud learning, model fine-tuning, and autonomous prompt/tool/policy mutation.

### Unified Tool API and MCP

- Forge must expose all agent-callable capabilities through a typed Tool API registry.
- The registry is the source of truth for tool name, description, JSON schema, permission level, workspace scope, approval policy, tier gate, feature status, and audit logging.
- Built-in tools must include:
  - File read/write/patch/list/search.
  - Git status/diff/stage/unstage/commit/push/pull.
  - Command execution through approval-gated sandbox.
  - Test runner and build runner.
  - Package manager inspector.
  - HTTP/API request tool.
  - Browser/Playwright preview tool.
  - Log parser.
  - Secret scan.
  - AST/LSP/symbol search.
  - Database query tool for local project databases, read-only by default.
  - Artifact read/write/publish.
- Tool calls must be provider-neutral at the Forge domain layer.
- Provider adapters must map Tool API definitions into:
  - OpenAI native Responses API tools/function calling.
  - Anthropic tool use and MCP connector where available.
  - Gemini function calling and supported built-in tool combinations.
  - Ollama/OpenRouter/DeepSeek text-tool fallback when native tool calling is unavailable or unreliable.
- Forge must support local and remote MCP servers.
- MCP server configuration must include name, transport, URL or command, allowed tools, denied tools, auth token reference, feature status, and workspace trust level.
- MCP tools must never bypass Forge permissions, command approvals, Zero Egress, or audit logging.
- Tool search/deferred tool loading should be supported for providers that can use it.
- Tool results from external services must be treated as untrusted input and must be filtered for prompt injection and secrets before being fed back to models.

### Execution Tracing

- Every FORGE run from a plan item creates or attempts to create an execution trace.
- Trace includes:
  - Trace ID.
  - Plan item ID.
  - Timestamp.
  - Files changed.
  - Commands run.
  - Outcomes.
  - Criteria results.
  - Suggested status.
  - Summary.
- Trace storage is local under `.kryleos/traces`.
- Auto-complete suggestions require user confirmation.

### Acceptance Criteria

- Criteria types:
  - `file_exists`
  - `symbol_exists`
  - `git_grep`
  - `test_passes`
  - `llm_check`
- Phase 1 criteria are abstract and do not depend on exact file paths.
- Phase 2 criteria enrich with real workspace paths after scans/runs.
- Users review and confirm criteria changes.
- Drift and trace classification evaluate criteria, not raw plan prose.

### Plan Drift Detection

- Drift evaluates criteria against workspace evidence.
- Classifications:
  - Complete.
  - In Progress.
  - Not Started.
  - Diverged.
  - Needs Review.
  - Blocked.
- Structural checks run before LLM checks.
- Divergence LLM calls are targeted and budgeted.
- Cache drift decisions by item, criteria signature, and workspace/Git state.
- Run drift after FORGE completion and on demand.

### Multi-Repo Scope

- A project can include multiple workspace paths.
- Plan items can specify a target workspace.
- FORGE activates the target workspace for execution.
- FLOW labels/group tasks by workspace.
- File access must remain inside the root or approved workspace paths.

### Agents and Skills

- Bundle starter agents:
  - React Expert.
  - Security Auditor.
  - Test Writer.
  - Documentation Writer.
  - Performance Reviewer.
  - Python Backend Specialist.
  - DevOps Specialist.
- Store user assets in `.kryleos/agents` and `.kryleos/skills`.
- Read legacy `.matrix` folders only for migration compatibility.
- Agent specialization follows category/capability matching.

### File, Git, Review

- File browser supports list, read, create, edit, save, delete, and CSV preview.
- Git tools support status, stage, unstage, commit, push, pull, and remote config where safe.
- File edits made by agents should prefer structured patch/application tools over brittle string replacement when possible.
- Code intelligence should use AST/LSP/tree-sitter style symbol extraction where available, with regex search as fallback.
- Git-backed review shows working and staged diffs.
- Review state persists under `.kryleos/reviews`.
- Safe revert of untracked files moves them to `.kryleos/reverted`.
- Risk notes flag sensitive/config/dependency/security-adjacent files.

### Preview Deck

- Fixed right-side deck for beta, not drag-and-drop panes.
- Tabs:
  - Files.
  - Live Preview.
  - Terminal evidence.
  - Side Chat.
  - Artifacts.
  - Review.
- Starting/stopping servers must reuse command approval.
- Previewed pages are untrusted.

### Model Providers

- Support:
  - Ollama.
  - DeepSeek.
  - Gemini.
  - OpenAI.
  - Anthropic.
  - OpenRouter.
- BYOK is available on all tiers.
- Provider health checks are available.
- Hosted provider disclosure appears once per provider.
- Zero Egress Mode blocks non-Ollama calls server-side.
- OpenAI integration should use Responses API for new tool-capable workflows.
- Existing Chat Completions style integrations may remain as compatibility fallback.
- Provider contract tests must verify streaming, tool call parsing, structured output, error handling, and Zero Egress behavior.

### Companion Apps

- Mobile companion supports pairing, Today view, live session feed, remote approvals, remote stop, signed FORGE run start, and offline planning notes.
- Web companion supports marketing, pricing, planning draft, desktop sync where allowed, demos, account/auth preview, and pairing.
- Companion command approvals must include command ID and cryptographic signing for mobile state-changing actions.
- Companion devices may approve Forge tool calls only when the tool policy allows remote approval. High-risk tools require local desktop confirmation.

### Billing and Tiers

- Tiers:
  - Free.
  - Solo.
  - Solo Plus.
  - Founder.
  - Agency/Team.
  - Early Lifetime.
- Billing providers:
  - Stripe for most regions.
  - Razorpay for India locale.
  - License key fallback for early launch.
- Mock/simulated billing states must be labeled until production billing is complete.

## 3. Non-Functional Requirements

- Local-first desktop operation.
- Responsive UI during streaming.
- Strong workspace boundary enforcement.
- Encrypted local session database.
- OS secure storage for secrets where available.
- Graceful handling of offline Ollama usage.
- No silent destructive operations.
- No hidden remote execution.
- Clear feature status labels.
- Accessibility checks for all primary surfaces.
- Cross-platform desktop packaging path for Windows first, then macOS/Linux as available.

## 4. Release Success Metrics

- New project setup succeeds in under 60 seconds.
- Plan import creates FLOW tasks in under 60 seconds.
- A plan item can be executed and traced end-to-end.
- A plan item can be run through native task swarm and traced with lane evidence.
- Learning recommendations can be generated, approved, rejected, and rolled back without silent behavior changes.
- Command approval rejects stale command IDs.
- Stop workflow clears active approval/process state.
- Drift check classifies at least one item from real evidence.
- Git review shows changed files and persists review state.
- Mobile can pair, receive command approval, and approve/reject with signatures.
- Zero Egress blocks hosted model calls.
