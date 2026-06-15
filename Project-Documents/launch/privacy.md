# Privacy Policy

Last Updated: June 10, 2026

At **Kryleos Forge**, we prioritize developers' codebase privacy and credential security. This Privacy Policy details how we handle, store, and sync information.

## 1. Local-First Architecture
Kryleos Forge is built as a local-first application. 
* **Workspace Signal Scans**: Codebase indexing, syntax trees, test file discovery, and git history analysis occur entirely on your local machine.
* **No Code Egress**: We do not send your source code files to remote servers. All code reads and token estimations are processed locally.

## 2. API Key & Credential Encryption
We secure your AI model provider credentials using the host operating system's native keychain:
* **SafeStorage Layer**: On supported platforms, credentials (such as OpenAI, Gemini, Anthropic, DeepSeek, and GitHub tokens) are encrypted before write using Electron's `safeStorage` API, which leverages Windows DPAPI, macOS Keychain, or Linux Secret Service.
* **AES-256 Fallback**: When native safeStorage is unavailable, credentials are encrypted locally using AES-256-CBC bound to an OS fingerprint.

## 3. Zero-Egress & Privacy Mode
For developers working with sensitive proprietary assets or under strict NDA covenants:
* **Privacy Mode**: When active, cloud synchronization is blocked entirely. 
* **Zero-Egress Mode**: Blocks all external LLM provider requests. All agent task executions, code analyses, and criteria evaluations are routed to local model instances (e.g., via Ollama running on your local machine).

## 4. Billing & License Keys
Recurring subscriptions are processed by **Stripe** or **Razorpay** (India). Kryleos Forge does not collect, store, or transmit your credit card numbers — Stripe/Razorpay handle all payment data under their own privacy policies. Our server stores your email, subscription tier, payment processor, and processor subscription identifier, used to keep your account entitlements and cancellations in sync.
* **Founder lifetime key**: If you purchase a one-time Founder lifetime key instead, Kryleos Forge stores only the signed license key, plan tier, and expiry date (if any) on your device, used to validate your entitlement offline.
* **Billing email**: Your billing email may be shared with Stripe/Razorpay to process payment and is stored on our server only to associate your subscription with your account.
