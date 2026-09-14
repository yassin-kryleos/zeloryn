# Billing, Licensing & Monetization (Sunsetted)

> **Status: Retired / Fully Open-Source (Apache-2.0)**  
> As of September 2026, Zeloryn has eliminated all commercial payment gates, license keys, and paywalled tiers. The entire application is 100% free, local-first, and open-source under the Apache 2.0 license.

## Historical Context

Early pre-release designs contemplated payment processing (via Stripe and Razorpay) and Ed25519-signed offline license keys for enterprise tiers.

During the open-source transition:
1. All payment processing routes (`/api/billing/*`), webhook handlers, and licensing gating (`/api/license/*`) were retired and removed.
2. All `[ENTERPRISE]` and `[PRO / ENTERPRISE]` badges and false locks were permanently deleted from the UI (`ConfigHeader.tsx`).
3. Every feature across PLAN, CREW, FLOW, FORGE, and VIBE is unconditionally accessible to all users using their own BYOK (Bring Your Own Key) credentials or local Ollama inference.
