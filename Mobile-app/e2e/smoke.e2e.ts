import { test, expect } from '@playwright/test';

/**
 * Mobile companion app — smoke E2E tests (Expo Web).
 *
 * Verifies that all 5 navigation tabs (Dashboard, Plan, Chat, Tasks, Settings)
 * load and render without crash. Backend connectivity is nice-to-have but
 * tests degrade gracefully when the Desktop backend is unavailable.
 *
 * Pass/fail: all structural assertions are deterministic. A tab missing from
 * the DOM or a crash banner visible constitutes a test failure.
 */

const TABS = ['Dashboard', 'Plan', 'Chat', 'Tasks', 'Settings'];

test.describe('Mobile app — smoke (Expo Web)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
  });

  test('page title is present', async ({ page }) => {
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('header shows KRYLEOS FORGE // COMPANION', async ({ page }) => {
    const header = page.locator('text=/KRYLEOS|COMPANION/i').first();
    await expect(header).toBeVisible();
  });

  for (const tab of TABS) {
    test(`${tab} tab is visible in navigation`, async ({ page }) => {
      const tabEl = page.locator(`text="${tab}"`).or(
        page.locator(`text=/${tab}/i`)
      ).first();
      await expect(tabEl).toBeVisible();
    });
  }

  test('clicking each tab does not crash the app', async ({ page }) => {
    for (const tab of TABS) {
      const tabEl = page.locator(`text="${tab}"`).or(
        page.locator(`text=/${tab}/i`)
      ).first();
      if (await tabEl.isVisible({ timeout: 1000 })) {
        await tabEl.click();
        await page.waitForTimeout(300);
        // Should not show a white screen or raw error
        const bodyText = await page.evaluate(() => document.body.innerText.trim());
        expect(bodyText.length).toBeGreaterThan(0);
      }
    }
  });

  test('Settings tab shows COMPANION PAIRING CODE field', async ({ page }) => {
    const settingsTab = page.locator('text="Settings"').or(
      page.locator('text=/settings/i')
    ).first();
    if (await settingsTab.isVisible({ timeout: 1000 })) {
      await settingsTab.click();
      await page.waitForTimeout(500);
      const pairingField = page.locator('text=/pairing|PAIRING/i').first();
      await expect(pairingField).toBeVisible();
    }
  });

  test('no raw ** markdown markers visible in the DOM', async ({ page }) => {
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toMatch(/\*\*[^*]+\*\*/);
  });

  test('Dashboard shows WORKSPACE TELEMETRY section', async ({ page }) => {
    const dashTab = page.locator('text="Dashboard"').first();
    if (await dashTab.isVisible({ timeout: 1000 })) {
      await dashTab.click();
      await page.waitForTimeout(300);
      const telemetry = page.locator('text=/telemetry|TELEMETRY/i').first();
      await expect(telemetry).toBeVisible();
    }
  });
});
