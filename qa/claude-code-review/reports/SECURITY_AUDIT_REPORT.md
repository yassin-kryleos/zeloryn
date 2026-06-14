# SECURITY AUDIT REPORT
**Project:** Kryleos Forge — Desktop Backend + Web + Mobile
**Auditor:** Claude Code (Phase E QA — independent security pass)
**Date:** 2026-06-13
**Branch:** qa/full-test-audit
**Scope:** Desktop Express backend (server.ts, sync.ts), Web companion, Mobile companion, Electron configuration

---

## Methodology

This audit was conducted in three passes:

1. **Static analysis** — reading `server.ts` (~3,000 lines), `sync.ts`, middleware chain, CORS, Helmet, rate-limiter configuration, and all React component render paths.
2. **Dynamic testing** — supertest HTTP integration tests (`routes.integration.test.ts`, `security.integration.test.ts`) covering malformed input, auth bypass, injection, and rate limiting.
3. **Code-coverage scanning** — `secretScanner.extended.test.ts` scanning for hardcoded secrets, AWS credentials, GitHub tokens, Stripe live keys, Slack tokens, and EC/PKCS8 private keys across all three app directories.

No production systems were accessed. All probing was against the local development backend with `NODE_ENV=test`.

---

## Phase 1 Security Fixes Applied (This Audit Cycle)

The following fixes were applied to the codebase before the audit's dynamic testing phase:

### FIX-1: Stripe Production Key Guard — APPLIED ✓
**File:** `Desktop-app/src/backend/server.ts` (after Stripe init)

```ts
if (process.env.NODE_ENV === 'production' && stripeSecretKey.startsWith('sk_test_')) {
  throw new Error('FATAL: Production environment must not use a Stripe test key.');
}
```

Prevents live payment processing from being silently wired to a test Stripe account. Server refuses to start rather than accepting real payments against a test key.

### FIX-2: Request Body Size Limit — APPLIED ✓
**File:** `Desktop-app/src/backend/server.ts:298`

```ts
app.use(express.json({ limit: '1mb' }));
```

Closes the unbounded request body attack vector. Requests exceeding 1 MB now receive HTTP 413 Payload Too Large. Verified by integration test.

### FIX-3: Server Port Guard for Test Isolation — APPLIED ✓
**File:** `Desktop-app/src/backend/server.ts` (end of file)

```ts
if (process.env.NODE_ENV !== 'test') {
  server.listen(Number(PORT), BIND_HOST, () => { ... });
}
export { app, server };
```

Prevents port binding when tests import the server module, enabling supertest integration testing without port conflict.

### FIX-4: ErrorBoundary in Desktop + Mobile — APPLIED ✓
**Files:** `Desktop-app/src/App.tsx`, `Mobile-app/App.tsx`

React error boundaries added to both apps. Unhandled JavaScript errors in the render tree no longer produce a blank white screen — they show a recoverable fallback UI. This limits information disclosure (no raw stack traces rendered to users) and prevents silent app crashes from going unnoticed.

---

## Findings

### SEC-6: Malformed JSON → HTTP 500 Stack Trace — HIGH ⚠️ OPEN

**Status:** OPEN — not fixed in this cycle.

Sending a malformed JSON body (e.g. `{invalid json`) to any `POST` endpoint returns HTTP 500 with the full Express error stack trace including file paths, dependency versions, and Node.js internals.

**Vector:** `POST /api/auth/login` body: `{invalid`
**Response:** `SyntaxError: Unexpected token ... at JSON.parse ... node_modules/body-parser/...`
**Impact:** Information disclosure aids attacker reconnaissance (internal paths, dependency versions, framework fingerprinting).

**Fix (< 1 hour):** Add before the default error handler in `server.ts`:
```ts
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  next(err);
});
```

**Test coverage:** `security.integration.test.ts` — "malformed JSON returns 4xx not 500" (currently fails due to this gap; adjust once fixed).

---

### SEC-7: XSS via Unsanitized Session Task Content — HIGH ⚠️ OPEN

**Status:** OPEN — not fixed in this cycle.

Session task `content` fields accept and persist arbitrary HTML strings without sanitization. `<script>alert(1)</script>` is accepted and stored. If rendered in a browser context without JSX escaping (e.g. via `dangerouslySetInnerHTML`), this is a stored XSS vector.

**Vector:** `PUT /api/sessions/:id/tasks` with `{ tasks: [{ content: '<script>alert(1)</script>' }] }`
**Impact:** Stored XSS — any user viewing a compromised session could have JavaScript executed in their browser context.

**Fix (2–4 hours):**
1. Add `sanitize-html` (Node-compatible) to `Desktop-app` dependencies.
2. Sanitize `content` fields before writing to the encrypted database.
3. Audit all React render paths for `dangerouslySetInnerHTML` — replace with standard JSX.

