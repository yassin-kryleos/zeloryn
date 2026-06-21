# Information Architecture

## Top-Level Structure

```text
Kryleos Forge
  Header
    Project selector
    Workspace status
    Model/provider status
    Tool/MCP status
    Zero Egress badge
    Config
    Sync/account status
  Main Navigation
    Plan
    Crew
    Flow
    Forge
```

## Header Responsibilities

- Show active project name.
- Show active workspace path or warning.
- Show active model/provider.
- Show active Tool API/MCP capability status.
- Show Ollama detection state.
- Show Zero Egress status.
- Show data disclosure state where needed.
- Provide Config access.
- Provide project manager access.
- Show connection/sync status.

## Plan IA

```text
Plan
  Scratchbook
    Session list
    Conversation
    Prompt input
    Voice input where supported
    Summarize and Push
  Plan Workspace
    Item list
    Item editor
    Feasibility badges
    Criteria preview
    Export Markdown
    Push to Crew
  Drift/What's Left
    Summary counts
    Item classifications
    Deferred/evaluated notices
```

## Crew IA

```text
Crew
  Handoff inbox
  Suggested personas
  Installed agents
  Starter packs
  Structured review output
  Diff to Flow
  Skills factory
```

## Flow IA

```text
Flow
  Today view
    Top tasks
    Execute Next
    Execute All Today
    Swap controls
  Kanban
    Todo
    In Progress
    Done
  Task detail
    Description
    Criteria
    Blockers
    Workspace
    Category
    Traces
    Drift status
```

## Forge IA

```text
Forge
  Agent console
  Active task context
  Swarm timeline
  Tool activity timeline
  Command approval
  Tool approval
  Stop workflow
  Preview Deck
    Files
    Live Preview
    Terminal
    Side Chat
    Artifacts
    Review
  Full Git Review
  Codebase Graph
  Learning Review
```

## Config IA

```text
Config
  Model Providers
    Ollama
    DeepSeek
    Gemini
    OpenAI
    Anthropic
    OpenRouter
    Health checks
    Capability detection
  Tool API and MCP
    Built-in tool registry
    MCP server list
    Add/test MCP server
    Tool allowlist/denylist
    Tool permission policies
    Tool audit log
  Privacy
    Zero Egress
    Provider disclosures
    PII redaction
  Billing
    Tier
    Stripe/Razorpay checkout
    License key
  Sync and Companion
    Account
    Pairing code/QR
    Devices
    Revoke device
  Developer
    Custom instructions
    Response mode
    Swarm max lanes
    Suggest-only learning controls
    Workspace rules status
```

## Feature Status Taxonomy

Every non-production feature must show one of:

- Production: usable and intended for beta reliability.
- Preview: usable, but still being hardened.
- Simulator: demonstrates future behavior but does not provide real infrastructure.
- Mock: local/demo implementation of a production concept.
- Planned: documented but not implemented.

Status labels must appear in UI areas where a user could otherwise misunderstand feature readiness.

## Canonical Feature Statuses

Production:

- Local workspace.
- File tools.
- Git review.
- Command approval.
- Tool API Gateway for built-in tools.
- Ollama/BYOK provider routing once configured.

Preview:

- MCP server integration until hardened across transports.
- Provider-native tool adapters until each provider has contract coverage.
- Native task swarm until lane execution, trace grouping, and stop behavior are hardened.
- Suggest-only learning until evidence extraction, approval, and rollback behavior are hardened.
- Cloud sync.
- Collaboration indicators.
- Cloud IDE indicators.
- Marketplace-like local agents/skills.
- Docs generation helpers until fully hardened.

Simulator:

- Remote container execution.
- RBAC indicators unless backed by real org permissions.

Mock:

- Mock billing and subscription state.

Planned:

- Full public marketplace.
- Full cloud IDE.
- Production org RBAC.
- Remote container infrastructure.
- Broad third-party integration catalog beyond GitHub/Linear/Sentry.

## Naming Rules

- Product copy uses "Kryleos Forge".
- Internal shorthand can use "Forge".
- User-facing tabs use Plan, Crew, Flow, Forge.
- Do not expose legacy Matrix naming in user-facing UI.
- Legacy localStorage or migration keys may keep old names internally but must not drive copy.

## Design Rules for Rebuild

- Default theme is professional dark Forge theme.
- Matrix rain/green-glow theme is opt-in only.
- Use icons for common tools.
- Avoid large landing-page layouts inside the desktop app.
- Dense workspace screens should be scannable and utilitarian.
- Controls must fit on mobile and desktop.
- No cards inside cards.
- No hidden feature descriptions as decorative UI.
