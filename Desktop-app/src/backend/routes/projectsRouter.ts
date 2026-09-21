import { Router } from 'express';
import type { WorkspaceSandbox } from '../tools';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { activeProjectId, setActiveProjectId, dataFilePath } from '../server';
import { getProjects, addProject, updateProject, deleteProject, getActiveProject, setActiveProject } from '../db';

export function getProjectsRouter(sandbox: WorkspaceSandbox) {
  const router = Router();

router.get('/', (req, res) => {
  try {
    const projectsPath = dataFilePath('projects.json');
    let projects = [];
    if (fs.existsSync(projectsPath)) {
      const content = fs.readFileSync(projectsPath, 'utf-8');
      projects = JSON.parse(content || '[]');
    }
    res.json({ success: true, projects });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.post('/create', async (req, res) => {
  const { name, folderPath, gitUrl, description } = req.body;
  if (!name || !folderPath) {
    return res.status(400).json({ error: 'name and folderPath are required' });
  }

  try {
    const resolvedPath = path.resolve(folderPath);
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }

    const projectsPath = dataFilePath('projects.json');
    let projects: any[] = [];
    if (fs.existsSync(projectsPath)) {
      const content = fs.readFileSync(projectsPath, 'utf-8');
      projects = JSON.parse(content || '[]');
    }

    const newProject = {
      id: `project_${Date.now()}`,
      name,
      workspaceFolder: resolvedPath,
      gitUrl: gitUrl || '',
      description: description || ''
    };

    const finalizeProject = () => {
      // Avoid duplicate folder paths
      const filtered = projects.filter((p: any) => p.workspaceFolder !== resolvedPath);
      filtered.push(newProject);
      fs.writeFileSync(projectsPath, JSON.stringify(filtered, null, 2), 'utf-8');
      sandbox.setWorkspaceRoot(resolvedPath);
      setActiveProjectId(newProject.id);
      res.json({ success: true, project: newProject, workspaceRoot: resolvedPath });
    };

    if (gitUrl && gitUrl.trim()) {
      if (!fs.existsSync(path.join(resolvedPath, '.git'))) {
        execFile('git', ['clone', gitUrl, '.'], { cwd: resolvedPath }, (err, stdout, stderr) => {
          if (err) {
            console.error('Git clone failed:', stderr || err.message);
            newProject.description = `${newProject.description} (Git clone failed — see server log for details)`.trim();
            console.error('Git clone details:', err.message);
          }
          finalizeProject();
        });
        return;
      }
    }

    finalizeProject();
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.post('/active', (req, res) => {
  const { id } = req.body;
  try {
    const projectsPath = dataFilePath('projects.json');
    let projects = [];
    if (fs.existsSync(projectsPath)) {
      const content = fs.readFileSync(projectsPath, 'utf-8');
      projects = JSON.parse(content || '[]');
    }
    const project = projects.find((p: any) => p.id === id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    sandbox.setWorkspaceRoot(project.workspaceFolder);
    setActiveProjectId(project.id);
    planningV2().recoverInterruptedRun().catch(err => console.error('Interrupted trace recovery failed:', err));
    res.json({ success: true, project, workspaceRoot: project.workspaceFolder });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const projectsPath = dataFilePath('projects.json');
    let projects = [];
    if (fs.existsSync(projectsPath)) {
      const content = fs.readFileSync(projectsPath, 'utf-8');
      projects = JSON.parse(content || '[]');
    }
    const updated = projects.filter((p: any) => p.id !== req.params.id);
    fs.writeFileSync(projectsPath, JSON.stringify(updated, null, 2), 'utf-8');
    if (activeProjectId === req.params.id) setActiveProjectId(null);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Operation failed.' });
  }
});

  return router;
}
