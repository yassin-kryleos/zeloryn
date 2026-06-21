# Monetization, Tiers, and Gating

## Pricing Philosophy

Users bring their own AI through BYOK or Ollama. Kryleos Forge charges for the workflow layer that makes AI useful across a whole project: planning, execution tracing, drift detection, sync, multi-repo workflows, and handoff automation.

## Tiers

### Free - $0

Includes:

- Plan, Crew, Flow, Forge spaces.
- Local workspace tools.
- Built-in Tool API tools for local file/Git/review workflows.
- Ollama/local models.
- BYOK hosted models.
- Starter agent packs.
- Manual PLAN to CREW Markdown export.
- Single workspace.

Excludes:

- Cross-device sync.
- Direct PLAN to CREW sync.
- Execution tracing.
- Full drift detection.
- Multi-repo plan scope.
- Founder/Agency workflows.

What's Left:

- Shows top 5 unresolved items.

### Solo - $5/month

Adds:

- Basic execution tracing.
- Direct PLAN to CREW sync on desktop.
- AI-generated acceptance criteria.
- Basic drift detection: Not Started, In Progress, Complete.
- Basic cloud sync/backup preview.

What's Left:

- Up to 25 items.

### Solo Plus - $9/month

Adds:

- Full drift detection with Diverged/confidence behavior.
- Trace history.
- Mobile/web PLAN sync to desktop.
- Cost history.
- Semantic cache/self-healing preview if implemented.
- Custom MCP servers in Preview with limited count.
- Provider-native tool calling for supported BYOK providers.

What's Left:

- Up to 50 items.

### Founder - $15/month

Adds:

- Multi-repo plan scope.
- Cross-repo drift.
- Unlimited What's Left.
- Markdown export for reports.
- Plan versioning.
- Plan item dependencies.
- Agent specialization per plan item.
- Founder workflow generators.
- Advanced external integrations such as GitHub PR/checks/actions, Linear, and Sentry previews.

### Agency/Team - $39/month

Adds:

- Shared plan editing.
- Team trace visibility.
- Per-member execution history.
- Client handoff packs.
- Branded exported docs.
- Collaboration preview indicators.
- RBAC simulator indicators.
- Priority support.

### Early Lifetime - $99-$149 one-time

Limited early-adopter offer after Preview Deck and execution tracing work reliably.

## Gating Principles

- Do not cap core local task counts artificially on Free.
- Gate workflow value, not basic usage.
- Enforce gates server-side.
- Show inline upgrade prompts, not blocking walls.
- Make mock/simulator/preview status visible.

## Server-Side Gates

Free blocked:

- Direct `/api/crew/sync`.
- Cross-device sync push/pull.
- Full trace history.
- Full drift/divergence.
- Custom MCP server configuration beyond bundled safe local tools.
- Advanced network/API tools outside documented local preview targets.

Founder required:

- Multi-repo plan scope.
- Dependencies enforcement UI/actions.
- Unlimited What's Left.
- Founder workflow generation.
- Advanced third-party workflow integrations.

Agency required:

- Agency export workflows.
- Branded docs.
- Team-level visibility.
- RBAC simulator surfaces.
- Shared/team MCP server configuration when team collaboration is implemented.

## Billing Providers

### Stripe

Default checkout and subscription provider for most regions.

### Razorpay

Used for India-locale users where configured.

### License Key

Early launch fallback. License validation can be local for early beta, but production should migrate to server-verified entitlements.

## Upgrade UX

When a feature is locked:

1. Render the locked action disabled or preview-only.
2. Show inline nudge:
   - Feature name.
   - Required tier.
   - Price.
   - Upgrade button.
3. Upgrade opens tier comparison modal.
4. Checkout opens external browser or embedded safe flow.
5. After payment/license, app refreshes entitlement.

## Feature Status in Pricing

Pricing must label:

- Cloud sync as Preview until production sync is hardened.
- Remote containers as Simulator until real remote compute exists.
- RBAC as Simulator until real org permissions exist.
- Billing as Mock where using mock subscription routes.
- Full marketplace as Preview/Planned until public distribution exists.

## Entitlement Data

```typescript
type TierId = 'free' | 'solo' | 'solo_plus' | 'founder' | 'agency';

interface Entitlement {
  userId: string;
  tier: TierId;
  billingProvider?: 'stripe' | 'razorpay' | 'license';
  subscriptionId?: string;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'free';
  updatedAt: string;
}
```

## Billing Release Gates

- Production builds cannot use mock live billing keys.
- Webhook signatures verified.
- Subscription downgrade tested.
- License validation tested.
- Client cannot self-upgrade tier without server/license validation.
- Region routing to Razorpay/Stripe tested.
