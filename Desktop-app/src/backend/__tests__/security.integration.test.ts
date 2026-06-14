/**
 * Security integration tests — rate limiting, auth bypass attempts,
 * XSS sanitisation, and input validation at the HTTP layer.
 *
 * Rate-limit tests run last to avoid polluting earlier tests with a locked
 * IP. Vitest isolation: KRYLEOS_DATA_DIR is a fresh temp dir per run.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';

// ─── helpers ────────────────────────────────────────────────────────────────

async function registerAndLogin(suffix: string) {
  const email = `sec_int_${suffix}@test.local`;
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'SecTest', email, password: 'SecTest123!' });
  // Server returns { success: true, user: { token, tier, ... } }
  return { email, token: reg.body?.user?.token as string | undefined };
}

// ─── XSS sanitisation ────────────────────────────────────────────────────────

describe('XSS sanitisation on task content', () => {
  let token: string;

  beforeAll(async () => {
    const { token: t } = await registerAndLogin(String(Date.now()));
    token = t ?? '';
  });

  it('does not echo raw <script> tags back in session task responses', async () => {
    const sessions = await request(app).get('/api/sessions');
    if (!Array.isArray(sessions.body) || sessions.body.length === 0) return;
    const id = sessions.body[0]?.id;
    if (!id) return;

    const xssPayload = '<script>alert(1)</script>';
    await request(app)
      .put(`/api/sessions/${id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tasks: [{ id: 'xss-1', content: xssPayload, done: false }] });

    const readBack = await request(app)
      .get('/api/sessions')
      .set('Authorization', `Bearer ${token}`);

    const body = JSON.stringify(readBack.body);
    expect(body).not.toContain('<script>');
    expect(body).not.toContain('alert(1)');
  });
});

// ─── auth bypass attempts ────────────────────────────────────────────────────

describe('Auth bypass attempts', () => {
  it('a forged Bearer token never causes a 500 server error', async () => {
    const res = await request(app)
      .put('/api/sessions/fake-id/tasks')
      .set('Authorization', 'Bearer forged-token-that-does-not-exist')
      .send({ tasks: [] });
    expect(res.status).not.toBe(500);
  });

  it('POST /api/auth/login with a forged token in body does not bypass auth', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', token: 'forged-token', password: '' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('SQL-injection-style email is rejected or sanitised (no 500)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: "' OR '1'='1", password: 'x' });
    expect(res.status).not.toBe(500);
  });
});

// ─── input validation ────────────────────────────────────────────────────────

describe('Input validation', () => {
  it('returns 400 on completely empty POST body to /api/auth/register', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('returns 400 on null bytes in email field (SEC-INPUT-01)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'test\x00@evil.com', password: 'Pass123!' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('does not leak internal file paths in error responses', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('INVALID');
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/[Cc]:\\|\/home\/|node_modules|\.ts:|\.js:/);
  });
});

// ─── rate limiting ───────────────────────────────────────────────────────────
// This block runs last because it exhausts the per-IP request budget.
// The sensitive limiter applies to auth endpoints (login/register) and fires
// after a configurable number of requests per window.

describe('Rate limiting on sensitive auth endpoints', () => {
  it('eventually returns 429 after repeated login attempts', async () => {
    const responses: number[] = [];
    for (let i = 0; i < 40; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: `ratetest_${i}@test.local`, password: 'x' });
      responses.push(res.status);
      if (res.status === 429) break;
    }
    expect(responses).toContain(429);
  }, 30_000);
});
