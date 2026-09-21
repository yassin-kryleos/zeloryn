import { Router } from 'express';
import type { WorkspaceSandbox } from '../tools';
import * as path from 'path';
import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

export function getGitRouter(sandbox: WorkspaceSandbox) {
  const router = Router();

router.get('/status', async (_req, res) => {
  try {
    const status = await sandbox.gitStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.post('/stage', async (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }
  try {
    const success = await sandbox.gitStage(filePath);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.post('/commit', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }
  try {
    const result = await sandbox.gitCommit(message);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.post('/remote', async (req, res) => {
  const { url, token } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    const result = await sandbox.gitSetRemote(url, token);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.post('/push', async (req, res) => {
  const { branch } = req.body;
  try {
    const result = await sandbox.gitPush(branch || 'main');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.post('/pull', async (req, res) => {
  const { branch } = req.body;
  try {
    const result = await sandbox.gitPull(branch || 'main');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

  return router;
}
