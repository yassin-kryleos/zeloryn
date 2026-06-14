// Canonical pricing ladder — single source of truth (DECISIONS.md #1).
//
// Edit ONLY this file to change prices/labels/tiers. Run
// `node scripts/generate-pricing.mjs` (or `npm run build` in Web-app /
// Desktop-app, which runs it automatically via the `pregenerate*` scripts)
// to regenerate `src/pricing.generated.ts` in each app.

/** @typedef {'free'|'solo'|'solo_plus'|'founder'|'agency'} TierId */

export const PRICING_TIERS = [
  { id: 'free', label: 'Free', priceUsd: 0, priceInr: 0, status: 'production' },
  { id: 'solo', label: 'Solo', priceUsd: 5, priceInr: 399, status: 'production' },
  { id: 'solo_plus', label: 'Solo Plus', priceUsd: 9, priceInr: 699, status: 'production' },
  { id: 'founder', label: 'Founder', priceUsd: 15, priceInr: 1199, status: 'production' },
  // Agency has no real multi-tenant infra yet — preview only, not purchasable.
  { id: 'agency', label: 'Agency', priceUsd: null, priceInr: null, status: 'preview' },
];

// Tiers that can actually be checked out (drives Gumroad product list / priceMap).
export const BUYABLE_TIER_IDS = PRICING_TIERS
  .filter(t => t.status === 'production' && t.priceUsd > 0)
  .map(t => t.id);
