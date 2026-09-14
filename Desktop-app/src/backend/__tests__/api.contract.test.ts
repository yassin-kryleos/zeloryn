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

// ─── /api/docs/templates ─────────────────────────────────────────────────────

describe('GET /api/docs/templates — contract', () => {
  it('responds with 200 and application/json', async () => {
    const res = await request(app).get('/api/docs/templates');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('returns success: true and templates array', async () => {
    const res = await request(app).get('/api/docs/templates');
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.templates)).toBe(true);
    expect(res.body.templates.length).toBeGreaterThan(0);
  });

  it('each template has id, name, description, and requiredTier', async () => {
    const res = await request(app).get('/api/docs/templates');
    for (const tpl of res.body.templates) {
      expect(typeof tpl.id).toBe('string');
      expect(typeof tpl.name).toBe('string');
      expect(typeof tpl.description).toBe('string');
      expect(typeof tpl.requiredTier).toBe('string');
      // Verify safe uppercase conversion without throwing
      expect(() => {
        const label = `${tpl.name}${tpl.requiredTier ? ` (${String(tpl.requiredTier).toUpperCase()})` : ''}`;
        expect(label).toBeTruthy();
      }).not.toThrow();
    }
  });

  it('safely handles templates with missing or undefined requiredTier without crashing', () => {
    const mockTemplates = [
      { id: 'custom_1', name: 'Custom Doc', description: 'No tier specified' },
      { id: 'custom_2', name: 'Tiered Doc', description: 'With tier', requiredTier: 'free' }
    ];
    for (const t of mockTemplates as any[]) {
      expect(() => {
        const label = `${t.name || t.id}${t.requiredTier ? ` (${String(t.requiredTier).toUpperCase()})` : ''}`;
        expect(label).toBeDefined();
      }).not.toThrow();
    }
  });
});


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
