# CLAUDE SECURITY REVIEW
**Project:** Kryleos Forge — Desktop Backend + Web Companion
**Tester:** Claude Code (independent QA pass)
**Date:** 2026-06-12
**Branch:** qa/full-test-audit
**Scope:** Desktop Express backend (port 3001), Web-app (port 5174), Auth/Billing/Sessions API surface

---

## Methodology

Security review combined:
1. **Static analysis** — reading `server.ts` (2958 lines), `sync.ts`, middleware configuration, CORS and Helmet setup
2. **Runtime API probing** — sending malformed requests, testing auth bypass vectors, boundary conditions
3. **Unit test review** — `sync.security.test.ts` covering SEC-M1 findings

No production systems were touched. All probing was against the local development backend (`NODE_ENV=test`).

---

## 1. Authentication & Credential Security

### SEC-1: Password Hashing — PASS ✓

All passwords are stored using PBKDF2-SHA512 with a random 16-byte salt, 100,000 iterations, 64-byte output (`sync.ts:6-10`). The hash format is `salt:hash` (colon-separated). This meets OWASP recommended standards for password storage.

```
salt (16 bytes hex) + ':' + hash (64 bytes hex)
```

Timing-safe comparison (`crypto.timingSafeEqual`) is used to prevent timing oracle attacks (`sync.ts:37`).

### SEC-2: No Plaintext Fallback — PASS ✓ (Fixed in this session)

The legacy plaintext equality fallback (`storedHash === password`) was removed. Any stored credential that does not contain a `:` (i.e. not PBKDF2-formatted) now **fails closed** — `verifyPassword` returns `false`. Covered by test `sync.security.test.ts:21` ("refuses login for a legacy account stored as plaintext").

### SEC-3: OAuth Simulation Guard — PASS ✓ (Fixed in this session, SEC-M1)

`isOauthSimSecret()` in `sync.ts:18-23` now requires **both**:
- `process.env.NODE_ENV !== 'production'`
- `process.env.OAUTH_SIM_ENABLED === 'true'` (explicit opt-in)

Previously only `NODE_ENV !== 'production'` was checked, meaning any staging/CI deployment with `NODE_ENV=staging` would silently activate the OAuth bypass. The fix makes the bypass non-activating by default in all non-production environments unless explicitly opted in.

### SEC-4: Token Generation — PASS ✓

Auth tokens are generated as: `token_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`. The 16 random bytes provide 128 bits of entropy. Tokens are refreshed on every login (new token issued each session), preventing replay of stale tokens.

### SEC-5: Bearer Token Enforcement — PASS ✓

The backend reads the auth token exclusively from the `Authorization: Bearer <token>` header. Tokens in the request body are ignored. Verified by direct API testing:
- `POST /api/auth/subscribe` with token in body → 401
- `POST /api/auth/subscribe` with `Authorization: Bearer <token>` → 200

---

## 2. Input Validation & Error Handling

### SEC-6: Malformed JSON → HTTP 500 Stack Trace — CRITICAL ⚠️

**Severity: HIGH**

Sending a malformed JSON body to any POST endpoint (e.g. `POST /api/auth/login` with body `{invalid json`) returns an HTTP 500 response containing the full Express error stack trace in the HTML response body:

```
SyntaxError: Unexpected token 'i', "{invalid json" is not valid JSON
    at JSON.parse (<anonymous>)
    at parse (/path/to/Desktop-app/node_modules/body-parser/lib/types/json.js:...)
    at Layer.handle [as handle_request] ...
```

**Impact:** Discloses internal file paths, Node.js version hints, dependency versions, and server-side technology stack. This is an information disclosure vulnerability that aids an attacker in reconnaissance.

**Root cause:** Express default error handler is active; no custom JSON parse error middleware catches `SyntaxError` from `body-parser` and returns a clean 400 response.

**Recommendation:** Add a JSON parse error handler before the default Express error handler:
```ts
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  next(err);
});
```

### SEC-7: XSS — Session Task Content Stored Without Sanitization — HIGH ⚠️

**Severity: HIGH**

Session tasks accept arbitrary string content and store it in the encrypted JSON database without HTML sanitization. In the test:
```json
{ "tasks": [{ "id": 1, "content": "<script>alert(1)</script>", "status": "todo" }] }
```
The payload was accepted and stored. If this content is later rendered in a browser context via the Desktop Electron app or Web companion without escaping, it would execute as JavaScript (XSS).

**Impact:** Depends on render context. In Electron (Node integration off, contextIsolation on) the risk is reduced but not eliminated. In the Web companion, any unescaped `dangerouslySetInnerHTML` usage would be exploitable.

**Recommendation:** Sanitize task content strings server-side using a library like `DOMPurify` (JSDOM-backed) or `sanitize-html` before storage, and ensure all React render paths use standard JSX (not `dangerouslySetInnerHTML`) for user-supplied content.

---

## 3. CORS Configuration

### SEC-8: CORS — Per-Origin Whitelist with Wildcard on No-Origin — MEDIUM

**Severity: MEDIUM (informational)**

