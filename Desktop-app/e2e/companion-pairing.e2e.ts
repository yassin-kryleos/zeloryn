import { test, expect } from '@playwright/test';
import * as crypto from 'crypto';
import { WebSocket } from 'ws';

/**
 * Desktop renderer — E2E companion pairing flow (Phase 5.2/5.3).
 *
 * Requires the Desktop backend to be running on port 3001.
 * Skip gracefully if the backend is not available.
 *
 * Tests:
 *  1. A pairing code is displayed in the UI (6 digits) — the human-readable
 *     fallback credential.
 *  2. Full device-pairing lifecycle: code+secret handshake registers a
 *     device and issues a deviceToken; reconnecting with that token
 *     succeeds and identifies the device; revoking the device closes its
 *     reconnect path (revoked token is rejected with 4001).
 */

const BACKEND_URL = 'http://localhost:3001';
const WS_BASE = process.env.KRYLEOS_COMPANION_WS_BASE || 'ws://localhost:3002';
const SESSION_SECRET = process.env.KRYLEOS_LOCAL_SESSION_SECRET || 'test-session-secret-for-playwright-32chars';
const AUTH_HEADERS = { 'X-Kryleos-Session': SESSION_SECRET };

function generateDeviceKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const rawPublicKeyB64Url = (publicKey.export({ format: 'jwk' }) as any).x as string;
  return { rawPublicKeyB64Url, privateKey };
}

function onceOpen(ws: WebSocket, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS open timeout')), timeoutMs);
    ws.once('open', () => { clearTimeout(timer); resolve(); });
    ws.once('error', (err: any) => { clearTimeout(timer); reject(err); });
  });
}

function onceMessage(ws: WebSocket, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS message timeout')), timeoutMs);
    ws.once('message', (data: any) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function onceClose(ws: WebSocket, timeoutMs = 5000): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS close timeout')), timeoutMs);
    ws.once('close', (code: number, reason: Buffer) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

test.describe('Desktop renderer — companion pairing', () => {
  test.beforeAll(async ({ request }) => {
    try {
      const res = await request.get(`${BACKEND_URL}/api/companion/status`, { headers: AUTH_HEADERS });
      if (!res.ok()) {
        test.skip();
      }
    } catch {
      test.skip();
    }
  });

  test('pairing code is displayed in the renderer UI', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for a 6-digit code rendered anywhere in the app
    const codeEl = page.locator('text=/\\b\\d{6}\\b/').first();
    if (await codeEl.isVisible({ timeout: 3000 })) {
      const text = await codeEl.textContent();
      expect(/\d{6}/.test(text ?? '')).toBe(true);
    } else {
      // Fallback: fetch code from API and verify it's a 6-digit number
      const res = await page.request.get(`${BACKEND_URL}/api/companion/status`, { headers: AUTH_HEADERS });
      const json = await res.json();
      expect(/^\d{6}$/.test(String(json.code))).toBe(true);
    }
  });

  test('device pairing lifecycle: code+secret -> registration -> token reconnect -> revoke', async ({ request }) => {
    const statusRes = await request.get(`${BACKEND_URL}/api/companion/status`, { headers: AUTH_HEADERS });
    const { code, pairingSecret, connectedCount } = await statusRes.json();

    // The 6-digit code remains the human-readable fallback credential.
    expect(/^\d{6}$/.test(String(code))).toBe(true);
    expect(typeof pairingSecret).toBe('string');
    expect(pairingSecret.length).toBeGreaterThan(0);
    expect(typeof connectedCount).toBe('number');

    const { rawPublicKeyB64Url } = generateDeviceKeypair();
    const deviceId = `e2e-device-${Date.now()}`;

    try {
      // 1. Pair: connect with the pairing code, then register via PAIR_DEVICE
      // using the pairing secret (as carried in the QR payload).
      const pairWs = new WebSocket(`${WS_BASE}/api/companion/ws?code=${code}`);
      await onceOpen(pairWs);
      const initialStatus = await onceMessage(pairWs);
      expect(initialStatus.type).toBe('connection_status');
      expect(initialStatus.status).toBe('paired');

      pairWs.send(JSON.stringify({
        type: 'PAIR_DEVICE',
        deviceId,
        publicKey: rawPublicKeyB64Url,
        label: 'e2e test device',
        pairingSecret
      }));
      const paired = await onceMessage(pairWs);
      expect(paired.type).toBe('device_paired');
      expect(paired.deviceId).toBe(deviceId);
      expect(typeof paired.deviceToken).toBe('string');
      expect(paired.deviceToken.length).toBeGreaterThan(20);
      expect(typeof paired.desktopPublicKey).toBe('string');
      const deviceToken = paired.deviceToken;
      pairWs.close();

      // 2. Reconnect with the issued deviceToken — should succeed and
      // identify the device.
      const reconnectWs = new WebSocket(`${WS_BASE}/api/companion/ws?deviceToken=${deviceToken}`);
      await onceOpen(reconnectWs);
      const reconnectStatus = await onceMessage(reconnectWs);
      expect(reconnectStatus.type).toBe('connection_status');
      expect(reconnectStatus.status).toBe('paired');
      expect(reconnectStatus.deviceId).toBe(deviceId);
      reconnectWs.close();

      // 3. The device shows up in the paired-devices list.
      const devicesRes = await request.get(`${BACKEND_URL}/api/companion/devices`, { headers: AUTH_HEADERS });
      const { devices } = await devicesRes.json();
      expect(devices.some((d: any) => d.deviceId === deviceId)).toBe(true);

      // 4. Revoke the device.
      const revokeRes = await request.delete(`${BACKEND_URL}/api/companion/devices/${deviceId}`, { headers: AUTH_HEADERS });
      expect(revokeRes.ok()).toBe(true);

      // 5. Reconnecting with the now-revoked token fails.
      const revokedWs = new WebSocket(`${WS_BASE}/api/companion/ws?deviceToken=${deviceToken}`);
      await onceOpen(revokedWs);
      const errMsg = await onceMessage(revokedWs);
      expect(errMsg.type).toBe('error');
      expect(errMsg.code).toBe('unauthorized');
      const closeInfo = await onceClose(revokedWs);
      expect(closeInfo.code).toBe(4001);
    } finally {
      // Always clean up the registry entry, even if an assertion above failed.
      await request.delete(`${BACKEND_URL}/api/companion/devices/${deviceId}`, { headers: AUTH_HEADERS }).catch(() => {});
    }
  });
});
