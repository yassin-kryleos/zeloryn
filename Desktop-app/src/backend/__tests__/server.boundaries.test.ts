import request from 'supertest';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import {
  companionServer,
  isTrustedLocalWebSocketRequest,
  isAuthenticatedLocalWebSocketRequest,
  isValidCompanionAuthToken,
} from '../server';
import { SlidingWindowLimiter } from '../slidingWindowLimiter';

describe('network boundary separation', () => {
  it('does not expose administrative REST routes on the companion server', async () => {
    const response = await request(companionServer).get('/api/files');
    expect(response.status).toBe(404);
  });

  it('rejects hostile browser origins while allowing trusted renderer origins', () => {
    const requestLike = (origin: string | undefined, remoteAddress = '127.0.0.1') => ({
      headers: origin ? { origin } : {},
      socket: { remoteAddress },
    }) as any;

    expect(isTrustedLocalWebSocketRequest(requestLike('https://attacker.example'))).toBe(false);
    expect(isTrustedLocalWebSocketRequest(requestLike('http://localhost:5173'))).toBe(true);
    expect(isTrustedLocalWebSocketRequest(requestLike(undefined))).toBe(true);
    expect(isTrustedLocalWebSocketRequest(requestLike(undefined, '192.168.1.50'))).toBe(false);
  });

  // ── Guard 4: blocked-origin CORS ──────────────────────────────────────
  it('rejects connections from untrusted browser origins (blocked CORS)', () => {
    const requestLike = (origin: string) => ({
      headers: { origin },
      socket: { remoteAddress: '127.0.0.1' },
    }) as any;

    expect(isTrustedLocalWebSocketRequest(requestLike('https://evil.com'))).toBe(false);
    expect(isTrustedLocalWebSocketRequest(requestLike('https://malicious-site.org'))).toBe(false);
    expect(isTrustedLocalWebSocketRequest(requestLike('http://localhost:9999'))).toBe(false);
    expect(isTrustedLocalWebSocketRequest(requestLike('http://127.0.0.1:8080'))).toBe(false);
  });

  // ── Guard 5: companion WS 429 rate-limit (via SlidingWindowLimiter) ───
  it('rate-limits companion WS upgrade attempts per IP', () => {
    const limiter = new SlidingWindowLimiter(3, 60_000);
    const ip = '10.0.0.55';

    expect(limiter.consume(ip)).toBe(true);  // 1st
    expect(limiter.consume(ip)).toBe(true);  // 2nd
    expect(limiter.consume(ip)).toBe(true);  // 3rd
    expect(limiter.consume(ip)).toBe(false); // 4th — rate limited

    // Different IP unaffected
    expect(limiter.consume('10.0.0.56')).toBe(true);

    // After clearing, same IP works again
    limiter.clear(ip);
    expect(limiter.consume(ip)).toBe(true);
  });

  // ── Guard 6: main WS upgrade auth (test-mode relaxed) ─────────────────
  it('rejects main WS upgrade from non-loopback address', () => {
    const req = {
      headers: {},
      socket: { remoteAddress: '10.0.0.99' },
      url: '/?session=some-secret',
    } as any;

    expect(isAuthenticatedLocalWebSocketRequest(req)).toBe(false);
  });

  it('accepts main WS upgrade from loopback when LOCAL_AUTH_REQUIRED is false (test default)', () => {
    // NODE_ENV=test → LOCAL_AUTH_REQUIRED=false → any loopback passes
    const req = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      url: '/',
    } as any;

    expect(isAuthenticatedLocalWebSocketRequest(req)).toBe(true);
  });

  it('accepts main WS upgrade from loopback with valid session secret', () => {
    const secret = process.env.KRYLEOS_LOCAL_SESSION_SECRET || 'test-session-secret-thirty-two-chars!!';
    const req = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      url: `/?session=${encodeURIComponent(secret)}`,
    } as any;

    expect(isAuthenticatedLocalWebSocketRequest(req)).toBe(true);
  });

  // ── Companion auth token — relaxed (test default, COMPANION_AUTH_TOKEN='') ──
  it('accepts companion WS upgrade when COMPANION_AUTH_TOKEN is unset (test default)', () => {
    // Empty token → optional → every candidate passes
    expect(isValidCompanionAuthToken('anything')).toBe(true);
    expect(isValidCompanionAuthToken(undefined)).toBe(true);
    expect(isValidCompanionAuthToken('')).toBe(true);
    expect(isValidCompanionAuthToken(null)).toBe(true);
  });
});

// ── Enforced-auth sub-suite: re-imports server.ts with KRYLEOS_ENFORCE_LOCAL_AUTH
//    and KRYLEOS_COMPANION_AUTH_TOKEN set so module-scoped constants are non-empty.
describe('network boundary separation with ENFORCED auth', () => {
  let strictIsAuthenticated: typeof isAuthenticatedLocalWebSocketRequest;
  let strictIsValidAuthToken: typeof isValidCompanionAuthToken;

  beforeAll(async () => {
    process.env.KRYLEOS_ENFORCE_LOCAL_AUTH = 'true';
    process.env.KRYLEOS_COMPANION_AUTH_TOKEN = 'test-companion-auth-token-32chars!!';
    if (!process.env.KRYLEOS_LOCAL_SESSION_SECRET) {
      process.env.KRYLEOS_LOCAL_SESSION_SECRET = 'test-session-secret-thirty-two-chars!!';
    }
    vi.resetModules();
    const mod = await import('../server');
    strictIsAuthenticated = mod.isAuthenticatedLocalWebSocketRequest;
    strictIsValidAuthToken = mod.isValidCompanionAuthToken;
  });

  afterAll(() => {
    delete process.env.KRYLEOS_ENFORCE_LOCAL_AUTH;
    delete process.env.KRYLEOS_COMPANION_AUTH_TOKEN;
    vi.resetModules();
  });

  it('rejects main WS upgrade without valid session secret', () => {
    const req = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      url: '/',
    } as any;
    expect(strictIsAuthenticated(req)).toBe(false);
  });

  it('rejects main WS upgrade from loopback with missing session param', () => {
    const req = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      url: '/',
    } as any;
    expect(strictIsAuthenticated(req)).toBe(false);
  });

  it('rejects companion WS upgrade with invalid auth token types', () => {
    expect(strictIsValidAuthToken(undefined)).toBe(false);
    expect(strictIsValidAuthToken('')).toBe(false);
    expect(strictIsValidAuthToken(null)).toBe(false);
    expect(strictIsValidAuthToken(42)).toBe(false);
  });

  it('accepts companion WS upgrade with matching auth token', () => {
    expect(strictIsValidAuthToken('test-companion-auth-token-32chars!!')).toBe(true);
  });
});
