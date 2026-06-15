import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import * as syncController from '../sync';

describe('billing processor entitlement flow', () => {
  const email = `billing_processor_${Date.now()}@test.local`;
  let token: string;
  let subscriptionId: string;

  beforeAll(async () => {
    const user = await syncController.register(email, 'BillingProcessor123!');
    token = user.token;
  });

  afterAll(async () => {
    await syncController.deleteUser(email);
  });

  it('retires direct local tier mutation', async () => {
    const res = await request(app)
      .post('/api/auth/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ tier: 'founder' });

    expect(res.status).toBe(410);
    expect((await syncController.getUserByToken(token))?.tier).toBe('free');
  });

  it('does not grant a tier from the retired one-time payment webhook shape', async () => {
    const res = await request(app)
      .post('/api/billing/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { notes: { email, tier: 'founder' } } } },
      }));

    expect(res.status).toBe(200);
    expect((await syncController.getUserByToken(token))?.tier).toBe('free');
  });

  it('creates a recurring Razorpay subscription instead of a one-time order', async () => {
    const res = await request(app)
      .post('/api/billing/razorpay/create-subscription')
      .set('Authorization', `Bearer ${token}`)
      .send({ tier: 'solo_plus' });

    expect(res.status).toBe(200);
    expect(res.body.subscriptionId).toMatch(/^sub_mock_solo_plus_/);
    expect(res.body.orderId).toBeUndefined();
    subscriptionId = res.body.subscriptionId;

    const user = await syncController.getUserByToken(token);
    expect(user?.tier).toBe('free');
    expect(user?.billingProvider).toBe('razorpay');
    expect(user?.billingSubscriptionId).toBe(subscriptionId);
  });

  it('grants tier only after the verified webhook path reports activation', async () => {
    const res = await request(app)
      .post('/api/billing/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({
        event: 'subscription.activated',
        payload: {
          subscription: {
            entity: {
              id: subscriptionId,
              notes: { email, tier: 'solo_plus' },
            },
          },
        },
      }));

    expect(res.status).toBe(200);
    expect((await syncController.getUserByToken(token))?.tier).toBe('solo_plus');
  });

  it('schedules processor cancellation and demotes only on cancellation webhook', async () => {
    const cancel = await request(app)
      .post('/api/billing/cancel-subscription')
      .set('Authorization', `Bearer ${token}`);

    expect(cancel.status).toBe(200);
    expect(cancel.body).toMatchObject({ provider: 'razorpay', scheduledAtCycleEnd: true });
    expect((await syncController.getUserByToken(token))?.tier).toBe('solo_plus');

    const webhook = await request(app)
      .post('/api/billing/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({
        event: 'subscription.cancelled',
        payload: { subscription: { entity: { id: subscriptionId, notes: { email } } } },
      }));

    expect(webhook.status).toBe(200);
    expect((await syncController.getUserByToken(token))?.tier).toBe('free');
  });
});
