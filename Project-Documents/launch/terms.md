# Terms of Service

Last Updated: June 10, 2026

Welcome to **Kryleos Forge**. These Terms of Service ("Terms") govern your use of the Kryleos Forge desktop application, web application, synchronization API, and associated services (collectively, the "Software"). By installing, launching, or accessing any part of the Software, you agree to be bound by these Terms.

## 1. Software Licensing
Kryleos Forge is licensed, not sold, to you under the following conditions:
* **Solo & Solo Plus Tiers**: Granted for single-user professional development. Redistribution of local sandbox traces or binary execution logs is strictly prohibited.
* **Founder & Agency Tiers**: Granted for commercial scoping, multi-agent product management, and client deliverable generation. You are authorized to export and share branded technical summaries and brochures with third-party clients.

## 2. Sandbox Execution & Safety Limits
Kryleos Forge executes autonomous developer agents within a localized sandbox directory. 
* **User Responsibility**: You acknowledge that agent scripts may modify codebase files, install packages, or run tests. You are solely responsible for verifying changes before staging or committing them to source control.
* **Command Policy Enforcement**: You agree to configure and maintain command safety policies to prevent unsafe system commands. Kryleos Forge is not liable for data loss or service disruption occurring inside the sandbox workspace.

## 3. Subscriptions & Billing
Paid tiers (Solo, Solo Plus, Founder) are available as recurring subscriptions, processed by **Stripe** (most countries) or **Razorpay** (India), and as a one-time **Founder lifetime key**, delivered as a signed license you activate offline.

* **Recurring subscriptions (Stripe / Razorpay)**: Checkout is hosted by Stripe or Razorpay — Kryleos Forge never receives, stores, or transmits your payment card details. Your subscription tier is set on your account only after Stripe/Razorpay confirms payment via a cryptographically signed webhook to our server.
* **Cancellation & Refunds (subscriptions)**: Cancel anytime from the Billing section of the app. Stripe subscriptions are scheduled through Stripe Billing; Razorpay subscriptions are cancelled through the Razorpay Subscriptions API. Cancellation takes effect at the end of the current billing cycle. Refund requests are reviewed under the policy shown at checkout and processed through the original processor.
* **Founder lifetime key**: A one-time purchase delivers a signed license key by email. The desktop app validates this key offline against an embedded public key — no account login or phone-home is required to use the features it unlocks.
* **License Term**: Lifetime keys do not expire unless issued with a fixed expiry date stated at purchase; time-limited keys (e.g. trial or promotional keys) revert your account to the Free tier on expiry.
* **Known limitation**: Because license validation happens offline against a signed key, a key that has been refunded continues to function until its embedded expiry date (if any). Kryleos Forge cannot remotely revoke an already-issued key.

## 4. Disclaimers & Limitation of Liability
KRYLEOS FORGE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
