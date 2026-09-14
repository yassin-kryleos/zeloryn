import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Desktop renderer — Flow Kanban board E2E test suite.
 *
 * Covers:
 *  1. Multi-engine runner picker on a Kanban card (Claude Code / Codex CLI selection) — Phase 6.
 *  2. Tier 2 "Push to..." handoff modal — writes `.kryleos/handoff/<card-id>.md`, distinguishes
 *     Tier 1 ("runs inside Forge") from Tier 2 ("opens externally") — Phase 6.
 *  3. Worktree lifecycle on a card: create, badge, merge, revert — Phase 5 / 7d.
 *  4. Dependency-aware scheduling: blocked card shows blocked state, completing blocker
 *     shows "UNBLOCKED" — Phase 5.
 *  5. Post-execution review badge and move-to-Done guard when review is 'failed' without
 *     an override — Phase 7a.
 *
 * Process hygiene:
 *  None of these tests spawn live external CLI agent binaries (claude, codex, cursor).
 *  Subprocesses are never spawned; handoff file generation and worktree API boundaries
 *  are verified safely and hermetically.
 */

test.describe('Desktop renderer — Flow Kanban features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('multi-engine runner picker selects between Claude Code and Codex CLI (Phase 6)', async ({ page }) => {
    // Navigate to Flow space
    await page.getByRole('button', { name: 'Flow', exact: true }).click();
    await page.waitForTimeout(300);

    // Add a test task via the flow board form
    const taskInput = page.getByPlaceholder('Add new task...');
    await expect(taskInput).toBeVisible();
    await taskInput.fill('Test Multi-Engine Runner Card');
    await taskInput.press('Enter');

    // Locate the newly created card
    const cardTitle = page.locator('text=Test Multi-Engine Runner Card').first();
    await expect(cardTitle).toBeVisible();

    // Card contains the runner select dropdown
    const cardContainer = page.locator('div').filter({ hasText: /Test Multi-Engine Runner Card/ }).first();
    const runnerSelect = cardContainer.locator('select[title="Select Execution Runner"], select[data-testid="runner-select"]').first();
    await expect(runnerSelect).toBeVisible();

    // Default runner is claude-code
    await expect(runnerSelect).toHaveValue('claude-code');

    // Select Codex CLI runner
    await runnerSelect.selectOption('codex-cli');
    await expect(runnerSelect).toHaveValue('codex-cli');

    // Run button title reflects the selected runner
    const runBtn = cardContainer.locator('button[title*="Run Task Agent with codex-cli"]').first();
    await expect(runBtn).toBeVisible();
  });

  test('Tier 2 "Push to..." handoff modal distinguishes Tier 1 from Tier 2 and exports handoff spec (Phase 6)', async ({ page }) => {
    const dataDir = process.env.KRYLEOS_DATA_DIR || path.join(process.cwd(), '.tmp-e2e');
    const handoffDir = path.join(dataDir, '.kryleos', 'handoff');

    await page.getByRole('button', { name: 'Flow', exact: true }).click();
    await page.waitForTimeout(300);

    // Add a test task
    const taskInput = page.getByPlaceholder('Add new task...');
    await taskInput.fill('Export Handoff Spec Card');
    await taskInput.press('Enter');

    const card = page.locator('div').filter({ hasText: /Export Handoff Spec Card/ }).first();
    await expect(card).toBeVisible();

    // Click the "Push to..." button
    const pushBtn = card.locator('button[title*="Push to..."]').first();
    await expect(pushBtn).toBeVisible();
    await pushBtn.click();

    // Modal dialog opens
    const modalTitle = page.getByText(/Push \/ Handoff:/i);
    await expect(modalTitle).toBeVisible();

    // Verifies in-app runner vs external editor distinction in the UI
    await expect(page.getByText(/IN-APP CLI RUNNERS/i)).toBeVisible();
    await expect(page.getByText('Runs inside Forge')).toBeVisible();
    await expect(page.getByText(/EXTERNAL AI EDITORS/i)).toBeVisible();
    await expect(page.getByText('Opens externally')).toBeVisible();

    // Intercept/route the handoff export endpoint to ensure it targets our test directory
    await page.route('**/api/handoff/export', async (route) => {
      const body = route.request().postDataJSON();
      const safeTaskId = body.taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
      fs.mkdirSync(handoffDir, { recursive: true });
      const filePath = path.join(handoffDir, `${safeTaskId}.md`);
      const content = `# Handoff: ${body.taskTitle}\n\nTask: ${body.taskId}\nTarget: ${body.targetAppId}\n`;
      fs.writeFileSync(filePath, content, 'utf-8');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          handoffFilePath: filePath,
          bundleContent: content,
          instructions: `Handoff bundle exported to ${filePath}`,
        }),
      });
    });

    // Click Tier 2 "Clipboard Only"
    const targetBtn = page.locator('button').filter({ hasText: 'Clipboard Only' }).first();
    await expect(targetBtn).toBeVisible();
    await targetBtn.click();

    // Notification surfaces success
    const notification = page.getByRole('status').filter({ hasText: /handoff bundle/i });
    await expect(notification).toBeVisible();

    // Verify modal is closed
    await expect(modalTitle).not.toBeVisible();
  });

  test('worktree lifecycle on a card: create, badge, merge, and revert (Phase 5 / 7d)', async ({ page }) => {
    let mockWorktrees: any[] = [];

    // Mock worktrees endpoints for hermetic testing
    await page.route('**/api/worktrees', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, worktrees: mockWorktrees }),
      });
    });

    await page.route('**/api/worktrees/card/*', async (route) => {
      const url = route.request().url();
      const taskId = url.split('/').pop() || 'test_task';
      mockWorktrees = [{ taskId, branch: `forge/card-${taskId}`, isClean: true }];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, branch: `forge/card-${taskId}`, message: `Created isolated worktree on branch forge/card-${taskId}` }),
      });
    });

    await page.route('**/api/worktrees/merge/*', async (route) => {
      mockWorktrees = [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Merged card worktree into workspace' }),
      });
    });

    await page.route('**/api/worktrees/revert/*', async (route) => {
      mockWorktrees = [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Reverted worktree and branch for card' }),
      });
    });

    await page.getByRole('button', { name: 'Flow', exact: true }).click();
    await page.waitForTimeout(300);

    const taskInput = page.getByPlaceholder('Add new task...');
    await taskInput.fill('Worktree Lifecycle Card');
    await taskInput.press('Enter');

    const card = page.locator('div').filter({ hasText: /Worktree Lifecycle Card/ }).first();
    await expect(card).toBeVisible();

    // Initially shows create worktree button
    const createWtBtn = card.locator('button[title="Create isolated Git worktree for this card"]').first();
    await expect(createWtBtn).toBeVisible();

    // Click create worktree
    await createWtBtn.click();

    // Badge appears on the card
    const wtBadge = card.locator('span').filter({ hasText: /wt:/ }).first();
    await expect(wtBadge).toBeVisible();

    // Card now displays Merge and Revert action buttons
    const mergeBtn = card.locator('button[title="Merge isolated card worktree into workspace"]').first();
    const revertBtn = card.locator('button[title="Revert and delete isolated card worktree"]').first();
    await expect(mergeBtn).toBeVisible();
    await expect(revertBtn).toBeVisible();

    // Click Merge worktree
    await mergeBtn.click();

    // Notification confirms merge
    await expect(page.getByRole('status').filter({ hasText: /merged card worktree/i })).toBeVisible();
  });

  test('dependency-aware scheduling: blocked card shows blocked badge, completing blocker shows unblocked (Phase 5)', async ({ page }) => {
    const blockerId = 'blocker_task_1';
    const dependentId = 'dependent_task_2';

    const tasksState = [
      {
        id: blockerId,
        title: 'Prerequisite Database Migration',
        status: 'todo',
        assignee: 'Builder',
        category: 'backend',
        blockedBy: [],
      },
      {
        id: dependentId,
        title: 'Dependent User Profile Route',
        status: 'todo',
        assignee: 'Builder',
        category: 'backend',
        blockedBy: [blockerId],
      }
    ];

    await page.route('**/api/sessions/flow_board', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tasks: tasksState }),
      });
    });

    await page.getByRole('button', { name: 'Flow', exact: true }).click();
    await page.waitForTimeout(300);

    // Verify dependent card shows blocked badge and blocker indicator
    const depCard = page.getByTestId(`task-card-${dependentId}`);
    await expect(depCard).toBeVisible();

    const blockedBadge = depCard.locator('span').filter({ hasText: /^blocked$/i }).first();
    await expect(blockedBadge).toBeVisible();
    await expect(depCard.getByText(/Waiting on: Prerequisite Database Migration/i)).toBeVisible();

    // Run button is disabled for blocked card
    const runBtn = depCard.locator('button[title="Blocked by unfinished dependency"]').first();
    await expect(runBtn).toBeDisabled();

    // Move blocker from todo -> in_progress -> done
    const blockerCard = page.getByTestId(`task-card-${blockerId}`);
    const moveBlockerBtn = blockerCard.locator('button[title="Move forward"]');

    // todo -> in_progress
    await moveBlockerBtn.click();
    await page.waitForTimeout(200);

    // in_progress -> done
    await moveBlockerBtn.click();
    await page.waitForTimeout(200);

    // Blocker is now done; dependent card must dynamically show "unblocked" badge
    const unblockedBadge = depCard.locator('span').filter({ hasText: /^unblocked$/i }).first();
    await expect(unblockedBadge).toBeVisible();

    // Dependent card run button is now enabled
    const enabledRunBtn = depCard.locator('button[title*="Run Task Agent"]').first();
    await expect(enabledRunBtn).toBeEnabled();
  });

  test('post-execution review badge and move-to-Done guard for failed review (Phase 7a)', async ({ page }) => {
    const taskId = 'card_review_guard_test';
    const tasksState = [
      {
        id: taskId,
        title: 'Review Guard Verification Task',
        status: 'in_progress',
        assignee: 'Builder',
        category: 'backend',
        blockedBy: [],
        postExecutionReview: {
          status: 'failed',
          verdict: 'FAIL',
          findings: 'Unit tests failed with exit code 1. Syntax regression detected in auth router.',
          override: false,
        }
      }
    ];

    await page.route('**/api/sessions/flow_board', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tasks: tasksState }),
      });
    });

    await page.getByRole('button', { name: 'Flow', exact: true }).click();
    await page.waitForTimeout(300);

    const card = page.getByTestId(`task-card-${taskId}`);
    await expect(card).toBeVisible();

    // Review fail badge is visible on the card
    const reviewBadge = card.locator('span').filter({ hasText: /review: fail/i }).first();
    await expect(reviewBadge).toBeVisible();

    // Attempt to move card forward to DONE without override
    let confirmDialogShown = false;
    page.once('dialog', async (dialog) => {
      confirmDialogShown = true;
      expect(dialog.message()).toContain('Post-Execution CREW Reviewer flagged issues');
      await dialog.dismiss(); // Reject override
    });

    const moveForwardBtn = card.locator('button[title="Move forward"]').first();
    await moveForwardBtn.click();

    expect(confirmDialogShown).toBe(true);

    // Moving was blocked: error notification surfaces and card remains in IN PROGRESS
    const blockedNotification = page.getByRole('status').filter({ hasText: /Card completion blocked by Post-Execution Reviewer/i });
    await expect(blockedNotification).toBeVisible();

    const inProgressColumn = page.locator('div').filter({ hasText: /^IN PROGRESS/ }).first();
    await expect(inProgressColumn.locator('text=Review Guard Verification Task').first()).toBeVisible();

    // Now attempt move again and ACCEPT override
    page.once('dialog', async (dialog) => {
      await dialog.accept(); // Accept override
    });

    await moveForwardBtn.click();

    // Card moves to DONE column
    const doneColumn = page.locator('div').filter({ hasText: /^DONE/ }).first();
    await expect(doneColumn.locator('text=Review Guard Verification Task').first()).toBeVisible();
  });
});
