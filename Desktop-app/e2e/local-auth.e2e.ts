import { expect, test } from '@playwright/test';
import { WebSocket } from 'ws';

const API = 'http://localhost:3001';

test.describe('local admin authentication', () => {
  test('rejects REST requests without the process session credential', async ({ request }) => {
    const missing = await request.get(`${API}/api/workspace`);
    expect(missing.status()).toBe(401);

    const invalid = await request.get(`${API}/api/workspace`, {
      headers: { 'X-Kryleos-Session': 'invalid-local-session-secret-00000000' },
    });
    expect(invalid.status()).toBe(401);
  });

  test('rejects a trusted-origin WebSocket without the process session credential', async () => {
    const result = await new Promise<{ opened: boolean; status?: number }>((resolve) => {
      const ws = new WebSocket('ws://localhost:3001', { origin: 'http://localhost:5174' });
      ws.once('open', () => resolve({ opened: true }));
      ws.once('unexpected-response', (_request, response) => resolve({ opened: false, status: response.statusCode }));
      ws.once('error', () => resolve({ opened: false }));
    });
    expect(result.opened).toBe(false);
    expect(result.status).toBe(403);
  });
});
