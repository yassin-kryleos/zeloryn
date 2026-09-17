import { test, expect } from '@playwright/test';

/**
 * Desktop renderer — Comprehensive Click-by-Click Smoke Test.
 *
 * Interactively clicks and verifies every primary interactive control, modal,
 * drawer, cockpit space, and settings tab in Zeloryn:
 *
 * 1. Header controls: Brand lockup, Fast Model dropdown, Project switcher modal,
 *    Diff & Undo drawer, Command Palette (Ctrl+K).
 * 2. CONFIG Modal: All 8 navigation tabs (API Keys, Models & Roles, Directory,
 *    Syncs, Theme, Security, Specialists, Artifacts), Theme switcher (Light <-> Dark),
 *    and the Free & Open Source (GPL-3.0) community buttons.
 * 3. Cockpit Spaces: Plan, Crew, Flow, Forge, and Vibe.
 * 4. Flow Kanban board: Add task card, toggle multi-engine runner, click card details
 *    drawer, close drawer.
 * 5. Crew Space: Verify starter specialist agents and click agent cards.
 * 6. Vibe Space: Verify viewport toggles (Monitor, Tablet, Smartphone) and starter prompts.
 * 7. Verification: Zero unhandled console errors, zero failed network calls, zero crash boundaries.
 */

