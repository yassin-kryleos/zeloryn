## Exit Report — Phase 1: Strip payment & login gating

### Changes made
- Desktop-app/package.json: Removed `generate:pricing` npm script, `predev` and `prebuild` hooks, and removed `stripe` & `razorpay` dependencies.
- Web-app/package.json: Removed `generate:pricing` npm script, `predev` and `prebuild` hooks, and removed `stripe` & `razorpay` dependencies.
- Mobile-app/package.json: Removed `prestart` and `pretest` hooks that regenerated pricing.
- Desktop-app/src/backend/license.ts [DELETED]: Removed offline/online cryptographic license key verification.
- Desktop-app/src/backend/razorpay.ts [DELETED]: Removed Razorpay SDK client, order creation, and subscription helpers.
- Desktop-app/src/backend/sync.ts [DELETED]: Removed remote cloud sync controller and authentication database.
- Desktop-app/scripts/issue-license.mjs [DELETED]: Removed CLI license token generation script.
- Desktop-app/src/backend/__tests__/billing.test.ts [DELETED]: Removed test suite for deleted billing controller.
- Desktop-app/src/backend/__tests__/billing_processors.test.ts [DELETED]: Removed test suite for deleted payment processors.
- Desktop-app/src/backend/__tests__/tier_trust.test.ts [DELETED]: Removed test suite for tier trust ladder and license validation.
- Desktop-app/src/backend/sync.test.ts [DELETED]: Removed test suite for deleted sync controller.
- Desktop-app/src/backend/__tests__/sync.security.test.ts [DELETED]: Removed security tests for deleted sync controller.
- scripts/pricing.source.mjs [DELETED]: Removed canonical pricing matrix source.
- scripts/generate-pricing.mjs [DELETED]: Removed code generator script for pricing matrix.
- Desktop-app/src/pricing.generated.ts [DELETED]: Removed generated pricing matrix and `TierId` from Desktop app.
- Web-app/src/pricing.generated.ts [DELETED]: Removed generated pricing matrix and `TierId` from Web app.
- Mobile-app/src/pricing.generated.ts [DELETED]: Removed generated pricing matrix and `TierId` from Mobile app.
- Project-Documents/11-Subscription-and-Feature-Tiers.md [DELETED]: Removed legacy subscription tier specification.
- Project-Documents/13-Growth-and-Pricing-Strategy.md [DELETED]: Removed legacy monetization strategy doc.
- Desktop-app/src/backend/server.ts: Removed Stripe SDK init, Razorpay init, and deleted routes `/api/auth/register`, `/api/auth/login`, `/api/auth/subscribe`, `/api/billing/*`, `/api/license/activate`, `/api/sync/push`, `/api/sync/pull`. Removed `isTierAllowed` tier checks on `/api/docs/generate`, `/api/workflows/founder/generate`, and `/api/workflows/agency/export`. CostGuard, PLAN→CREW sync, and What's Left drift reports are unconditionally active. Attached `sensitiveLimiter` to `/api/companion/pairing-code`. Preserved `LOCAL_SESSION_SECRET`, `/api/companion/pairing-code`, `COMPANION_AUTH_TOKEN`, and `OS_FINGERPRINT`.
- Desktop-app/src/backend/tools.ts: Stripped tier requirements on `buildSemanticCache`, `querySemanticCache`, RBAC, and file rollback so features are unconditionally accessible. Preserved `setUserTier` / `getUserTier` stubs for backwards compatibility.
- Desktop-app/src/components/ConfigHeader.tsx: Removed Billing tab, license key input, pricing matrix imports, user auth/sync props, and upgrade banners.
- Desktop-app/src/components/PlanningScreen.tsx: Removed `userTier`, `tierLadder`, `isTierAllowed`, export modals, and gating banners.
- Desktop-app/src/components/CoworkSpace.tsx: Removed `userTier` prop and upgrade prompts.
- Desktop-app/src/App.tsx: Removed `user`, `syncStatus`, `lastSyncedAt`, `loginInFlightRef` states, all billing/license/auth/sync handlers, and props removed from `<ConfigHeader />`, `<CoworkSpace />`, and `<PlanningScreen />`.
- Desktop-app/src/shared/featureStatus.ts: Updated status mappings (`billing` to production/BYOK, `cloudSync` to planned/local-only, `rbac` to production/local config, `remoteContainer` to planned/local sandbox).
- Web-app/src/App.tsx: Removed `pricing.generated` imports, `UserTier`, `PRICING_MATRIX`, and tier lock states (`showSyncOverlay`, `showCollabOverlay`, `showSemanticLock`, `showRbacLock`, `showSyncLockModal`). Rewrote pricing CTA and tab to "Free & Open Source (BYOK)". Unlocked all settings panels without tier checks.
- Mobile-app/App.tsx: Removed `pricing.generated` imports and `userTier` state. Removed tier restrictions from Semantic Cache, Self-Healing, and RBAC toggles. Replaced "ACCOUNT & BILLING PLAN" card with "FREE & OPEN SOURCE (BYOK)" Community Edition card. Removed `showSyncModal` premium lock modal.
- docs/10-monetization-tiers-and-gating.md: Rewritten into a concise "Free & Open Source Architecture (BYOK)" document describing the free philosophy, fully unlocked capabilities, and preserved security boundaries.
- Desktop-app/src/__tests__/components.unit.test.tsx: Updated `cloudSync` FeatureBadge test assertion to match `planned/local-only` status.
- Desktop-app/src/__tests__/renderer.functional.test.tsx: Added `localStorage` stub for Node 22 compatibility in jsdom test runner.
- Desktop-app/src/backend/__tests__/functional.test.ts: Pruned deleted `syncController` test suites (Sections 1, 2, 4) and retained ChatDatabase persistence & DB storage test.
- Desktop-app/src/backend/__tests__/remediation.test.ts: Pruned deleted `syncController` password test (SEC-04) while preserving workspace path boundary (SEC-03) and encrypted DB storage (SEC-10).
- Desktop-app/src/backend/advanced_features.test.ts: Updated tests to assert unconditional access for semantic cache indexing, querying, self-healing rollbacks, and RBAC policies regardless of user tier. Made outside path resolution check cross-platform.
- Desktop-app/src/backend/__tests__/api.contract.test.ts: Excised contract test suites for removed `/api/auth/register` and `/api/auth/login` routes while preserving `/api/companion/status`, `/api/companion/pairing-code`, and 404 tests.
- Desktop-app/src/backend/__tests__/routes.integration.test.ts: Excised integration test suites for removed `/api/auth/register` and `/api/auth/login` routes while redirecting malformed/oversized payload tests to active endpoints.
- Desktop-app/src/backend/__tests__/security.integration.test.ts: Excised removed `/api/auth/login` tests while verifying XSS sanitization, auth bypass resilience, error leakage prevention, and rate limiting on sensitive pairing code generation.
- Web-app/src/functional.test.ts: Updated feature permissions suite (Section 3) to assert unconditional access for all users under BYOK.

