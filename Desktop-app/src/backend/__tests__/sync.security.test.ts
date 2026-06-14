/**
 * Auth hardening audit (SEC-M1).
 *
 * Verifies that login() fails closed for legacy/plaintext stored credentials
 * (the plaintext-equality fallback was removed) and that the OAuth simulation
 * literal is disabled in production. Uses the real exported sync API against the
 * temp KRYLEOS_DATA_DIR set in vitest.setup.ts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as sync from '../sync';

const EMAIL = 'legacy-user@example.com';

afterEach(async () => {
  await sync.deleteUser(EMAIL);
  delete process.env.NODE_ENV_OVERRIDE;
  delete process.env.OAUTH_SIM_ENABLED;
});

describe('SEC-M1 — no plaintext password fallback', () => {
  it('refuses login for a legacy account stored as plaintext (fails closed)', async () => {
    // Seed a user whose passwordHash is a bare plaintext string (no PBKDF2 ":").
    const users = await sync.readUsers();
    users[EMAIL] = {
      email: EMAIL,
      passwordHash: 'plaintextpassword',
      isPremium: false,
      tier: 'free',
      token: 'seed',
    } as any;
    await sync.writeUsers(users);

    // The old code returned true on storedHash === password. It must now reject.
    await expect(sync.login(EMAIL, 'plaintextpassword')).rejects.toThrow('Invalid credentials');
  });

  it('accepts a properly registered (PBKDF2) account', async () => {
    await sync.register(EMAIL, 'correct horse battery staple');
    const u = await sync.login(EMAIL, 'correct horse battery staple');
    expect(u.email).toBe(EMAIL);
    expect(u.passwordHash).toContain(':'); // stored as salted PBKDF2
  });

  it('rejects a wrong password for a registered account', async () => {
    await sync.register(EMAIL, 'right-password');
    await expect(sync.login(EMAIL, 'wrong-password')).rejects.toThrow('Invalid credentials');
  });
});

describe('SEC-M1 — OAuth simulation is non-production only', () => {
  it('treats the OAuth literal as a secret when both NODE_ENV!=production AND OAUTH_SIM_ENABLED=true', () => {
    // Both guards must be satisfied.
    process.env.OAUTH_SIM_ENABLED = 'true';
    expect(sync.isOauthSimSecret('google-oauth-flow-secret')).toBe(true);
    expect(sync.isOauthSimSecret('apple-oauth-flow-secret')).toBe(true);
    expect(sync.isOauthSimSecret('not-a-secret')).toBe(false);
  });

  it('disables OAuth sim when OAUTH_SIM_ENABLED flag is absent (even in non-production)', () => {
    // NODE_ENV=test but no explicit opt-in flag → sim must be disabled.
    delete process.env.OAUTH_SIM_ENABLED;
    expect(sync.isOauthSimSecret('google-oauth-flow-secret')).toBe(false);
    expect(sync.isOauthSimSecret('apple-oauth-flow-secret')).toBe(false);
  });
});
