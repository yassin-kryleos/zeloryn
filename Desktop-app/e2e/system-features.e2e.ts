import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Desktop renderer — System Features E2E test suite.
 *
 * Covers:
 *  1. Fast Model selector in ConfigHeader — renders, persists to localStorage, and updates config (Phase 9b).
 *  2. Audit trail export button producing downloadable report package (Phase 5).
 *  3. Spend cap enforcement: UI surfaces blocked-execution message when cap is reached (Phase 7e).
 *  4. PR description and CHANGELOG generation upon card worktree merge (Phase 9c).
 *
 * Process hygiene:
 *  Zero live external CLI binaries spawned (claude, codex, cursor, antigravity).
 *  Zero real API spend (hermetic local CostGuard checks and sandbox worktree boundaries).
 */

const API = 'http://localhost:3001';
const SESSION_SECRET = process.env.KRYLEOS_LOCAL_SESSION_SECRET || 'test-session-secret-for-playwright-32chars';
const authHeaders = { 'X-Kryleos-Session': SESSION_SECRET };

test.describe('Desktop renderer — System and CostGuard features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Fast Model selector renders, persists to localStorage, and updates config (Phase 9b)', async ({ page }) => {
    const fastModelSelect = page.getByLabel('Fast AI model');
    await expect(fastModelSelect).toBeVisible();

    // Initial value is defined (empty default)
    const initialVal = await fastModelSelect.inputValue();
    expect(initialVal).toBeDefined();

    // Select a specific fast model: gpt-4o-mini
    await fastModelSelect.selectOption('gpt-4o-mini');
    await expect(fastModelSelect).toHaveValue('gpt-4o-mini');

    // Verify localStorage persistence in the browser context
    const persisted = await page.evaluate(() => localStorage.getItem('matrix_fast_model'));
    expect(persisted).toBe('gpt-4o-mini');

    // Reload the page to verify rehydration from localStorage
    await page.reload();
    await page.waitForLoadState('networkidle');

    const rehydratedSelect = page.getByLabel('Fast AI model');
    await expect(rehydratedSelect).toHaveValue('gpt-4o-mini');

    // Reset back to empty
    await rehydratedSelect.selectOption('');
    const resetValue = await page.evaluate(() => localStorage.getItem('matrix_fast_model'));
    expect(resetValue).toBe('');
  });

  test('audit trail export button generates compliance package and surfaces success notification (Phase 5)', async ({ page }) => {
    // Navigate to Forge space (PreviewDeck)
    await page.getByRole('button', { name: 'Forge', exact: true }).click();
    await page.waitForTimeout(300);

    // Switch to Artifacts tab inside PreviewDeck
    const artifactsTab = page.getByRole('button', { name: 'Artifacts', exact: true });
    await expect(artifactsTab).toBeVisible();
    await artifactsTab.click();

    // Locate the audit export button
    const auditBtn = page.locator('button[title*="Export full compliance audit package"]').first();
    await expect(auditBtn).toBeVisible();

    // Click the audit export button
    await auditBtn.click();

    // Notification confirms successful export
    const notification = page.getByRole('status').filter({ hasText: /audit trail exported/i });
    await expect(notification).toBeVisible({ timeout: 10000 });
  });

  test('spend cap enforcement: UI surfaces blocked-execution message when cap is reached (Phase 7e)', async ({ page, request }) => {
    // 1. Configure spend cap to $0 to guarantee immediate cap block
    const capRes = await request.post(`${API}/api/cost/spend-cap`, {
      headers: authHeaders,
      data: {
        enabled: true,
        maxProjectSpend: 0,
      },
    });
    expect(capRes.ok()).toBe(true);

    try {
      // Switch to Forge space (code space where ChatConsole is rendered)
      await page.getByRole('button', { name: 'Forge', exact: true }).click();
      await page.waitForTimeout(300);

      // Enter a user prompt into the chat console
      const chatInput = page.getByPlaceholder(/Describe the work, question, or review you need/i);
      await expect(chatInput).toBeVisible();
      await chatInput.fill('Run system health check');
      await chatInput.press('Enter');

      // UI surfaces blocked execution error message from CostGuard
      const blockedMessage = page.locator('text=Project spend cap reached').first();
      await expect(blockedMessage).toBeVisible({ timeout: 10000 });
    } finally {
      // Clean up: disable spend cap
      await request.post(`${API}/api/cost/spend-cap`, {
        headers: authHeaders,
        data: { enabled: false },
      });
    }
  });

  test('PR description and CHANGELOG generation on card worktree merge (Phase 9c)', async ({ request }) => {
    const testTaskId = `e2e_pr_${Date.now()}`;
    const workspaceRoot = process.cwd();
    const prFilePath = path.join(workspaceRoot, '.kryleos', 'pull_requests', `${testTaskId}.md`);
    const changelogPath = path.join(workspaceRoot, '.kryleos', 'CHANGELOG.md');

    // Exercise the mergeCardWorktree route with assembleOnly card data
    const mergeRes = await request.post(`${API}/api/worktrees/merge/${testTaskId}`, {
      headers: authHeaders,
      data: {
        targetBranch: 'main',
        cardData: {
          assembleOnly: true,
          title: 'Automated E2E Feature Card',
          category: 'feature',
          description: 'Adds comprehensive verification for PR description generation.',
          acceptanceCriteria: [
            { type: 'functional', description: 'PR markdown artifact exists in .kryleos/pull_requests' },
            { type: 'quality', description: 'Changelog entry appended' },
          ],
          postExecutionReview: {
            verdict: 'PASS',
            findings: 'Automated post-execution test verification passed with 0 errors.',
          },
        },
      },
    });

    // Merge route completes
    expect(mergeRes.status()).toBe(200);
    const body = await mergeRes.json();
    expect(body.success).toBe(true);
    expect(body.prPath).toBeDefined();

    // Verify the PR description markdown file was written to disk
    expect(fs.existsSync(prFilePath)).toBe(true);
    const prContent = fs.readFileSync(prFilePath, 'utf-8');
    expect(prContent).toContain(`# PR: Automated E2E Feature Card [Card: ${testTaskId}]`);
    expect(prContent).toContain('**Verdict**: **PASS**');
    expect(prContent).toContain('Automated post-execution test verification passed with 0 errors.');
    expect(prContent).toContain('PR markdown artifact exists in .kryleos/pull_requests');

    // Verify CHANGELOG.md exists and contains the card entry
    expect(fs.existsSync(changelogPath)).toBe(true);
    const changelogContent = fs.readFileSync(changelogPath, 'utf-8');
    expect(changelogContent).toContain(testTaskId);
    expect(changelogContent).toContain('Automated E2E Feature Card');

    // Clean up test PR artifact
    try {
      if (fs.existsSync(prFilePath)) {
        fs.unlinkSync(prFilePath);
      }
    } catch {
      // best-effort cleanup
    }
  });
});
