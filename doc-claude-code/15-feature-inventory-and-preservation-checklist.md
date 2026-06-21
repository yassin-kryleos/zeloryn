# Feature Inventory and Preservation Checklist

## Purpose

This checklist preserves the current Kryleos Forge concept and feature set during the rebuild. A feature can be redesigned, deferred, or relabeled, but it must not disappear accidentally.

## Product Core

- [ ] Build Loop: Plan -> Crew -> Flow -> Forge.
- [ ] Project-first onboarding.
- [ ] Local-first desktop app.
- [ ] BYOK model support.
- [ ] Ollama/local model support.
- [ ] Zero Egress Mode.
- [ ] Provider disclosure before hosted calls.
- [ ] Workspace sandbox.
- [ ] Multi-agent execution.
- [ ] Execution traces.
- [ ] Plan drift detection.
- [ ] Git-backed review.

## Plan

- [ ] Scratchbook ideation chat.
- [ ] Persistent sessions.
- [ ] Plan Workspace staging list.
- [ ] Summarize and Push.
- [ ] User review before items are saved.
- [ ] Feasibility checks.
- [ ] Markdown export for Free tier.
- [ ] Direct PLAN to CREW sync for Solo+.
- [ ] Existing codebase bootstrap.
- [ ] What's Left report.
- [ ] GitHub issue metadata fields.

## Crew

- [ ] Technical Reviewer persona.
- [ ] Scope Guard persona.
- [ ] Risk Identifier persona.
- [ ] Structured Markdown output with `### [ITEM]`.
- [ ] CREW to FLOW diff confirmation.
- [ ] Starter agent packs.
- [ ] Custom agents.
- [ ] Custom skills.
- [ ] Share/export agent path.

## Flow

- [ ] Today view.
- [ ] Kanban board.
- [ ] Break down action.
- [ ] Estimate action.
- [ ] Execute action.
- [ ] Task detail.
- [ ] Acceptance criteria editor.
- [ ] Blocked-by dependencies.
- [ ] Category tags.
- [ ] Workspace assignment.
- [ ] Multi-repo labels/grouping.
- [ ] Drift status badges.
- [ ] Trace history link.

## Forge

- [ ] Agent console.
- [ ] Active task context.
- [ ] Specialist routing.
- [ ] General fallback indicator.
- [ ] File browser.
- [ ] Codebase graph.
- [ ] Git tools.
- [ ] Git review panel.
- [ ] Command approval.
- [ ] Command rejection.
- [ ] Stop workflow.
- [ ] Active process kill on abort.
- [ ] Preview Deck.
- [ ] Live Preview.
- [ ] Terminal evidence.
- [ ] Side Chat.
- [ ] Artifacts.

## Tool API and MCP

- [ ] Tool API Gateway.
- [ ] Typed tool registry with JSON schemas.
- [ ] Provider-native tool/function calling.
- [ ] OpenAI Responses API adapter for tool-capable workflows.
- [ ] Anthropic native tool use path.
- [ ] Gemini function calling path.
- [ ] Ollama/OpenRouter/DeepSeek native-or-text fallback path.
- [ ] Text fallback validates against ToolDefinition schemas.
- [ ] MCP local stdio server support.
- [ ] MCP remote HTTP/SSE server support.
- [ ] MCP server add/test/discover/allowlist/disable flow.
- [ ] Tool approval with invocation IDs.
- [ ] Redacted tool invocation audit log.
- [ ] Tool output sanitization.
- [ ] Prompt-injection scan for external tool output.
- [ ] File apply patch tool.
- [ ] AST/LSP/tree-sitter code intelligence tools.
- [ ] Test/build/package manager tools.
- [ ] Browser/Playwright preview tools.
- [ ] HTTP/API tool with approval and Zero Egress enforcement.
- [ ] Read-only DB query tool.
- [ ] Log parser tool.
- [ ] GitHub PR/checks/actions integration preview.
- [ ] Linear integration preview.
- [ ] Sentry issue/event evidence preview.

## Native Task Swarm

- [ ] Run with Swarm action in Flow.
- [ ] Hierarchical swarm topology.
- [ ] Coordinator lane.
- [ ] Builder lane.
- [ ] Reviewer lane.
- [ ] Conditional Tester lane.
- [ ] Conditional Security lane.
- [ ] Conditional Docs lane.
- [ ] Conditional DevOps lane.
- [ ] Max 3 active worker lanes by default.
- [ ] Tool API enforcement for every worker action.
- [ ] Serialized write/execute/network/admin actions.
- [ ] Swarm timeline in Forge.
- [ ] Swarm stop/abort behavior.
- [ ] Swarm trace metadata.
- [ ] Evidence grouped by lane.

## Suggest-Only Learning

