import Razorpay from 'razorpay';
import type { TierId } from '../pricing.generated';

// Razorpay processor for India (DECISIONS — Phase 4 re-scope: Stripe remains
// the international processor, Razorpay covers Indian customers). Mirrors
// Stripe's mock-key dev fallback + production gate in server.ts:38-45.

export const razorpayKeyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_key';
export const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret';

if (process.env.NODE_ENV === 'production' && razorpayKeyId === 'rzp_test_mock_key') {
  throw new Error('FATAL: Production environment must not use a Razorpay mock key. Set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET.');
}

export const isMockRazorpay = razorpayKeyId === 'rzp_test_mock_key' || razorpayKeySecret === 'mock_secret';

const razorpay = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret,
});

type RecurringTier = Exclude<TierId, 'free' | 'agency'>;

const planIds: Record<RecurringTier, string | undefined> = {
  solo: process.env.RAZORPAY_PLAN_SOLO,
  solo_plus: process.env.RAZORPAY_PLAN_SOLO_PLUS,
  founder: process.env.RAZORPAY_PLAN_FOUNDER,
};

export interface CreateSubscriptionParams {
  tier: RecurringTier;
  email: string;
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  keyId: string;
}

export async function createSubscription({ tier, email }: CreateSubscriptionParams): Promise<CreateSubscriptionResult> {
  if (isMockRazorpay) {
    return {
      subscriptionId: `sub_mock_${tier}_${Date.now()}`,
      keyId: razorpayKeyId,
    };
  }

  const planId = planIds[tier];
  if (!planId) {
    throw new Error(`Missing Razorpay plan id for tier '${tier}'.`);
  }

  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    total_count: 1200,
    customer_notify: true,
    notes: { email, tier },
  });

  return {
    subscriptionId: subscription.id,
    keyId: razorpayKeyId,
  };
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  if (isMockRazorpay) return;
  await razorpay.subscriptions.cancel(subscriptionId, true);
}
