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

## 4. Gumroad Billing & License Keys
Purchases of paid tiers are processed by Gumroad, acting as Merchant of Record. Kryleos Forge does not collect, store, or transmit your credit card numbers — Gumroad handles all payment data under its own privacy policy.
* **Local license storage**: Kryleos Forge stores only your license key, plan tier, and expiry date on your device, used to validate your subscription offline.
* **Billing email**: Your billing email is known only to Gumroad. It is not synced to or stored on any Kryleos Forge server.
