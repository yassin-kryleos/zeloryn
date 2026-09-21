import { Router } from 'express';
import type { WorkspaceSandbox } from '../tools';
import { sanitizeTask } from '../planningV2';
import type { ProjectTask } from '../planningV2';
import type { ChatSession } from '../db';
import { chatDb } from '../server';


export function getSessionsRouter(sandbox: WorkspaceSandbox) {
  const router = Router();

router.get('/', async (req, res) => {
  try {
    const list = await chatDb.listSessions(req.query.space as any);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const session = await chatDb.getSession(req.params.id);
    if (!session) {
      if (req.params.id === 'flow_board' || req.params.id.startsWith('flow_board_')) {
        return res.json({
          id: req.params.id,
          title: 'FLOW Board',
          createdAt: new Date().toISOString(),
          logs: [],
          checklist: [],
          space: 'project',
          tasks: []
        });
      }
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await chatDb.deleteSession(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.put('/:id/tasks', async (req, res) => {
  const tasks = req.body?.tasks;
  if (!Array.isArray(tasks)) {
    return res.status(400).json({ success: false, error: 'tasks array is required' });
  }
  try {
    const existing = await chatDb.getSession(req.params.id);
    const session: ChatSession = existing || {
      id: req.params.id,
      title: req.params.id === 'flow_board' ? 'FLOW Board' : 'Project Tasks',
      createdAt: new Date().toISOString(),
      logs: [],
      checklist: [],
      space: 'project' as const,
      tasks: []
    };
    session.tasks = tasks.map(sanitizeTask) as ProjectTask[];
    await chatDb.saveSession(session);
    res.json({ success: true, tasks: session.tasks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

  return router;
}
