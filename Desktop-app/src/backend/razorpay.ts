import Razorpay from 'razorpay';

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

export interface CreateOrderParams {
  amountPaise: number;
  tier: string;
  email: string;
}

export interface CreateOrderResult {
  orderId: string;
  amount: number;
  currency: 'INR';
  keyId: string;
}

export async function createOrder({ amountPaise, tier, email }: CreateOrderParams): Promise<CreateOrderResult> {
  if (isMockRazorpay) {
    return {
      orderId: `order_mock_${Date.now()}`,
      amount: amountPaise,
      currency: 'INR',
      keyId: razorpayKeyId,
    };
  }

  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: 'INR',
    notes: { email, tier },
  });

  return {
    orderId: order.id,
    amount: amountPaise,
    currency: 'INR',
    keyId: razorpayKeyId,
  };
}