- [ ] Local learning signals from traces.
- [ ] Learning signals from criteria results.
- [ ] Learning signals from tool/command approvals.
- [ ] Learning signals from drift and review outcomes.
- [ ] Learning Review panel.
- [ ] Recommendation confidence.
- [ ] Evidence references.
- [ ] Approve recommendation.
- [ ] Reject recommendation.
- [ ] Rollback approved pattern.
- [ ] Approved local learning hints.
- [ ] Rejected recommendation signature suppression.
- [ ] Secret scan before learning memory write.
- [ ] Zero Egress blocks cloud/cross-user learning.
- [ ] No silent prompt/tool/policy mutation.

## Planning Engine

- [ ] Phase 1 abstract criteria.
- [ ] Phase 2 enriched criteria.
- [ ] Criteria diff review.
- [ ] Criteria types: file_exists, symbol_exists, git_grep, test_passes, llm_check.
- [ ] Structural checks before LLM.
- [ ] LLM check budget.
- [ ] Divergence classification.
- [ ] Drift cache.
- [ ] Trace extraction call.
- [ ] User-confirmed auto-complete.

## Workspace and Git

- [ ] Select workspace.
- [ ] Persist workspace.
- [ ] Path containment.
- [ ] Whitelisted multi-repo paths.
- [ ] Read files.
- [ ] Write files.
- [ ] Create files/folders.
- [ ] Delete files safely.
- [ ] Search files.
- [ ] CSV preview.
- [ ] Git status.
- [ ] Stage/unstage.
- [ ] Commit.
- [ ] Push/pull.
- [ ] Safe revert to `.kryleos/reverted`.
- [ ] Review state in `.kryleos/reviews`.

## Providers and Cost

- [ ] DeepSeek.
- [ ] Gemini.
- [ ] OpenAI.
- [ ] Anthropic.
- [ ] OpenRouter.
- [ ] Ollama.
- [ ] Provider detection.
- [ ] Provider health check.
- [ ] Provider test call.
- [ ] Response modes.
- [ ] Thinking capability setting.
- [ ] Cost estimate.
- [ ] Cost history for gated tiers.

## Security and Privacy

- [ ] Local session auth.
- [ ] CORS/origin restrictions.
- [ ] Helmet/security headers where appropriate.
- [ ] Rate limiting sensitive routes.
- [ ] Encrypted chat DB.
- [ ] Secure credential storage.
- [ ] Secret scanner.
- [ ] PII redaction.
- [ ] Zero Egress backend enforcement.
- [ ] Command ID stale approval rejection.
- [ ] Destructive command classification.
- [ ] Workspace rules loading.

## Companion

- [ ] Companion WebSocket.
- [ ] Pairing code.
- [ ] Pairing secret.
- [ ] Pairing expiry.
- [ ] Failed-attempt lockout.
- [ ] Device registry.
- [ ] Device token reconnect.
- [ ] Signed mobile approvals.
- [ ] Nonce replay protection.
- [ ] Desktop signature on approval requests.
- [ ] Remote reject.
- [ ] Remote stop.
- [ ] Remote start FORGE run.
- [ ] Session update broadcast.
- [ ] Real process telemetry.
- [ ] Device revoke.
- [ ] Offline note sync.

## Web Companion

- [ ] Marketing surface.
- [ ] Pricing matrix.
- [ ] Planning draft.
- [ ] Desktop import/sync.
- [ ] Demo Build Loop simulation.
- [ ] Settings.
- [ ] Voice input.
- [ ] Auth preview.
- [ ] Semantic cache preview.
- [ ] Self-healing rollback preview.
- [ ] RBAC simulator labels.
- [ ] What's real page.

## Mobile Companion

- [ ] Dashboard.
- [ ] Plan.
- [ ] Chat.
- [ ] Tasks.
- [ ] Settings.
- [ ] SecureStore identity.
- [ ] Pairing.
- [ ] Approval modal.
- [ ] Destructive confirmation.
- [ ] Vibration on approval.
- [ ] Offline queue.
- [ ] Voice notes.
- [ ] Live logs.
- [ ] Latest trace.
- [ ] Telemetry.

## Billing and Tiers

- [ ] Free tier.
- [ ] Solo tier.
- [ ] Solo Plus tier.
- [ ] Founder tier.
- [ ] Agency/Team tier.
- [ ] Early Lifetime offer.
- [ ] Stripe checkout/webhook.
- [ ] Razorpay checkout/webhook.
- [ ] License key validation.
- [ ] Region-based billing routing.
- [ ] Server-side tier gates.
- [ ] Inline upgrade prompts.
- [ ] Mock billing label where applicable.

## Founder and Agency Workflows

- [ ] Docs generation.
- [ ] Docs patch from Git diff.
- [ ] Docs write.
- [ ] Founder workflow generation.
- [ ] Agency export.
- [ ] Branded docs.
- [ ] Secret scan before export/write.
- [ ] Tier gate enforcement.

## Deferred but Preserved

- [ ] VS Code extension.
- [ ] GitHub Issues import.
- [ ] Linear import.
- [ ] Production team collaboration.
- [ ] Production RBAC.
- [ ] Real remote containers.
- [ ] Hosted cloud IDE.
- [ ] Public marketplace.
