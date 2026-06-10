# End-to-End Billing & Webhook Test Results

This document contains results of manual and automated end-to-end tests validating key billing pathways.

---

## 1. Stripe Checkout Redirection
- **Endpoint**: `/api/billing/create-checkout-session`
- **Setup**: Triggered using dummy user authentication tokens (`token_w2kpq9obqs8_1781084120589`).
- **Result**: Successfully intercept live integrations and return the sandboxed client redirect URL:
  `http://localhost:5173/?mock_checkout=true&email=dummy%40test.com&tier=founder`
- **Status**: **PASSED**

---

## 2. Billing Portal Interception
- **Endpoint**: `/api/billing/create-portal-session`
- **Result**: Correctly returns mock customer portal dashboard URL:
  `http://localhost:5173/?mock_portal=true&email=dummy%40test.com`
- **Status**: **PASSED**

---

## 3. simulated Stripe Webhook Processing
- **Endpoint**: `/api/billing/webhook`
- **Payload**:
  ```json
  {
    "type": "checkout.session.completed",
    "data": {
      "object": {
        "customer_email": "dummy@test.com",
        "metadata": {
          "email": "dummy@test.com",
          "tier": "solo_plus"
        }
      }
    }
  }
  ```
- **Result**: Bypasses signature checking when the secret key is unset, correctly parses raw request stream, updates the user's tier to `solo_plus` inside the isolated database files, and logs out `Subscribed dummy@test.com to solo_plus`.
- **Status**: **PASSED**

---

## 4. Companion WebSocket pairing Simulation
- **Script**: [run-e2e-checks.mjs](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/qa/scripts/run-e2e-checks.mjs)
- **Setup**: Spawn server subprocess on port 3001, retrieve pairing code, initiate raw WS handshake connection to `/api/companion/ws`.
- **Result**: Successfully parses pairing code, establishes connection, completes handshake, and receives verification `connection_status` event `status === 'paired'`.
- **Log Output**:
  ```
  --- STARTING COMPANION E2E PAIRING CHECK ---
  Server is online and listening. Fetching pairing code...
  Retrieved pairing code: 641706
  WebSocket handshake initiated...
  Companion paired and connected. Total active: 1
  Received from server: {
    type: 'connection_status',
    status: 'paired',
    workspaceRoot: '...',
    sessionId: 'global_session'
  }
  --- E2E WebSocket Pairing Validation PASSED ---
  ```
- **Status**: **PASSED**
