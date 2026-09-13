# Free & Open Source Architecture (BYOK)

## Philosophy

Kryleos Forge is 100% free and open-source software. All features, capabilities, and workflows are completely accessible without paywalls, subscriptions, license keys, or feature tiers.

Users bring their own AI compute via **BYOK (Bring Your Own Key)** for cloud LLM providers (Anthropic, OpenAI, OpenRouter, Google Gemini) or use **local inference** (Ollama, local vLLM).

## Fully Unlocked Capabilities

All capabilities that were formerly tiered are available unconditionally to all users:

- **Full Workflow Lifecycle**: PLAN → CREW → FLOW → FORGE lifecycle spaces.
- **Autonomous Multi-Agent Crew**: Multi-agent task execution with git-worktree isolation and dependency-aware scheduling.
- **Direct Plan Syncing**: Seamless sync from PLAN scoping directly into CREW kanban task cards.
- **Comprehensive Drift Detection**: Real-time tracking of divergence between planning acceptance criteria, file diffs, and execution status.
- **Semantic Workspace Indexing**: Local symbol and semantic cache indexer for rapid repo exploration.
- **Self-Healing & Rollback**: Automatic failure detection, command exit monitoring, and snapshot rollbacks.
- **Local Security & RBAC**: Configurable local policy enforcement restricting destructive commands.
- **Export & Reports**: Full Markdown, workflow, and audit trail export.
- **Companion Pairing**: Local secure device pairing between desktop, web companion, and mobile companion via `COMPANION_AUTH_TOKEN` and local QR pairing.

## Security Boundaries

Kryleos Forge maintains robust security boundaries for local execution:

1. **`LOCAL_SESSION_SECRET`**: Protects the local command-execution server from unauthorized local processes.
2. **Companion Pairing**: Secure token-authenticated pairing (`COMPANION_AUTH_TOKEN`, `/api/companion/pairing-code`) ensuring only authorized companion devices communicate with the desktop node.
3. **Workspace Path Isolation**: Prevents path traversal and confines tool executions to the active workspace directory.
4. **`OS_FINGERPRINT`**: Secure per-install entropy seed used for local credential encryption.
