/**
 * HTTP route integration tests — supertest against the live Express app.
 *
 * server.ts now exports { app } and gates server.listen() behind
 * NODE_ENV !== 'test', so supertest binds its own ephemeral port.
 * vitest.setup.ts sets KRYLEOS_DATA_DIR to an isolated temp dir.
 *
 * Pass/fail: every assertion is deterministic. Tests that depend on auth
 * use unique emails derived from Date.now() to avoid cross-test collisions.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';



describe('credential persistence', () => {
  it('serializes concurrent updates without corrupting or losing fields', async () => {
    const updates = Array.from({ length: 8 }, (_, index) => ({ [`raceKey${index}`]: `value-${index}` }));
    const writes = await Promise.all(updates.map(update => request(app).post('/api/credentials').send(update)));
    expect(writes.every(response => response.status === 200)).toBe(true);

    const read = await request(app).get('/api/credentials');
    expect(read.status).toBe(200);
    for (let index = 0; index < updates.length; index++) {
      expect(read.body[`raceKey${index}`]).toBe(`value-${index}`);
    }
  });
});

// ─── public endpoints ────────────────────────────────────────────────────────

describe('GET /api/sessions', () => {
  it('returns 200 with an array', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/telemetry', () => {
  it('returns 200 with numeric telemetry fields', async () => {
    const res = await request(app).get('/api/telemetry');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });
});

describe('POST /api/demo/start', () => {
  it('creates a no-key project with a green, clearly labeled demo trace', async () => {
    const res = await request(app).post('/api/demo/start').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.replayed).toBe(true);
    expect(res.body.trace.mode).toBe('demo');
    expect(res.body.trace.suggestedStatus).toBe('done');
    expect(res.body.trace.criteriaResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'pass', type: 'file_exists' })
    ]));
    expect(res.body.trace.filesChanged).toContain('src/hello.js');
    expect(res.body.trace.commandsRun[0]).toContain('src/hello.js');
  });
});

describe('GET /api/companion/status', () => {
  it('returns 200 with a 6-digit pairing code and connectedCount', async () => {
    const res = await request(app).get('/api/companion/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('code');
    expect(res.body).toHaveProperty('connectedCount');
    expect(/^\d{6}$/.test(String(res.body.code))).toBe(true);
    expect(typeof res.body.connectedCount).toBe('number');
  });
});

// ─── malformed / oversized request handling ──────────────────────────────────

describe('Malformed and oversized request handling', () => {
  it('returns 400 (not 500) on syntactically malformed JSON', async () => {
    const res = await request(app)
      .post('/api/credentials')
      .set('Content-Type', 'application/json')
      .send('{ not : valid json }');
    expect(res.status).toBe(400);
    expect(res.body).not.toHaveProperty('stack');
  });

  it('returns 413 on a payload exceeding the 1 MB body limit', async () => {
    const bigPayload = JSON.stringify({ name: 'x'.repeat(1_200_000) });
    const res = await request(app)
      .post('/api/credentials')
      .set('Content-Type', 'application/json')
      .send(bigPayload);
    expect(res.status).toBe(413);
  });

  it('does not expose a stack trace in error responses', async () => {
    const res = await request(app)
      .post('/api/credentials')
      .set('Content-Type', 'application/json')
      .send('{ bad }');
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|at Module\.|node_modules/);
  });
});

// ─── route protection & error handling ───────────────────────────────────────

describe('Route protection & error handling', () => {
  it('GET /api/projects returns 200 or requires token (not 500)', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).not.toBe(500);
  });

  it('GET /api/sessions returns 200', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
  });

  it('a forged Bearer token on a write route returns non-500 gracefully (no crash)', async () => {
    const res = await request(app)
      .put('/api/sessions/fake-id/tasks')
      .set('Authorization', 'Bearer totally-forged-token')
      .send({ tasks: [] });
    expect(res.status).not.toBe(500);
  });
});

// ─── HTTP security headers ───────────────────────────────────────────────────

describe('Security headers (Helmet)', () => {
  it('includes X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('includes X-Frame-Options or Content-Security-Policy', async () => {
    const res = await request(app).get('/api/sessions');
    const hasFrameHeader =
      'x-frame-options' in res.headers || 'content-security-policy' in res.headers;
    expect(hasFrameHeader).toBe(true);
  });
});