CORS is configured with a per-origin allowlist. Testing confirmed:
- Requests from whitelisted origins get `Access-Control-Allow-Origin: <origin>` ✓
- Requests from non-whitelisted origins get CORS rejection ✓
- Requests **without an Origin header** get `Access-Control-Allow-Origin: *`

The no-Origin wildcard is the Express CORS default and is acceptable for server-to-server API calls (which don't send Origin). However, it means non-browser clients can always bypass CORS. Since CORS is a browser-enforced mechanism, this is expected behavior — but it should be documented.

**Risk level:** Low in practice. CORS is not a server-side security boundary; authentication still applies to all routes. No action required unless the intent is to block non-browser API consumers.

---

## 4. HTTP Security Headers

### SEC-9: Helmet Headers — PASS ✓

Helmet is applied globally. Headers confirmed present on responses:
- `X-Frame-Options: SAMEORIGIN` — clickjacking protection
- `X-Content-Type-Options: nosniff` — MIME sniffing protection
- `X-XSS-Protection: 0` — modern browsers handle XSS natively
- `Strict-Transport-Security` — HSTS (relevant for HTTPS deploy)
- `Content-Security-Policy` — present (default Helmet CSP)
- `Referrer-Policy` — present

### SEC-10: Rate Limiting — PASS ✓

`sensitiveLimiter` is applied to `/api/auth` and `/api/billing` route prefixes: 30 requests per 15-minute window. This prevents brute-force credential stuffing on the login endpoint.

---

## 5. Companion WebSocket Security

### SEC-11: Companion Pairing Code TTL — PASS ✓

The CompanionHub pairing code has a 10-minute TTL (`CODE_TTL_MS`). After expiry, new WebSocket connections with the stale code are rejected. A brute-force lockout (`MAX_ATTEMPTS=5`) is also enforced.

### SEC-12: Multiple Concurrent Pairings — PASS ✓ (Expected behavior)

20 concurrent WebSocket connections using the same valid pairing code all succeed (20/20). This is intentional — the code allows multiple companions (e.g. phone + tablet) to pair simultaneously. The code is time-limited rather than single-use.

---

## 6. Non-Existent Endpoints (API Surface Shrinkage)

The following endpoints were probed and confirmed to **not exist** (return 404):

| Endpoint | Expected | Actual | Risk |
|---|---|---|---|
| `GET /api/config` | Config endpoint | 404 | Low — endpoint simply absent |
| `POST /api/sessions/save` | Session save | 404 | Low — performance test was measuring 404 speed |
| `GET /api/billing/plans` | Plan list | 404 | Low — wrong path in test scripts |
| `POST /api/billing/checkout` | Checkout | 404 | Low — correct path is `/api/billing/create-checkout-session` |

The performance test script (`node-load-test.mjs`) was calling `/api/sessions/save` which does not exist, meaning the "DB write performance" scenario was measuring 404 response times (~0.66ms) rather than actual encrypted writes. **The database write performance remains unmeasured.** This is a test infrastructure gap, not a production security issue.

---

## 7. Secrets & Environment Variables

### SEC-13: No Hardcoded Secrets in Production Paths — PASS ✓

The OAuth simulation secrets (`google-oauth-flow-secret`, `apple-oauth-flow-secret`) are:
- Only activated when `OAUTH_SIM_ENABLED=true` AND `NODE_ENV !== 'production'`
- Not present in `.env.example` or any committed configuration file

API keys are never logged. The `KRYLEOS_DB_PATH` and `KRYLEOS_DATA_DIR` env vars allow the test suite to redirect storage away from the user's home directory.

---

## Summary

| ID | Severity | Status | Description |
|---|---|---|---|
| SEC-1 | — | ✓ Pass | PBKDF2-SHA512 password hashing with timing-safe compare |
| SEC-2 | — | ✓ Fixed | No plaintext password fallback |
| SEC-3 | — | ✓ Fixed | OAuth sim requires explicit OAUTH_SIM_ENABLED=true |
| SEC-4 | — | ✓ Pass | 128-bit random token entropy, rotated each login |
| SEC-5 | — | ✓ Pass | Bearer token enforced via header, not body |
| SEC-6 | HIGH | ⚠️ Open | Malformed JSON returns HTTP 500 with stack trace |
| SEC-7 | HIGH | ⚠️ Open | XSS: session task content stored without sanitization |
| SEC-8 | MEDIUM | ℹ️ Info | `Access-Control-Allow-Origin: *` on no-Origin requests |
| SEC-9 | — | ✓ Pass | Helmet headers present and correctly configured |
| SEC-10 | — | ✓ Pass | Rate limiting on auth/billing routes (30 req/15min) |
| SEC-11 | — | ✓ Pass | Companion code has 10-min TTL + brute-force lockout |
| SEC-12 | — | ✓ Pass | Multiple concurrent pairings intentional and correct |
| SEC-13 | — | ✓ Pass | No hardcoded secrets in production code paths |

**Two HIGH findings must be resolved before production deployment: SEC-6 (stack trace disclosure) and SEC-7 (XSS via unsanitized task content).**