**Test coverage:** `security.integration.test.ts` — "XSS payload in task content is not echoed in response" (structural, doesn't test storage sanitization).

---

### SEC-INPUT-01: Null Bytes in Email Accepted — MEDIUM ⚠️ KNOWN GAP

**Status:** KNOWN GAP — documented via `it.fails()` in test suite.

`POST /api/auth/register` with `email: "user\x00@example.com"` returns HTTP 200 and creates an account. Null bytes in email fields can cause issues in downstream processing (C-string truncation in native modules, unexpected database key collisions, SMTP injection).

**Fix (low effort):** Add a middleware validator that rejects any string field containing `\x00`. A one-line regex on the email field resolves this.

**Test coverage:** `security.integration.test.ts:it.fails(...)` — documented, will auto-promote to a real test once fixed.

---

### SEC-8: CORS Wildcard on No-Origin Requests — MEDIUM ℹ️ INFORMATIONAL

**Status:** INFORMATIONAL — no action required, document the behavior.

Requests without an `Origin` header (server-to-server, CLI tools) receive `Access-Control-Allow-Origin: *`. This is the Express CORS default and is not exploitable via browser, since browsers always send an `Origin` header on cross-origin requests. Authentication enforcement still applies to all routes regardless of CORS.

**Risk level:** Low. Document the behavior in server README.

---

## Passing Controls

| ID | Area | Control | Status |
|---|---|---|---|
| SEC-1 | Auth | PBKDF2-SHA512 password hashing, 100k iterations, 16-byte random salt | ✓ PASS |
| SEC-2 | Auth | No plaintext password fallback — fails closed on legacy accounts | ✓ PASS |
| SEC-3 | Auth | OAuth simulation requires `OAUTH_SIM_ENABLED=true` AND non-production | ✓ PASS |
| SEC-4 | Auth | 128-bit random token entropy, rotated each login | ✓ PASS |
| SEC-5 | Auth | Bearer token enforced via `Authorization` header only | ✓ PASS |
| FIX-1 | Billing | Stripe production key guard — throws on `sk_test_` in production | ✓ PASS |
| FIX-2 | Input | Request body limited to 1 MB — HTTP 413 above limit | ✓ PASS |
| SEC-9 | Headers | Helmet: X-Frame-Options, X-Content-Type-Options, HSTS, CSP, Referrer-Policy | ✓ PASS |
| SEC-10 | Rate limit | `sensitiveLimiter`: 30 req / 15 min on `/api/auth` and `/api/billing` | ✓ PASS |
| SEC-11 | Companion | Pairing code: 10-min TTL + 5-attempt brute-force lockout | ✓ PASS |
| SEC-12 | Companion | Multiple concurrent pairings intentional (phone + tablet + web) | ✓ PASS |
| SEC-13 | Secrets | No hardcoded production secrets in committed code | ✓ PASS |
| FIX-3 | Server | Conditional `server.listen()` — no port conflict in test mode | ✓ PASS |
| FIX-4 | Resilience | ErrorBoundary in Desktop + Mobile — no blank-screen crash | ✓ PASS |

---

## Secret Scanner Results

`secretScanner.extended.test.ts` ran 12 pattern checks across all three app directories:

| Pattern | Scope | Result |
|---|---|---|
| AWS AKIA/ASIA/AGPA/AIDA/AROA/ANPA/ANVA prefixes | All apps | ✓ None found |
| GitHub ghp_/gho_/ghs_/ghu_/ghr_ tokens (≥36 chars) | All apps | ✓ None found |
| Stripe `rk_live_` restricted keys | All apps | ✓ None found |
| Slack xoxp_/xoxs_/xoxa_ tokens | All apps | ✓ None found |
| EC private key PEM blocks | All apps | ✓ None found |
| PKCS8 private key PEM blocks | All apps | ✓ None found |
| Multi-line secret detection (line 5 wrapping) | All apps | ✓ None found |

No hardcoded secrets detected in any production code path.

---

## Summary Table

| ID | Severity | Status | Description |
|---|---|---|---|
| SEC-6 | HIGH | ⚠️ OPEN | Malformed JSON returns HTTP 500 with stack trace |
| SEC-7 | HIGH | ⚠️ OPEN | XSS: session task content stored without sanitization |
| SEC-INPUT-01 | MEDIUM | ⚠️ Known gap | Null bytes in email accepted by register endpoint |
| SEC-8 | MEDIUM | ℹ️ Info | CORS wildcard on no-Origin requests (expected behavior) |
| FIX-1 | HIGH | ✓ Fixed | Stripe production key guard applied |
| FIX-2 | HIGH | ✓ Fixed | Request body limit (1 MB) applied |
| FIX-3 | — | ✓ Fixed | Server conditional listen for test isolation |
| FIX-4 | — | ✓ Fixed | ErrorBoundary in Desktop + Mobile |
| SEC-1–5 | — | ✓ Pass | Auth, password hashing, token generation, header enforcement |
| SEC-9–13 | — | ✓ Pass | Helmet headers, rate limiting, companion security |
| Scanner | — | ✓ Pass | No hardcoded secrets found in any app directory |

**Two HIGH findings (SEC-6, SEC-7) must be resolved before public release.**
Estimated combined fix effort: 3–5 hours engineering time.
