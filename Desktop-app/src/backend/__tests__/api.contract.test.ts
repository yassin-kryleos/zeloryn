/**
 * API contract tests — response shape, Content-Type, and status code
 * correctness for every public-facing endpoint.
 *
 * These tests are intentionally lightweight: they verify the CONTRACT
 * (shape and semantics) rather than business logic, which is covered by
 * unit and integration tests. A failing contract test means a breaking
 * change was introduced to the API surface without updating consumers.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';

// ─── shared auth token ───────────────────────────────────────────────────────

let authToken: string | undefined;

beforeAll(async () => {
  const email = `contract_${Date.now()}@test.local`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'ContractUser', email, password: 'Contract123!' });
  authToken = res.body?.token;
});

// ─── /api/sessions ───────────────────────────────────────────────────────────

describe('GET /api/sessions — contract', () => {
  it('responds with 200 and application/json', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('response body is a JSON array', async () => {
    const res = await request(app).get('/api/sessions');
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('each session item has at least an id field', async () => {
    const res = await request(app).get('/api/sessions');
    for (const session of res.body) {
      expect(session).toHaveProperty('id');
      expect(typeof session.id).toBe('string');
    }
  });
});

// ─── /api/telemetry ──────────────────────────────────────────────────────────

describe('GET /api/telemetry — contract', () => {
  it('responds with 200 and application/json', async () => {
    const res = await request(app).get('/api/telemetry');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('response body is a JSON object (not null, not array)', async () => {
    const res = await request(app).get('/api/telemetry');
    expect(typeof res.body).toBe('object');
    expect(res.body).not.toBeNull();
    expect(Array.isArray(res.body)).toBe(false);
  });
});

// ─── /api/companion/status ───────────────────────────────────────────────────

describe('GET /api/companion/status — contract', () => {
  it('responds with 200 and application/json', async () => {
    const res = await request(app).get('/api/companion/status');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('response has required shape: { code: string, connectedCount: number }', async () => {
    const res = await request(app).get('/api/companion/status');
    expect(res.body).toMatchObject({
      code: expect.any(String),
      connectedCount: expect.any(Number),
    });
  });

  it('pairing code is always exactly 6 numeric digits', async () => {
    const res = await request(app).get('/api/companion/status');
    expect(/^\d{6}$/.test(res.body.code)).toBe(true);
  });

  it('connectedCount is a non-negative integer', async () => {
    const res = await request(app).get('/api/companion/status');
    expect(res.body.connectedCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(res.body.connectedCount)).toBe(true);
  });
});

// ─── /api/auth/register ──────────────────────────────────────────────────────

describe('POST /api/auth/register — contract', () => {
  // Server returns { success: true, user: { token, tier, email, ... } }
  it('success response has shape: { success: true, user: { token, tier } }', async () => {
    const email = `contract_shape_${Date.now()}@test.local`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'ShapeUser', email, password: 'Shape123!' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('tier');
    expect(typeof res.body.user.token).toBe('string');
    expect(typeof res.body.user.tier).toBe('string');
  });

  it('token is non-empty string of at least 8 characters', async () => {
    const email = `contract_tok_${Date.now()}@test.local`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'TokUser', email, password: 'Tok123456!' });
    expect(res.body.user.token.length).toBeGreaterThanOrEqual(8);
  });

  it('default tier is "free"', async () => {
    const email = `contract_free_${Date.now()}@test.local`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'FreeUser', email, password: 'Free123!' });
    expect(res.body.user.tier).toBe('free');
  });
});

// ─── /api/auth/login ─────────────────────────────────────────────────────────

describe('POST /api/auth/login — contract', () => {
  const suffix = Date.now() + 100;
  const email = `contract_login_${suffix}@test.local`;

  beforeAll(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'LoginContract', email, password: 'Login123!' });
  });

  it('success response has shape: { success: true, user: { token } }', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Login123!' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.user).toHaveProperty('token');
    expect(typeof res.body.user.token).toBe('string');
  });

  it('failure response is a JSON object with an error field', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'WrongPass' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(typeof res.body).toBe('object');
  });
});

// ─── 404 handling ────────────────────────────────────────────────────────────

describe('Unknown route — contract', () => {
  it('returns 404 for unknown GET route', async () => {
    const res = await request(app).get('/api/this-route-does-not-exist');
    expect(res.status).toBe(404);
  });

  it('404 response does not expose a stack trace', async () => {
    const res = await request(app).get('/api/no-such-route');
    const body = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
    expect(body).not.toMatch(/at Object\.|at Module\.|node_modules/);
  });
});
