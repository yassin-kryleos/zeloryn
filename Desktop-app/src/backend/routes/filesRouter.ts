import { Router } from 'express';
import type { WorkspaceSandbox } from '../tools';
import * as path from 'path';
import * as fs from 'fs';

export function getFilesRouter(sandbox: WorkspaceSandbox) {
  const router = Router();

router.get('/', async (req, res) => {
  const dirPath = (req.query.path as string) || '.';
  try {
    const list = await sandbox.listDir(dirPath);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.get('/content', async (req, res) => {
  const filePath = (req.query.path as string);
  if (!filePath) {
    return res.status(400).json({ error: 'path query parameter is required' });
  }
  try {
    const content = await sandbox.readFile(filePath);
    const resolvedPath = sandbox.resolvePath(filePath);
    let lastModified = '';
    if (fs.existsSync(resolvedPath)) {
      const stats = fs.statSync(resolvedPath);
      lastModified = stats.mtime.toISOString();
    }
    res.json({ content, lastModified });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.post('/create', async (req, res) => {
  const { path: filePath, isDirectory, content } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }
  try {
    const resolved = sandbox.resolvePath(filePath);
    if (isDirectory) {
      await fs.promises.mkdir(resolved, { recursive: true });
    } else {
      await sandbox.writeFile(filePath, content || '');
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.post('/save', async (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }
  try {
    await sandbox.writeFile(filePath, content || '');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.delete('/', async (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) {
    return res.status(400).json({ error: 'path query parameter is required' });
  }
  try {
    const resolved = sandbox.resolvePath(filePath as string);
    await fs.promises.unlink(resolved);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

  return router;
}
