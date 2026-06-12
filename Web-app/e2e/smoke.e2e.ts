import { test, expect } from '@playwright/test';

/**
 * E2E smoke flow for the Web companion dashboard.
 * Pass/fail: page loads, hero + nav render, and tab navigation works.
 */
test.describe('Web companion — smoke', () => {
  test('loads the dashboard with hero heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('KRYLEOS');
  });

  test('exposes a labelled tab list with all tabs', async ({ page }) => {
    await page.goto('/');
    // The nav is a WAI-ARIA tablist (role="tablist") with role="tab" children.
    await expect(page.getByRole('tablist', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(6);
  });

  test('navigates to the Planning tab', async ({ page }) => {
    await page.goto('/');
    // Tabs expose role="tab" (inside the role="tablist" nav).
    const planningTab = page.getByRole('tab', { name: 'Planning tab' });
    await planningTab.click();
    await expect(planningTab).toHaveAttribute('aria-selected', 'true');
    // After switching, the planning UI (voice input control) is shown.
    await expect(page.getByRole('button', { name: /voice input/i }).first()).toBeVisible();
  });

  test('actions surface an in-app toast, not a native dialog', async ({ page }) => {
    await page.goto('/');
    // Fail loudly if any code path still falls back to window.alert/confirm.
    let nativeDialogFired = false;
    page.on('dialog', async d => { nativeDialogFired = true; await d.dismiss(); });

    await page.getByRole('tab', { name: 'Downloads tab' }).click();
    await page.getByRole('button', { name: /download for windows/i }).click();

    const toast = page.getByRole('status').filter({ hasText: /windows/i });
    await expect(toast).toBeVisible();
    expect(nativeDialogFired).toBe(false);

    // Toast is dismissible via its close control.
    await toast.getByRole('button', { name: /dismiss notification/i }).click();
    await expect(toast).toHaveCount(0);
  });

  test('Import Plan opens a themed dialog and Escape closes it', async ({ page }) => {
    // Paid tier so Import opens the options dialog (free tier shows the upsell).
    await page.addInitScript(() => localStorage.setItem('web_user_tier', 'pro'));
    await page.goto('/');
    await page.getByRole('tab', { name: 'Planning tab' }).click();
    await page.getByRole('button', { name: /import plan/i }).click();

    const dialog = page.getByRole('dialog', { name: /import plan to desktop/i });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('logged-out purchase requires sign-in, then completes checkout', async ({ page }) => {
    await page.goto('/');

    // Logged out: header shows a Log In affordance.
    await expect(page.getByRole('button', { name: /^log in$/i })).toBeVisible();

    // Attempting to buy a paid plan forces authentication first.
    await page.getByRole('tab', { name: 'Pricing tab' }).click();
    await page.getByRole('button', { name: /choose pro/i }).click();

    const authDialog = page.getByRole('dialog', { name: /sign in/i });
    await expect(authDialog).toBeVisible();
    await expect(authDialog).toContainText(/purchasing the .*pro.* plan/i);

    await page.locator('#auth-email').fill('buyer@example.com');
    await page.locator('#auth-password').fill('forge123');
    await authDialog.getByRole('button', { name: /sign in/i }).click();

    // Checkout opens automatically for the pending plan.
    const checkout = page.getByRole('dialog', { name: /checkout/i });
    await expect(checkout).toBeVisible();
    await expect(checkout).toContainText('$9.99');

    await page.locator('#card-name').fill('Test Buyer');
    await page.locator('#card-number').fill('4242424242424242');
    await page.locator('#card-expiry').fill('12/28');
    await page.locator('#card-cvc').fill('123');
    await checkout.getByRole('button', { name: /pay \$9\.99/i }).click();

    // Payment confirmation toast + active plan reflected in the header.
    await expect(page.getByRole('status').filter({ hasText: /pro plan is now active/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /log out/i })).toBeVisible();
  });

  test('sign-in rejects a too-short password', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^log in$/i }).click();
    const authDialog = page.getByRole('dialog', { name: /sign in/i });
    // Valid email (passes native input validation) but a password under 6 chars.
    await page.locator('#auth-email').fill('buyer@example.com');
    await page.locator('#auth-password').fill('123');
    await authDialog.getByRole('button', { name: /sign in/i }).click();
    await expect(authDialog.getByRole('alert')).toContainText(/at least 6 characters/i);
    // Still on the dialog — not authenticated.
    await expect(authDialog).toBeVisible();
  });
});
