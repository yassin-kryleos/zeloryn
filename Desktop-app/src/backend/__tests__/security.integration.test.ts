/**
 * Security integration tests — rate limiting, auth bypass attempts,
 * XSS sanitisation, and input validation at the HTTP layer.
 *
 * Rate-limit tests run last to avoid polluting earlier tests with a locked
 * IP. Vitest isolation: KRYLEOS_DATA_DIR is a fresh temp dir per run.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server';

// ─── XSS sanitisation ────────────────────────────────────────────────────────

describe('XSS sanitisation on task content', () => {
  it('does not echo raw <script> tags back in session task responses', async () => {
    const sessions = await request(app).get('/api/sessions');
    if (!Array.isArray(sessions.body) || sessions.body.length === 0) return;
    const id = sessions.body[0]?.id;
    if (!id) return;

    const xssPayload = '<script>alert(1)</script>';
    await request(app)
      .put(`/api/sessions/${id}/tasks`)
      .send({ tasks: [{ id: 'xss-1', content: xssPayload, done: false }] });

    const readBack = await request(app).get('/api/sessions');

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
});

// ─── input validation ────────────────────────────────────────────────────────

describe('Input validation', () => {
  it('does not leak internal file paths in error responses', async () => {
    const res = await request(app)
      .post('/api/credentials')
      .set('Content-Type', 'application/json')
      .send('INVALID');
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/[Cc]:\\|\/home\/|node_modules|\.ts:|\.js:/);
  });
});

// ─── rate limiting ───────────────────────────────────────────────────────────
// This block runs last because it exhausts the per-IP request budget.
// The sensitive limiter applies to sensitive endpoints (pairing code) and fires
// after a configurable number of requests per window.

describe('Rate limiting on sensitive endpoints', () => {
  it('eventually returns 429 after repeated pairing code attempts', async () => {
    const responses: number[] = [];
    for (let i = 0; i < 40; i++) {
      const res = await request(app).get('/api/companion/pairing-code');
      responses.push(res.status);
      if (res.status === 429) break;
    }
    expect(responses).toContain(429);
  }, 30_000);
});
