import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = '/home/yassin/.gemini/antigravity/brain/073d05ef-2697-4574-b112-6667b8106609/ui_review';

test.describe('Visual Audit & Click-by-Click Exploration', () => {
  test.setTimeout(120000);

  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  test('capture all UI states for honest UX audit', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Initial State: Plan or default space
    await page.waitForTimeout(500);

    // Navigate to Flow Space
    const flowTab = page.getByRole('button', { name: 'Flow', exact: true });
    await flowTab.click();
    await page.waitForTimeout(400);

    // Create a couple of tasks to see a populated Kanban board
    const taskInput = page.getByPlaceholder('Add new task...');
    await taskInput.fill('Implement OAuth PKCE flow for CLI');
    await taskInput.press('Enter');
    await page.waitForTimeout(300);

    await taskInput.fill('Optimize vector search latency in SQLite');
    await taskInput.press('Enter');
    await page.waitForTimeout(300);

    await taskInput.fill('Write comprehensive unit tests for worktree isolation');
    await taskInput.press('Enter');
    await page.waitForTimeout(400);

    // Screenshot 1: Flow Kanban Board
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_flow_kanban.png'), fullPage: true });

    // Switch to Today View
    const todayToggle = page.locator('[data-testid="flow-view-today"]');
    if (await todayToggle.isVisible()) {
      await todayToggle.click();
      await page.waitForTimeout(300);
      // Screenshot 2: Flow Today View
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_flow_today.png'), fullPage: true });

      // Switch back to Kanban
      const kanbanToggle = page.locator('[data-testid="flow-view-kanban"]');
      await kanbanToggle.click();
      await page.waitForTimeout(300);
    }

    // Open Task Detail Drawer for the first card
    const firstCard = page.locator('text=Implement OAuth PKCE flow for CLI').first();
    await firstCard.click();
    await page.waitForTimeout(400);

    // Screenshot 3: Task Detail Drawer
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_task_drawer.png'), fullPage: true });

    // Close Task Detail Drawer
    const drawerCloseBtn = page.locator('[data-testid="close-task-drawer"]');
    if (await drawerCloseBtn.isVisible()) {
      await drawerCloseBtn.click();
      await page.waitForTimeout(400);
      await expect(drawerCloseBtn).not.toBeVisible();
    }

    // Open CONFIG Modal
    const configBtn = page.locator('button').filter({ hasText: /config/i }).first();
    await configBtn.click();
    await page.waitForTimeout(400);

    // Screenshot 4: Config Modal - API Keys (default)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_config_apikeys.png'), fullPage: true });

    // Switch to Models & Roles tab
    const modelsTab = page.getByRole('button', { name: /Models & Roles/i });
    if (await modelsTab.isVisible()) {
      await modelsTab.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_config_models.png'), fullPage: true });
    }

    // Switch to About tab
    const aboutTab = page.getByRole('button', { name: 'About', exact: true });
    if (await aboutTab.isVisible()) {
      await aboutTab.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_config_about.png'), fullPage: true });
    }

    // Close CONFIG Modal
    const configCloseBtn = page.locator('button').filter({ hasText: /\[X\]/ }).first();
    await configCloseBtn.click();
    await page.waitForTimeout(300);

    // Navigate to Plan Space
    const planTab = page.getByRole('button', { name: 'Plan', exact: true });
    await planTab.click();
    await page.waitForTimeout(500);
    // Screenshot 7: Plan Space
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_plan_space.png'), fullPage: true });

    // Navigate to Crew Space
    const crewTab = page.getByRole('button', { name: 'Crew', exact: true });
    await crewTab.click();
    await page.waitForTimeout(500);
    // Screenshot 8: Crew Space
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_crew_space.png'), fullPage: true });

    // Navigate to Forge Space
    const forgeTab = page.getByRole('button', { name: 'Forge', exact: true });
    await forgeTab.click();
    await page.waitForTimeout(500);
    // Screenshot 9: Forge Space
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_forge_space.png'), fullPage: true });

    // Navigate to Vibe Space
    const vibeTab = page.getByRole('button', { name: /Vibe/i }).first();
    await vibeTab.click();
    await page.waitForTimeout(500);
    // Screenshot 10: Vibe Space
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_vibe_space.png'), fullPage: true });

    // Open Diff Drawer
    const diffBtn = page.locator('button').filter({ hasText: /diff & undo/i }).first();
    if (await diffBtn.isVisible()) {
      await diffBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_diff_drawer.png'), fullPage: true });

      const diffCloseBtn = page.locator('[data-testid="close-diff-drawer"]');
      await diffCloseBtn.click();
      await page.waitForTimeout(300);
    }

    // Open Command Palette
    await page.keyboard.press('ControlOrMeta+k');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_command_palette.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Switch to Light Theme
    await configBtn.click();
    await page.waitForTimeout(300);
    const themeTab = page.getByRole('button', { name: 'Theme', exact: true });
    if (await themeTab.isVisible()) {
      await themeTab.click();
      await page.waitForTimeout(200);
      const lightBtn = page.getByRole('button', { name: 'light', exact: true });
      if (await lightBtn.isVisible()) {
        await lightBtn.click();
        await page.waitForTimeout(300);
      }
    }
    await configCloseBtn.click();
    await page.waitForTimeout(300);

    // Navigate to Flow Space in Light Theme
    await flowTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_light_theme_flow.png'), fullPage: true });

    // Reset back to dark theme
    await configBtn.click();
    await page.waitForTimeout(200);
    if (await themeTab.isVisible()) {
      await themeTab.click();
      await page.waitForTimeout(200);
      const darkBtn = page.getByRole('button', { name: 'dark', exact: true });
      if (await darkBtn.isVisible()) {
        await darkBtn.click();
        await page.waitForTimeout(200);
      }
    }
    await configCloseBtn.click();
    await page.waitForTimeout(300);
  });
});
