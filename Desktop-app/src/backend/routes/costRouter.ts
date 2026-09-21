import { Router } from 'express';
import type { WorkspaceSandbox } from '../tools';
import { CostGuard } from '../costGuard';
import { estimateTokens } from '../costGuard';
import { estimateCost } from '../costGuard';
import { activeModel, getProviderForModel } from '../server';


export function getCostRouter(sandbox: WorkspaceSandbox) {
  const router = Router();

router.get('/history', async (req, res) => {
  try {
    const costGuard = new CostGuard(sandbox.getWorkspaceRoot());
    const history = await costGuard.getHistory();
    res.json({ success: true, history, restricted: false });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

router.get('/spend-cap', async (_req, res) => {
  try {
    const costGuard = new CostGuard(sandbox.getWorkspaceRoot());
    const status = await costGuard.checkSpendCap();
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/spend-cap', async (req, res) => {
  try {
    const costGuard = new CostGuard(sandbox.getWorkspaceRoot());
    const updated = await costGuard.setSpendCap(req.body);
    const status = await costGuard.checkSpendCap();
    res.json({ success: true, ...status, cap: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/estimate', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    const activeM = model || activeModel;
    const inputTokens = estimateTokens(prompt);
    const inputCost = estimateCost(prompt, activeM, false);
    res.json({
      success: true,
      inputTokens,
      inputCost,
      model: activeM,
      provider: getProviderForModel(activeM)
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

  return router;
}
