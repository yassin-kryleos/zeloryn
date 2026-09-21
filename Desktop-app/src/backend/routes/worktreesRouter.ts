import { Router } from 'express';
import type { WorkspaceSandbox } from '../tools';
import { findTaskById } from '../server';


export function getWorktreesRouter(sandbox: WorkspaceSandbox) {
  const router = Router();

router.get('/', async (_req, res) => {
  try {
    const worktrees = await sandbox.listCardWorktrees();
    res.json({ success: true, worktrees });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/card/:taskId', async (req, res) => {
  try {
    const result = await sandbox.createCardWorktree(req.params.taskId, req.body?.branch);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/merge/:taskId', async (req, res) => {
  try {
    let cardData = req.body?.cardData;
    if (!cardData) {
      const task = await findTaskById(req.params.taskId);
      if (task) {
        cardData = {
          title: task.title,
          category: task.category,
          description: (task as any).description || task.title,
          acceptanceCriteria: task.acceptanceCriteria,
          postExecutionReview: task.postExecutionReview
        };
      }
    }
    const result = await sandbox.mergeCardWorktree(req.params.taskId, req.body?.targetBranch, cardData);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:taskId', async (req, res) => {
  try {
    const result = await sandbox.removeCardWorktree(req.params.taskId, req.query?.force === 'true');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/revert/:taskId', async (req, res) => {
  try {
    const result = await sandbox.revertCardWorktree(req.params.taskId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

  return router;
}