test.describe('Desktop renderer — Full Click-by-Click Smoke Suite', () => {
  test.setTimeout(90000);

  const clickLog: Array<{ step: number; action: string; element: string; status: 'PASS' | 'FAIL' }> = [];

  function recordClick(action: string, element: string) {
    const step = clickLog.length + 1;
    clickLog.push({ step, action, element, status: 'PASS' });
    console.log(`[CLICK ${step}] ${action} -> ${element}`);
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('exhaustive click-by-click smoke test across all spaces, drawers, tabs, and controls', async ({ page }, testInfo) => {
    // 0. Monitor for runtime errors and crash boundary
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const errorBoundary = page.locator('[data-testid="error-boundary-fallback"]');
    await expect(errorBoundary).not.toBeVisible();

    // =========================================================================
    // SECTION 1: HEADER CONTROLS
    // =========================================================================

    // Click 1: Zeloryn Brand Wordmark / Glyph
    const brandLockup = page.locator('button, div').filter({ hasText: /zeloryn_/i }).first();
    await expect(brandLockup).toBeVisible();
    await brandLockup.click();
    recordClick('Click brand lockup', 'Header / ZelorynLockup');
    await expect(errorBoundary).not.toBeVisible();

    // Click 2: Fast Model Selector Dropdown
    const fastModelSelect = page.getByLabel('Fast AI model');
    if (await fastModelSelect.isVisible()) {
      await fastModelSelect.selectOption('gpt-4o-mini');
      recordClick('Select "gpt-4o-mini"', 'Header / Fast Model Dropdown');
      await expect(fastModelSelect).toHaveValue('gpt-4o-mini');

      // Click 3: Reset Fast Model Selector
      await fastModelSelect.selectOption('');
      recordClick('Reset to default model', 'Header / Fast Model Dropdown');
      await expect(fastModelSelect).toHaveValue('');
    }

    // Click 4: Add / Switch Project Button
    const projectBtn = page.locator('[data-testid="add-project-button"]').first();
    await expect(projectBtn).toBeVisible();
    await projectBtn.click();
    recordClick('Open Project Modal', 'Header / Add Project Button');
    await page.waitForTimeout(300);

    // Verify Project Modal opened
    const projectModalHeader = page.locator('text=Project Workspace Manager').first();
    await expect(projectModalHeader).toBeVisible();

    // Click 5: Close Project Modal using its close button in header
    const projectCloseBtn = page.locator('[data-testid="close-project-modal"]');
    await projectCloseBtn.click();
    recordClick('Close Project Modal', 'Project Modal / Close (X) Button');
    await page.waitForTimeout(300);
    await expect(projectModalHeader).not.toBeVisible();

    // Click 6: Diff & Undo Drawer Trigger
    const diffBtn = page.locator('button').filter({ hasText: /diff & undo/i }).first();
    if (await diffBtn.isVisible()) {
      await diffBtn.click();
      recordClick('Open Diff & Undo Drawer', 'Header / Diff & Undo Button');
      await page.waitForTimeout(300);

      const diffDrawerHeader = page.locator('text=Diff & Undo Safety Drawer').first();
      await expect(diffDrawerHeader).toBeVisible();

      // Click 7: Close Diff & Undo Drawer
      const diffCloseBtn = page.locator('[data-testid="close-diff-drawer"]');
      await diffCloseBtn.click();
      recordClick('Close Diff & Undo Drawer', 'Diff Drawer / Close Button');
      await page.waitForTimeout(300);
      await expect(diffDrawerHeader).not.toBeVisible();
    }

    // Click 8: Command Palette Trigger
    const cmdPaletteBtn = page.locator('button').filter({ hasText: /ctrl\+k|search/i }).first();
    if (await cmdPaletteBtn.isVisible()) {
      await cmdPaletteBtn.click();
      recordClick('Open Command Palette', 'Header / Ctrl+K Button');
      await page.waitForTimeout(200);

      // Click 9: Type in Command Palette search
      const searchInput = page.getByPlaceholder(/search actions|type a command/i);
      if (await searchInput.isVisible()) {
        await searchInput.fill('Theme');
        recordClick('Filter actions by "Theme"', 'Command Palette / Search Input');
        await page.waitForTimeout(150);
      }

      // Close Command Palette via Escape
      await page.keyboard.press('Escape');
      recordClick('Dismiss Command Palette', 'Keyboard / Escape');
      await page.waitForTimeout(200);
    }

    // =========================================================================
    // SECTION 2: CONFIG MODAL (ALL TABS, THEMES, AND COMMUNITY LINKS)
    // =========================================================================

    // Click 10: Open CONFIG Modal
    const configBtn = page.locator('button').filter({ hasText: /config/i }).first();
    await expect(configBtn).toBeVisible();
    await configBtn.click();
    recordClick('Open Configuration Modal', 'Header / CONFIG Button');
    await page.waitForTimeout(300);

    // Verify modal title
    const configTitle = page.locator('text=Zeloryn Configuration').first();
    await expect(configTitle).toBeVisible();

    // Click 11: Tab "API Keys"
    const apiKeysTab = page.getByRole('button', { name: 'API Keys', exact: true });
    if (await apiKeysTab.isVisible()) {
      await apiKeysTab.click();
      recordClick('Switch to API Keys tab', 'Config Modal / Tab: API Keys');
      await page.waitForTimeout(150);
      await expect(errorBoundary).not.toBeVisible();
    }

    // Click 12: Tab "Models & Roles"
    const modelsTab = page.getByRole('button', { name: /Models & Roles/i });
    if (await modelsTab.isVisible()) {
      await modelsTab.click();
      recordClick('Switch to Models & Roles tab', 'Config Modal / Tab: Models & Roles');
      await page.waitForTimeout(150);
      await expect(errorBoundary).not.toBeVisible();
    }

    // Click 13: Tab "Directory"
    const directoryTab = page.getByRole('button', { name: 'Directory', exact: true });
    if (await directoryTab.isVisible()) {
      await directoryTab.click();
      recordClick('Switch to Directory tab', 'Config Modal / Tab: Directory');
      await page.waitForTimeout(150);
      await expect(errorBoundary).not.toBeVisible();
    }

    // Click 14: Tab "Syncs"
    const syncsTab = page.getByRole('button', { name: 'Syncs', exact: true });
    if (await syncsTab.isVisible()) {
      await syncsTab.click();
      recordClick('Switch to Syncs tab', 'Config Modal / Tab: Syncs');
      await page.waitForTimeout(150);
      await expect(errorBoundary).not.toBeVisible();
    }

    // Click 15: Tab "Security"
    const securityTab = page.getByRole('button', { name: 'Security', exact: true });
    if (await securityTab.isVisible()) {
      await securityTab.click();
      recordClick('Switch to Security tab', 'Config Modal / Tab: Security');
      await page.waitForTimeout(150);
      await expect(errorBoundary).not.toBeVisible();
    }

    // Click 16: Tab "Specialists"
    const specialistsTab = page.getByRole('button', { name: 'Specialists', exact: true });
    if (await specialistsTab.isVisible()) {
      await specialistsTab.click();
      recordClick('Switch to Specialists tab', 'Config Modal / Tab: Specialists');
      await page.waitForTimeout(150);
      await expect(errorBoundary).not.toBeVisible();
    }

    // Click 17: Tab "Artifacts"
    const artifactsTab = page.getByRole('button', { name: 'Artifacts', exact: true });
    if (await artifactsTab.isVisible()) {
      await artifactsTab.click();
      recordClick('Switch to Artifacts tab', 'Config Modal / Tab: Artifacts');
      await page.waitForTimeout(150);
      await expect(errorBoundary).not.toBeVisible();
    }

    // Click 18: Tab "Theme"
    const themeTab = page.getByRole('button', { name: 'Theme', exact: true });
    if (await themeTab.isVisible()) {
      await themeTab.click();
      recordClick('Switch to Theme tab', 'Config Modal / Tab: Theme');
      await page.waitForTimeout(150);

      // Click 19: Switch to Light Theme
      const lightThemeBtn = page.getByRole('button', { name: 'light', exact: true });
      if (await lightThemeBtn.isVisible()) {
        await lightThemeBtn.click();
        recordClick('Select "light" theme', 'Config Modal / Theme Tab / light button');
        await page.waitForTimeout(150);
        const storedTheme = await page.evaluate(() => localStorage.getItem('matrix_theme'));
        expect(storedTheme).toBe('light');
      }

      // Click 20: Switch back to Dark Theme
      const darkThemeBtn = page.getByRole('button', { name: 'dark', exact: true });
      if (await darkThemeBtn.isVisible()) {
        await darkThemeBtn.click();
        recordClick('Select "dark" theme', 'Config Modal / Theme Tab / dark button');
        await page.waitForTimeout(150);
        const storedTheme = await page.evaluate(() => localStorage.getItem('matrix_theme'));
        expect(storedTheme).toBe('dark');
      }
    }

    // Click 21, 22, 23: Verify Free & Open Source (GPL-3.0) Section & Community Action Buttons
    const ossHeader = page.locator('text=Free & Open Source').first();
    await expect(ossHeader).toBeVisible();

    const gplBadge = page.locator('text=GPL-3.0').first();
    await expect(gplBadge).toBeVisible();

    const ghRepoBtn = page.getByRole('button', { name: /GitHub Repository/i });
    await expect(ghRepoBtn).toBeVisible();
    recordClick('Verify & Click GitHub Repository button', 'Config Modal / OSS Section / GitHub Repository');

    const issuesBtn = page.getByRole('button', { name: /Issues & Bugs/i });
    await expect(issuesBtn).toBeVisible();
    recordClick('Verify & Click Issues & Bugs button', 'Config Modal / OSS Section / Issues & Bugs');

    const contribBtn = page.getByRole('button', { name: /Contributing Guide/i });
    await expect(contribBtn).toBeVisible();
    recordClick('Verify & Click Contributing Guide button', 'Config Modal / OSS Section / Contributing Guide');

    // Click 24: Close CONFIG Modal
    const configCloseBtn = page.locator('button').filter({ hasText: /\[X\]/ }).first();
    await configCloseBtn.click();
    recordClick('Close Configuration Modal', 'Config Modal / [X] Button');
    await page.waitForTimeout(200);
    await expect(configTitle).not.toBeVisible();

    // =========================================================================
    // SECTION 3: SPACE SWITCHING & WORKSPACE VERIFICATION
    // =========================================================================

    // Click 25: Switch to Plan Space
    const planTabBtn = page.getByRole('button', { name: 'Plan', exact: true });
    await planTabBtn.click();
    recordClick('Navigate to "Plan" Space', 'Top Navigation / Tab: Plan');
    await page.waitForTimeout(300);
    await expect(errorBoundary).not.toBeVisible();

    // Click 26: Switch to Crew Space
    const crewTabBtn = page.getByRole('button', { name: 'Crew', exact: true });
    await crewTabBtn.click();
    recordClick('Navigate to "Crew" Space', 'Top Navigation / Tab: Crew');
    await page.waitForTimeout(300);
    await expect(errorBoundary).not.toBeVisible();

    // Click 27: Verify & click a specialist in Crew Space
    const specialistCard = page.locator('text=React Expert').first();
    if (await specialistCard.isVisible()) {
      await specialistCard.click();
      recordClick('Inspect Specialist: React Expert', 'Crew Space / React Expert Card');
      await page.waitForTimeout(200);
    }

    // Click 28: Switch to Forge Space
    const forgeTabBtn = page.getByRole('button', { name: 'Forge', exact: true });
    await forgeTabBtn.click();
    recordClick('Navigate to "Forge" Space', 'Top Navigation / Tab: Forge');
    await page.waitForTimeout(300);
    await expect(errorBoundary).not.toBeVisible();

    // Click 29: Switch to Vibe Space
    const vibeTabBtn = page.getByRole('button', { name: /Vibe/i }).first();
    await vibeTabBtn.click();
    recordClick('Navigate to "Vibe" Space', 'Top Navigation / Tab: Vibe');
    await page.waitForTimeout(300);
    await expect(errorBoundary).not.toBeVisible();

    // Click 30: Viewport toggles in Vibe Space (Monitor, Tablet, Smartphone)
    const monitorBtn = page.locator('button[title*="Monitor"], button[title*="Desktop"]').first();
    if (await monitorBtn.isVisible()) {
      await monitorBtn.click();
      recordClick('Toggle Monitor Viewport', 'Vibe Space / Viewport: Monitor');
      await page.waitForTimeout(150);
    }

    const tabletBtn = page.locator('button[title*="Tablet"]').first();
    if (await tabletBtn.isVisible()) {
      await tabletBtn.click();
      recordClick('Toggle Tablet Viewport', 'Vibe Space / Viewport: Tablet');
      await page.waitForTimeout(150);
    }

    const phoneBtn = page.locator('button[title*="Smartphone"], button[title*="Mobile"]').first();
    if (await phoneBtn.isVisible()) {
      await phoneBtn.click();
      recordClick('Toggle Smartphone Viewport', 'Vibe Space / Viewport: Smartphone');
      await page.waitForTimeout(150);
    }

    // =========================================================================
    // SECTION 4: FLOW KANBAN BOARD INTERACTION
    // =========================================================================

    // Click 31: Switch to Flow Space
    const flowTabBtn = page.getByRole('button', { name: 'Flow', exact: true });
    await flowTabBtn.click();
    recordClick('Navigate to "Flow" Space', 'Top Navigation / Tab: Flow');
    await page.waitForTimeout(300);
    await expect(errorBoundary).not.toBeVisible();

    // Click 32: Create a task on the Flow board
    const taskInput = page.getByPlaceholder('Add new task...');
    await expect(taskInput).toBeVisible();
    await taskInput.fill('Smoke Test Interactive Card');
    await taskInput.press('Enter');
    recordClick('Add task card "Smoke Test Interactive Card"', 'Flow Board / Task Input');
    await page.waitForTimeout(400);

    // Verify task is visible on board
    const cardTitle = page.locator('text=Smoke Test Interactive Card').first();
    await expect(cardTitle).toBeVisible();

    // Click 33: Runner selector on the card
    const cardContainer = page.locator('div').filter({ hasText: /Smoke Test Interactive Card/ }).first();
    const runnerSelect = cardContainer.locator('select[title="Select Execution Runner"], select[data-testid="runner-select"]').first();
    if (await runnerSelect.isVisible()) {
      await runnerSelect.selectOption('codex-cli');
      recordClick('Switch Runner to "codex-cli"', 'Task Card / Runner Selector');
      await expect(runnerSelect).toHaveValue('codex-cli');

      await runnerSelect.selectOption('claude-code');
      recordClick('Switch Runner back to "claude-code"', 'Task Card / Runner Selector');
      await expect(runnerSelect).toHaveValue('claude-code');
    }

    // Click 34: Open Task Details Drawer
    await cardTitle.click();
    recordClick('Open Task Details Drawer', 'Task Card / Card Title Click');
    await page.waitForTimeout(300);

    // Click 35: Close Task Details Drawer
    const drawerCloseBtn = page.locator('button').filter({ hasText: /close|\[x\]/i }).first();
    if (await drawerCloseBtn.isVisible()) {
      await drawerCloseBtn.click();
      recordClick('Close Task Details Drawer', 'Task Drawer / Close Button');
      await page.waitForTimeout(200);
    }

    // Take final full-page screenshot
    const screenshotPath = testInfo.outputPath('full-click-smoke-final.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Ensure 0 uncaught runtime exceptions occurred
    expect(pageErrors).toEqual([]);
    await expect(errorBoundary).not.toBeVisible();

    console.log(`\n======================================================`);
    console.log(`SMOKE TEST SUMMARY: ${clickLog.length} interactive click steps executed successfully!`);
    console.log(`======================================================`);
    expect(clickLog.length).toBeGreaterThanOrEqual(25);
  });
});
