import { Router } from 'express';
import type { WorkspaceSandbox } from '../tools';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { threeWayMerge } from '../diff3';
import { runPostExecutionReview } from '../postExecutionReviewer';
import { chatDb, planningV2, getModelClient, isPathInside } from '../server';


export function getPlanRouter(sandbox: WorkspaceSandbox) {
  const router = Router();

router.get('/items/:id/criteria', async (req, res) => {
  try {
    const result = await planningV2().getCriteria(req.params.id);
    res.json({ success: true, task: result.task, criteria: result.criteria });
  } catch (err: any) {
    res.status(404).json({ success: false, error: 'Operation failed.' });
  }
});

router.post('/items/:id/criteria', async (req, res) => {
  try {
    const task = await planningV2().saveCriteria(req.params.id, req.body.criteria);
    res.json({ success: true, task, criteria: task.acceptanceCriteria || [] });
  } catch (err: any) {
    res.status(404).json({ success: false, error: 'Operation failed.' });
  }
});

router.get('/bootstrap', (_req, res) => {
  try {
    res.json({ success: true, fingerprint: planningV2().bootstrapFingerprint() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

router.post('/bootstrap/evaluate', async (_req, res) => {
  try {
    const result = await planningV2().bootstrapEvaluate(getModelClient());
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

router.post('/items/:id/criteria/generate', async (req, res) => {
  try {
    const result = await planningV2().generateCriteria(getModelClient(), req.params.id);
    res.json({ success: true, task: result.task, criteria: result.criteria, usedLlm: result.usedLlm });
  } catch (err: any) {
    res.status(404).json({ success: false, error: 'Operation failed.' });
  }
});

router.post('/items/:id/criteria/enrich', async (req, res) => {
  try {
    const result = await planningV2().enrichCriteria(req.params.id);
    res.json({
      success: true,
      task: result.task,
      criteria: result.task.acceptanceCriteria || [],
      added: result.added,
      candidates: result.candidates
    });
  } catch (err: any) {
    res.status(404).json({ success: false, error: 'Operation failed.' });
  }
});

router.patch('/items/:id/criteria', async (req, res) => {
  try {
    const task = await planningV2().patchCriteria(req.params.id, req.body.criteria || []);
    res.json({ success: true, task, criteria: task.acceptanceCriteria || [] });
  } catch (err: any) {
    res.status(404).json({ success: false, error: 'Operation failed.' });
  }
});

router.post('/items/:id/review', async (req, res) => {
  try {
    const { task } = await planningV2().getCriteria(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    const review = await runPostExecutionReview(sandbox.getWorkspaceRoot(), task, getModelClient());
    const updatedTask = await planningV2().savePostExecutionReview(req.params.id, review);
    res.json({ success: true, task: updatedTask, review });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/items/:id/review/override', async (req, res) => {
  try {
    const updatedTask = await planningV2().overridePostExecutionReview(req.params.id);
    res.json({ success: true, task: updatedTask });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/whats-left', async (req, res) => {
  try {
    const report = await planningV2().whatsLeft(getModelClient(), null);
    res.json({ success: true, report, exportAllowed: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

router.get('/drift', async (_req, res) => {
  try {
    const report = await planningV2().checkDrift(getModelClient());
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

router.get('/todos', async (req, res) => {
  try {
    const ws = (req.query.workspace as string) || (planningV2() as any).workspaceRoot || process.cwd();
    let todos: Array<{ id: string; title: string; category: string; description: string; file: string; line: number }> = [];
    try {
      const { execSync } = await import('child_process');
      const stdout = execSync('git grep -n -I -E "(TODO|FIXME|HACK):" -- ":!node_modules" ":!.git" ":!dist" ":!build" || true', {
        cwd: ws,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      });
      const lines = stdout.split('\n').filter(Boolean);
      todos = lines.slice(0, 50).map((line, idx) => {
        const parts = line.split(':');
        const file = parts[0] || '';
        const lineNum = parseInt(parts[1] || '1', 10);
        const text = parts.slice(2).join(':').trim();
        const cleanTitle = text.replace(/^(\/\*|\/\/|\*|#)\s*/, '').trim() || `Code TODO in ${file}:${lineNum}`;
        let category = 'frontend';
        if (/\b(test|spec|qa)\b/i.test(file + ' ' + cleanTitle)) category = 'testing';
        else if (/\b(auth|sec|perm)\b/i.test(file + ' ' + cleanTitle)) category = 'security';
        else if (/\b(doc|readme)\b/i.test(file + ' ' + cleanTitle)) category = 'docs';
        else if (/\b(server|api|db|backend)\b/i.test(file + ' ' + cleanTitle)) category = 'backend';
        return {
          id: `todo_${Date.now()}_${idx}`,
          title: cleanTitle,
          category,
          description: `Extracted from ${file} line ${lineNum}`,
          file,
          line: lineNum
        };
      });
    } catch {
      // Fallback empty
    }
    res.json({ success: true, todos });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Operation failed.' });
  }
});

router.get('/workspace', (req, res) => {
  try {
    res.json({ success: true, items: planningV2().getWorkspaceItems() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

router.post('/workspace', (req, res) => {
  try {
    planningV2().saveWorkspaceItems(req.body.items || []);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

router.post('/workspace/extract', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }
    const session = await chatDb.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    const items = await planningV2().extractWorkspaceItems(getModelClient(), session.messages || []);
    res.json({ success: true, items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

router.post('/workspace/feasibility', async (req, res) => {
  try {
    const { projectDescription, title, description, category } = req.body;
    if (!title || !description) {
      return res.status(400).json({ success: false, error: 'title and description are required' });
    }
    const result = await planningV2().checkFeasibility(
      getModelClient(),
      projectDescription || '',
      title,
      description,
      category || 'frontend'
    );
    res.json({ success: true, feasibility: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

router.post('ning/import', async (req, res) => {
  const { plan, basePlan, baseLastModified, workspacePaths } = req.body;
  if (!plan) return res.status(400).json({ error: 'plan is required' });
  try {
    const root = sandbox.getWorkspaceRoot();
    const targets = Array.isArray(workspacePaths) && workspacePaths.length > 0 ? workspacePaths : [root];
    
    let finalPlan = plan;
    let conflictDetected = false;

    // 1. Process files and write plans
    for (const targetPath of targets) {
      const resolvedTarget = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(root, targetPath);
      if (!isPathInside(root, resolvedTarget)) {
        return res.status(403).json({ error: `Access Denied: Path "${targetPath}" is outside the active workspace root.` });
      }
      sandbox.whitelistDirectory(resolvedTarget);
      if (fs.existsSync(resolvedTarget)) {
        const planPath = path.join(resolvedTarget, 'implementation_plan.md');
        
        let shouldMerge = false;
        let currentDiskContent = '';
        
        if (fs.existsSync(planPath) && baseLastModified && basePlan !== undefined) {
          const stats = fs.statSync(planPath);
          const currentLastModified = stats.mtime.toISOString();
          if (currentLastModified !== baseLastModified) {
            shouldMerge = true;
            currentDiskContent = fs.readFileSync(planPath, 'utf-8');
          }
        }

        if (shouldMerge) {
          const mergeResult = threeWayMerge(basePlan, plan, currentDiskContent);
          finalPlan = mergeResult.merged;
          if (mergeResult.hasConflicts) {
            conflictDetected = true;
          }
        }

        fs.writeFileSync(planPath, finalPlan, 'utf-8');
      }
    }

    // Dependency reconciliation scan across package.json targets
    const pkgDataMap = new Map<string, any>();
    for (const targetPath of targets) {
      const resolvedTarget = path.isAbsolute(targetPath) ? targetPath : path.resolve(root, targetPath);
      const pkgPath = path.join(resolvedTarget, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const content = fs.readFileSync(pkgPath, 'utf-8');
          pkgDataMap.set(resolvedTarget, JSON.parse(content));
        } catch {}
      }
    }

    const depConflicts: Array<{ package: string; targetA: string; versionA: string; targetB: string; versionB: string }> = [];
    if (pkgDataMap.size > 1) {
      const workspaces = Array.from(pkgDataMap.keys());
      const allDeps = new Map<string, Map<string, string>>();

      for (const [targetPath, pkgJson] of pkgDataMap.entries()) {
        const combine = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
        for (const [name, version] of Object.entries(combine)) {
          if (!allDeps.has(name)) allDeps.set(name, new Map());
          allDeps.get(name)!.set(targetPath, version as string);
        }
      }

      for (const [name, versionMap] of allDeps.entries()) {
        if (versionMap.size > 1) {
          const versions = Array.from(versionMap.entries());
          const firstVal = versions[0][1];
          for (let i = 1; i < versions.length; i++) {
            if (versions[i][1] !== firstVal) {
              depConflicts.push({
                package: name,
                targetA: path.basename(versions[0][0]),
                versionA: firstVal,
                targetB: path.basename(versions[i][0]),
                versionB: versions[i][1]
              });
            }
          }
        }
      }

      if (depConflicts.length > 0) {
        let reportContent = '# Dependency Reconciliation Report\n\n';
        reportContent += 'The following dependency conflicts were detected across your target microservices/repositories:\n\n';
        reportContent += '| Package | Workspace A | Version A | Workspace B | Version B |\n';
        reportContent += '| :--- | :--- | :--- | :--- | :--- |\n';
        for (const conflict of depConflicts) {
          reportContent += `| \`${conflict.package}\` | \`${conflict.targetA}\` | \`${conflict.versionA}\` | \`${conflict.targetB}\` | \`${conflict.versionB}\` |\n`;
        }
        reportContent += '\n*Action Recommended: Resolve these mismatches to ensure library compatibility.*';

        for (const targetPath of targets) {
          const resolvedTarget = path.isAbsolute(targetPath) ? targetPath : path.resolve(root, targetPath);
          if (fs.existsSync(resolvedTarget)) {
            fs.writeFileSync(path.join(resolvedTarget, 'reconciliation_report.md'), reportContent, 'utf-8');
          }
        }
      }
    }

    // 2. Parse checklist items from the final plan
    const lines = finalPlan.split('\n');
    const tasks: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]') || trimmed.startsWith('- [/]')) {
        const cleanTask = trimmed.replace(/^-\s+\[[ x/]\]\s*/i, '').trim();
        if (cleanTask) tasks.push(cleanTask);
      }
    }
    
    let taskContent = '# Checklist: Imported Planning Tasks\n\n';
    if (tasks.length > 0) {
      taskContent += tasks.map(task => `- [ ] ${task}`).join('\n') + '\n';
    } else {
      taskContent += '- [ ] Complete imported plan implementation\n';
    }

    let newLastModified = '';
    for (const targetPath of targets) {
      const resolvedTarget = path.isAbsolute(targetPath) ? targetPath : path.resolve(root, targetPath);
      if (fs.existsSync(resolvedTarget)) {
        const taskPath = path.join(resolvedTarget, 'task.md');
        fs.writeFileSync(taskPath, taskContent, 'utf-8');

        const planPath = path.join(resolvedTarget, 'implementation_plan.md');
        if (fs.existsSync(planPath)) {
          const stats = fs.statSync(planPath);
          newLastModified = stats.mtime.toISOString();
        }
      }
    }
    
    res.json({ 
      success: true, 
      conflict: conflictDetected,
      depConflicts: depConflicts.length > 0 ? depConflicts : null,
      tasks,
      plan: finalPlan,
      lastModified: newLastModified,
      message: conflictDetected
        ? 'Sync conflict detected! Merge conflict markers have been injected into the plan.'
        : `Plan imported successfully. Files updated in ${targets.length} workspace(s).` 
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

  return router;
}
