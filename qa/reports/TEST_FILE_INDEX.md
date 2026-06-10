# Test File Index

Since our test framework (Vitest) requires spec files to remain adjacent to the source code modules they test, this index maps the locations of all test files in the codebase.

---

## Backend Test Files

### Core Integration Suites
- [planningV2.integration.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/planningV2.integration.test.ts): Full hands-off synchronizations and drift checks.
- [collab.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/collab.test.ts): Real-time user collaborative notes and task edits.
- [advanced_features.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/advanced_features.test.ts): Test git diff checks, reviews status transitions, and staging.

### Sandbox & Security Suites
- [__tests__/sandbox.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/__tests__/sandbox.test.ts): Workspace sandbox directory list and execution containment tests.
- [__tests__/commandSecurity.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/__tests__/commandSecurity.test.ts): Command timeout, limits, and approvals logs tests.
- [__tests__/secretScanner.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/__tests__/secretScanner.test.ts): Regular expression token matching checks.
- [security.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/security.test.ts): AES-256 fallback encryption and OS local keys tests.
- [process_abort.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/process_abort.test.ts): Command execution cancellation signal tests.

### Billing & User sync Suites
- [__tests__/billing.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/__tests__/billing.test.ts): Checkout, portal, and webhook handling tests.
- [__tests__/functional.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/__tests__/functional.test.ts): Backend API functional flow validations.
- [sync.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/sync.test.ts): User register, login, and cloud storage synchronize checks.
- [fingerprint.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/fingerprint.test.ts): Hardware fingerprint generation and key checking tests.

### Agent & Prompts Routing
- [__tests__/costGuard.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/__tests__/costGuard.test.ts): Token estimation models pricing verification tests.
- [response_mode.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/response_mode.test.ts): Prompt modes parsing (concise, minimal, docs-heavy, etc.) tests.
- [agents_parse.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/agents_parse.test.ts): Agent squad parsing and markdown task lists extraction.
- [agents_smoke.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/agents_smoke.test.ts): Multi-agent orchestrator streams simulation.

---

## Shared Test Files

- [shared/dependencies.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/shared/dependencies.test.ts): Cyclic dependencies check.
- [shared/todayScore.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/shared/todayScore.test.ts): Today score metrics.
- [shared/crewParser.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/shared/crewParser.test.ts): Multi-agent crew config parser.
- [shared/agentCapabilities.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/shared/agentCapabilities.test.ts): Agent credentials mapping.
- [shared/providerDisclosure.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/shared/providerDisclosure.test.ts): Provider disclosure banners checks.

---

## Web Client Test Files
- [useVoiceInput.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Web-app/src/hooks/useVoiceInput.test.ts): Web speech voice input checks (Vitest).
- [functional.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Web-app/src/functional.test.ts): Web inputs and upgrade permissions functional tests.

---

## Mobile Client Test Files
- [App.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Mobile-app/App.test.ts): Mobile app redaction checks (Vitest).
- [utils/redact.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Mobile-app/src/utils/redact.ts): Standalone redaction utility logic.
- [utils/functional.test.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Mobile-app/src/utils/functional.test.ts): Mobile offline queue sync and watchOS guides functional tests.

---

## E2E Simulation Scripts
- [run-e2e-checks.mjs](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/qa/scripts/run-e2e-checks.mjs): Companion WebSocket gateway E2E pairing simulator.
