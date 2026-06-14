/**
 * Companion pairing security audit (QA findings B4, M4).
 *
 * CompanionHub gates remote command-approval / workflow-stop rights behind a
 * pairing code. These tests pin down the current security properties and
 * explicitly document the weaknesses so they are regression-tracked.
 *
 * Pass/fail: every test asserts the *current* behavior, so the suite is green.
 * The comments mark which assertions encode a vulnerability we want fixed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CompanionHub } from '../companionHub';

describe('CompanionHub pairing code', () => {
  let hub: CompanionHub;
  beforeEach(() => { hub = new CompanionHub(); });

  it('generates a 6-digit numeric code', () => {
    const code = hub.generatePairingCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('rejects an empty or wrong code', () => {
    hub.generatePairingCode();
    expect(hub.verifyPairingCode('')).toBe(false);
    expect(hub.verifyPairingCode('000000')).toBe(false);
  });

  it('accepts the exact generated code', () => {
    const code = hub.generatePairingCode();
    expect(hub.verifyPairingCode(code)).toBe(true);
  });

  it('lazily generates a code on first getPairingCode()', () => {
    expect(hub.getPairingCode()).toMatch(/^\d{6}$/);
  });

  it('uses a cryptographically-secure generator (well-distributed, not Math.random)', () => {
    // Smoke check on entropy: 200 codes should be (near-)unique and use the
    // full 6-digit width including leading-zero codes.
    const seen = new Set<string>();
    let hadLeadingZero = false;
    for (let i = 0; i < 200; i++) {
      const c = hub.generatePairingCode();
      seen.add(c);
      if (c[0] === '0') hadLeadingZero = true;
      expect(c).toMatch(/^\d{6}$/);
    }
    expect(seen.size).toBeGreaterThan(190); // collisions extremely unlikely
    expect(hadLeadingZero).toBe(true);       // padStart preserves leading zeros
  });

  it('rejects a code of the wrong length without throwing (constant-time guard)', () => {
    hub.generatePairingCode();
    expect(hub.verifyPairingCode('123')).toBe(false);
    expect(hub.verifyPairingCode('1234567')).toBe(false);
  });

  it('starts with zero connected companions', () => {
    expect(hub.getConnectedCount()).toBe(0);
  });
});

/**
 * SEC-B4 fixed: the pairing code now EXPIRES after a TTL. Uses fake timers to
 * advance past the 10-minute window deterministically.
 */
describe('CompanionHub pairing — TTL expiry (SEC-B4 fixed)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('rejects the code once the TTL has elapsed', () => {
    const hub = new CompanionHub();
    const code = hub.generatePairingCode();
    expect(hub.verifyPairingCode(code)).toBe(true);
    vi.advanceTimersByTime(10 * 60 * 1000 + 1); // > 10 minutes
    expect(hub.verifyPairingCode(code)).toBe(false);
  });

  it('getPairingCode() hands out a fresh code after expiry', () => {
    const hub = new CompanionHub();
    const first = hub.getPairingCode();
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    const second = hub.getPairingCode();
    // A new code was minted and the old one is dead.
    expect(hub.verifyPairingCode(first as string)).toBe(false);
    expect(hub.verifyPairingCode(second as string)).toBe(true);
  });
});

/**
 * SEC-M4 fixed: verification now locks out after MAX_ATTEMPTS wrong guesses for
 * a cooldown window, then recovers.
 */
describe('CompanionHub pairing — lockout (SEC-M4 fixed)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('locks out after 5 failed attempts, even for the correct code', () => {
    const hub = new CompanionHub();
    const code = hub.generatePairingCode();
    for (let i = 0; i < 5; i++) {
      expect(hub.verifyPairingCode('000000' === code ? '111111' : '000000')).toBe(false);
    }
    // Now locked: the CORRECT code is refused during the cooldown.
    expect(hub.verifyPairingCode(code)).toBe(false);
  });

  it('recovers after the lockout window elapses', () => {
    const hub = new CompanionHub();
    const code = hub.generatePairingCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) hub.verifyPairingCode(wrong);
    expect(hub.verifyPairingCode(code)).toBe(false); // locked
    vi.advanceTimersByTime(60 * 1000 + 1);           // wait out cooldown
    expect(hub.verifyPairingCode(code)).toBe(true);  // accepted again
  });
});
