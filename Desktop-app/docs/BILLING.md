# Billing, Licensing & Edge-Case UX

This document covers the customer-facing behavior for refunds, license
activation, expiry, and offline-key edge cases. It is the reference for
support and for `ConfigHeader.tsx`'s license UI copy.

## Payment processors

- **International (Stripe):** card checkout via Stripe Checkout sessions
  (`/api/billing/create-checkout-session`), entitlement granted on the
  `checkout.session.completed` webhook. Still the documented processor for
  non-India customers.
- **India (Razorpay):** order-based checkout via Razorpay Checkout.js
  (`/api/billing/razorpay/create-order`), entitlement granted on the
  `payment.captured` webhook. Currency/processor is selected automatically
  from the user's locale (`en-IN`/`hi-IN`/`*-in` → Razorpay/INR, else
  Stripe/USD).

## Refunds

- **Stripe customers:** self-serve via the existing customer billing portal
  (`/api/billing/create-portal-session`). No support ticket needed for
  cancellation; refunds for the current period follow Stripe's standard
  proration/refund policy as configured in the Stripe dashboard.
- **Razorpay customers (India):** **beta limitation** — no self-serve refund
  UI yet. Refunds are issued manually via the Razorpay dashboard by support
  staff. Customers should be directed to contact support with their order ID.

## Offline license keys

Licenses are Ed25519-signed offline keys (`<payload>.<signature>`, see
`src/backend/license.ts`), entered in `ConfigHeader.tsx` and verified locally
by `POST /api/license/activate` (auth required — the tier is applied to the
authenticated account only, never an arbitrary email).

### Expired key

If `verifyLicenseKey` returns `expired`:

> "This license expired on {date}. Renew to continue {tier}."

The key-entry field remains visible so the user can paste a renewed key
without leaving the screen.

### Invalid or tampered key

If the key is malformed or fails signature verification (`malformed` /
`bad_signature`):

> "Invalid license key."

This generic message is used for both cases — it does not reveal which check
failed, to avoid leaking signature-verification internals to an attacker
probing the format.

### Device-bound key on the wrong device

If the key has an `hwid` claim that doesn't match the current machine
(`hwid_mismatch`):

> "This license is bound to a different device."

### Clock skew / grace period

A license remains valid through `expiry + 3 days` (`GRACE_DAYS` in
`license.ts`). Within this grace window, activation still succeeds but the UI
should show a non-blocking notice:

> "License renewal needed soon."

This accommodates minor clock skew and gives the user a buffer to obtain a
renewed key before the license is rejected outright.

### Revocation before expiry

**Beta limitation:** there is no revocation list. A signed key remains valid
until its `expiry` (+ grace) regardless of refunds, chargebacks, or account
changes. This matches the documented Phase 4 exit-gate allowance and should be
revisited if a revocation mechanism becomes necessary (e.g. a periodically
fetched revoked-key-id list, while keeping offline activation as the default
path).