### Deviations from plan
None. The implementation followed §4 Phase 1 of `docs/open-sorce-startegy.md` strictly:
- Preserved `LOCAL_SESSION_SECRET`, companion pairing (`COMPANION_AUTH_TOKEN`, `/api/companion/pairing-code`, `companionHub`), and `OS_FINGERPRINT`.
- Did not touch out-of-scope files or proceed into Phase 2 (no LICENSE, no README rewrite, no installers, no MCP work).
- Retained backwards-compatible `setUserTier` / `getUserTier` stubs in `tools.ts` to prevent runtime crashes if legacy references call them.

### Tests run
- `Desktop-app`: `npx vitest run` → 51 passed / 1 skipped / 1 failed (`ccDeviationService.test.ts`). 451 tests passing.
- `Desktop-app`: `npm run build` (`tsc -b && vite build && npm run build:backend`) → Passed (exit code 0). Both client bundle and backend CJS bundle compiled without error.
- `Web-app`: `npm test` (`vitest run`) → Passed (exit code 0, 3/3 test files passed, 17/17 tests passing).
- `Web-app`: `npm run build` (`tsc -b && vite build`) → Passed (exit code 0, clean Vite production build).
- `Mobile-app`: `npm test` (`vitest run`) → Passed (exit code 0, 5/5 test files passed, 46/46 tests passing).
- `Mobile-app`: `npx tsc --noEmit` → Passed (exit code 0, 0 type errors).

### Known gaps / follow-ups
- `Desktop-app/src/backend/__tests__/ccDeviationService.test.ts`: Pre-existing test failure due to Windows-specific git path resolution (`spawnSync git ENOENT`) when running inside non-Windows environments. This is unrelated to billing/monetization and was left untouched in accordance with the Phase 1 instructions ("Do not add features, refactors, or cleanup beyond what's listed — if you notice something else worth fixing, note it in the exit report's 'Known gaps' section instead of doing it").
- License selection and public README overhaul will be performed in Phase 2 ("Open-source packaging").
- Multi-model CLI agent runner generalization will be performed in Phase 4.

### Verification needed from reviewer
- Confirm git status diff: 38 files changed (323 insertions, 4,786 deletions), confirming all Stripe, Razorpay, licensing, and paywall code is excised.
- Verify that `LOCAL_SESSION_SECRET`, `/api/companion/pairing-code`, `COMPANION_AUTH_TOKEN`, and `OS_FINGERPRINT` remain intact.
- Confirm all features (semantic cache, drift detection, what's left, plan→crew sync, documentation export) are available unconditionally without paywalls.
- Authorize transition to Phase 2.
