import { Router } from 'express';
import type { WorkspaceSandbox } from '../tools';
import { mcpClientManager, toolApiGateway } from '../server';


export function getMcpRouter(sandbox: WorkspaceSandbox) {
  const router = Router();

router.get('/servers', (_req, res) => {
  try {
    const servers = mcpClientManager.listServers();
    res.json({ success: true, servers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/servers', (req, res) => {
  const config = req.body;
  if (!config || !config.id || !config.name || !config.transport) {
    return res.status(400).json({ error: 'id, name, and transport are required' });
  }
  try {
    mcpClientManager.addServer({
      id: config.id,
      name: config.name,
      transport: config.transport,
      command: config.command,
      args: config.args,
      url: config.url,
      authTokenRef: config.authTokenRef,
      enabled: config.enabled ?? false,
      discoveryStatus: config.discoveryStatus ?? 'not_started',
      workspaceTrust: config.workspaceTrust ?? 'untrusted',
      featureStatus: config.featureStatus ?? 'preview',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      allowedTools: config.allowedTools,
      deniedTools: config.deniedTools,
    });
    res.json({ success: true, server: mcpClientManager.getServer(config.id) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/servers/:id/discover', async (req, res) => {
  const { id } = req.params;
  try {
    const tools = await mcpClientManager.discoverTools(id, toolApiGateway);
    res.json({ success: true, count: tools.length, tools });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/servers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await mcpClientManager.removeServer(id, toolApiGateway);
    res.json({ success: deleted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

  return router;
}
