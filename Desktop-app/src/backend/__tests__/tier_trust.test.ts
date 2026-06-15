/**
 * Tier-trust regression gate (Phase 4.6, hardened post council re-audit
 * 2026-06-14 finding #2).
 *
 * Two halves:
 *  1. Static scan of server.ts — any req.body.tier / req.query.tier /
 *     req.body['tier'] / req.body["tier"] / `const { tier } = req.body|query`
 *     reference must live inside an allowlisted route. New matches outside
 *     the allowlist fail the build. The destructuring form is included
 *     because `const { tier } = req.body` previously evaded this gate
 *     entirely (it doesn't match `req.body.tier`).
 *  2. Behavioral: /api/auth/subscribe and /api/license/activate cannot be
 *     used to self-grant or cross-grant a paid tier, and a forged `tier` in
 *     the request body/query no longer escalates entitlement-gated routes.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signLicensePayload } from '../license';
import * as syncController from '../sync';

// ─── 1. Static grep gate ────────────────────────────────────────────────────

describe('tier-trust: server.ts req.body.tier / req.query.tier usage is allowlisted', () => {
  // Routes allowed to read a client-supplied `tier`:
  //  - /api/billing/create-checkout-session and
  //    /api/billing/razorpay/create-subscription:
  //    `tier` selects the product being purchased (amount computed server-side
  //    from TIER_PRICES); entitlement is granted only via the verified
  //    payment-provider webhook, never from this value.
  const ALLOWLIST = [
    '/api/billing/create-checkout-session',
    '/api/billing/razorpay/create-subscription',
  ];

  const serverSrc = fs.readFileSync(path.join(__dirname, '../server.ts'), 'utf-8');
  const lines = serverSrc.split('\n');
  const tierRefPattern = new RegExp(
    // req.body.tier / req.query.tier / req.body['tier'] / req.body["tier"]
    String.raw`req\.(body|query)(\.tier\b|\[(['"])tier\3\])` +
    '|' +
    // const { tier, ... } = req.body  /  const { ..., tier } = req.query
    String.raw`\{[^}]*\btier\b[^}]*\}\s*=\s*req\.(body|query)\b`
  );
  const routePattern = /app\.(get|post|put|delete|patch)\(\s*(['"])([^'"]+)\2/;

  it('finds at least one tier reference (gate is not vacuous)', () => {
    const count = lines.filter(l => tierRefPattern.test(l)).length;
    expect(count).toBeGreaterThan(0);
  });

  it('every req.body.tier / req.query.tier reference sits inside an allowlisted route', () => {
    for (let i = 0; i < lines.length; i++) {
      if (!tierRefPattern.test(lines[i])) continue;

      let route: string | null = null;
      for (let j = i; j >= 0; j--) {
        const m = lines[j].match(routePattern);
        if (m) { route = m[3]; break; }
      }

      const where = `server.ts:${i + 1}: ${lines[i].trim()}`;
      expect(route, `${where} — no enclosing app.<method>(...) route found`).not.toBeNull();
      expect(ALLOWLIST, `${where} — route '${route}' is not in the tier-trust allowlist`).toContain(route);
    }
  });
});

// ─── 2. Behavioral: escalation paths ────────────────────────────────────────

describe('tier-trust: /api/auth/subscribe and /api/license/activate cannot escalate tier', () => {
  const suffix = Date.now();
  const email = `tier_trust_${suffix}@test.local`;
  let token: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'TierTrustUser', email, password: 'TierTrust123!' });
    token = res.body.user.token;
  });

  it('POST /api/auth/subscribe with tier:"agency" is rejected and tier stays free', async () => {
    const res = await request(app)
      .post('/api/auth/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ tier: 'agency' });

    expect(res.status).toBe(410);

    const user = await syncController.getUserByToken(token);
    expect(user?.tier).toBe('free');
  });

  it('POST /api/license/activate without a bearer token is unauthorized', async () => {
    const res = await request(app)
      .post('/api/license/activate')
      .send({ licenseKey: 'whatever' });

    expect(res.status).toBe(401);
  });

  it('POST /api/license/activate with a malformed key is rejected and tier stays free', async () => {
    const res = await request(app)
      .post('/api/license/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ licenseKey: 'not-a-real-license-key' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid license key.');

    const user = await syncController.getUserByToken(token);
    expect(user?.tier).toBe('free');
  });

  // The remaining cases need a key that is validly *signed* — i.e. it must
  // verify against the same public key the route checks. The production
  // private key is intentionally absent from this repo, so these tests use a
  // throwaway Ed25519 keypair and license.ts's NODE_ENV=test-only public-key
  // override (see license.ts getProductionPublicKey).
  describe('with a validly-signed test license', () => {
    let restoreEnv: string | undefined;
    let privateKey: crypto.KeyObject;

    beforeAll(() => {
      restoreEnv = process.env.LICENSE_TEST_PUBLIC_KEY_DER_B64;
      const { publicKey, privateKey: priv } = crypto.generateKeyPairSync('ed25519');
      privateKey = priv;
      process.env.LICENSE_TEST_PUBLIC_KEY_DER_B64 = publicKey
        .export({ type: 'spki', format: 'der' })
        .toString('base64');
    });

    afterAll(() => {
      if (restoreEnv === undefined) {
        delete process.env.LICENSE_TEST_PUBLIC_KEY_DER_B64;
      } else {
        process.env.LICENSE_TEST_PUBLIC_KEY_DER_B64 = restoreEnv;
      }
    });

    it('a validly-signed but expired key is rejected and tier stays free', async () => {
      const key = signLicensePayload({ tier: 'founder', expiry: '2020-01-01' }, privateKey);

      const res = await request(app)
        .post('/api/license/activate')
        .set('Authorization', `Bearer ${token}`)
        .send({ licenseKey: key });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('This license expired on 2020-01-01.');

      const user = await syncController.getUserByToken(token);
      expect(user?.tier).toBe('free');
    });

    it('a validly-signed, unexpired key activates the licensed tier', async () => {
      const key = signLicensePayload({ tier: 'founder', expiry: '2099-01-01' }, privateKey);

      const res = await request(app)
        .post('/api/license/activate')
        .set('Authorization', `Bearer ${token}`)
        .send({ licenseKey: key });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.tier).toBe('founder');

      const user = await syncController.getUserByToken(token);
      expect(user?.tier).toBe('founder');
    });
  });
});

// ─── 3. Forged tier no longer escalates entitlement-gated routes ───────────
//
// Council re-audit (2026-06-14 23:36) finding #2: `server.ts:2539-2542`
// destructured `const { tier, items } = req.body` and rejected only
// `tier:'free'`, so `POST /api/crew/sync {tier:'founder'}` returned 200
// unauthenticated. Same shape existed for /api/plan/whats-left,
// /api/cost/history, /api/docs/generate, and the founder/agency workflow
// routes. The HTTP routes below now resolve the caller from its bearer token
// and read the persisted server-side tier. Guest reads stay on Free; direct
// PLAN->CREW sync requires authentication.
describe('tier-trust: forged tier in request body/query no longer escalates', () => {
  const email = `tier_routes_${Date.now()}@test.local`;
  let token: string;

  beforeAll(async () => {
    const user = await syncController.register(email, 'TierRoutes123!');
    token = user.token;
  });

  afterAll(async () => {
    await syncController.deleteUser(email);
  });

  it('POST /api/crew/sync requires a bearer token', async () => {
    const res = await request(app)
      .post('/api/crew/sync')
      .send({ tier: 'founder', items: [] });

    expect(res.status).toBe(401);
  });

  it('POST /api/crew/sync rejects forged founder tier for authenticated Free user', async () => {
    const res = await request(app)
      .post('/api/crew/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ tier: 'founder', items: [] });

    expect(res.status).toBe(403);
  });

  it('GET /api/plan/whats-left ignores a forged ?tier=founder and reports the real (free) tier', async () => {
    const res = await request(app)
      .get('/api/plan/whats-left?tier=founder')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.tier).toBe('free');
    expect(res.body.exportAllowed).toBe(false);
  });

  it('GET /api/cost/history ignores a forged ?tier=agency and stays restricted', async () => {
    const res = await request(app)
      .get('/api/cost/history?tier=agency')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.restricted).toBe(true);
    expect(res.body.history).toEqual([]);
  });

  it('POST /api/docs/generate ignores a forged tier:"founder" for a founder-gated template', async () => {
    const res = await request(app)
      .post('/api/docs/generate')
      .send({ templateId: 'prd', tier: 'founder' });

    expect(res.status).toBe(403);
  });

  it('POST /api/workflows/founder/generate ignores a forged tier:"founder"', async () => {
    const res = await request(app)
      .post('/api/workflows/founder/generate')
      .send({ workflowId: 'founder_summary', tier: 'founder' });

    expect(res.status).toBe(403);
  });

  it('POST /api/workflows/agency/export ignores a forged tier:"agency"', async () => {
    const res = await request(app)
      .post('/api/workflows/agency/export')
      .send({ workflowId: 'client_handoff', tier: 'agency' });

    expect(res.status).toBe(403);
  });
});
