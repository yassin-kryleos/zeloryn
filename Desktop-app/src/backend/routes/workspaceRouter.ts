import { Router } from 'express';
import type { WorkspaceSandbox } from '../tools';
import * as path from 'path';
import { terminalManager, setTerminalManager, companionHub, terminalOnCommand, generateWorkspaceGraph } from '../server';
import { TerminalManager } from '../terminalManager';


export function getWorkspaceRouter(sandbox: WorkspaceSandbox) {
  const router = Router();

router.get('/', (_req, res) => {
  res.json({
    workspaceRoot: sandbox.getWorkspaceRoot(),
    defaultWorkspace
  });
});

router.post('/', (req, res) => {
  const { path: newPath } = req.body;
  if (!newPath) {
    return res.status(400).json({ error: 'path is required' });
  }
  try {
    sandbox.setWorkspaceRoot(newPath);
    companionHub.setWorkspaceRoot(newPath);
    setTerminalManager(new TerminalManager({ workspaceRoot: newPath, onCommand: terminalOnCommand, onTerminalOutput: (s: string, d: string) => companionHub.broadcastTerminalOutput(s, d) }));
    res.json({ success: true, workspaceRoot: sandbox.getWorkspaceRoot() });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.post('/revert', async (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }
  try {
    const success = await sandbox.revertFile(filePath);
    res.json({ success, message: success ? `Reverted ${path.basename(filePath)} to snapshot state` : 'No snapshot available for this file' });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.get('/graph', async (req, res) => {
  try {
    const rootPath = sandbox.resolvePath('.');
    const graphData = await generateWorkspaceGraph(rootPath);
    res.json(graphData);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.get('/semantic-cache', async (req, res) => {
  const { query } = req.query;
  if (typeof query !== 'string') return res.status(400).json({ error: 'query string parameter is required' });
  try {
    const results = await sandbox.querySemanticCache(query);
    res.json({ success: true, results });
  } catch (err: any) {
    res.status(403).json({ error: 'Operation failed.' });
  }
});

router.post('/semantic-cache/rebuild', async (req, res) => {
  try {
    const result = await sandbox.buildSemanticCache();
    res.json(result);
  } catch (err: any) {
    res.status(403).json({ error: 'Operation failed.' });
  }
});

router.post('/command-policy', (req, res) => {
  const { allowedPrefixes, blockedPrefixes, userRole } = req.body;
  try {
    if (userRole) {
      sandbox.setUserRole(userRole);
    }
    if (allowedPrefixes || blockedPrefixes) {
      sandbox.setCommandPolicies({ allowedPrefixes, blockedPrefixes });
    }
    res.json({ success: true, message: 'Sandbox command policies updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

  return router;
}
