import { Router } from 'express';
import type { WorkspaceSandbox } from '../tools';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { scanSecrets } from '../secretScanner';
import type { Message } from '../db';
import { templates } from '../docs/templates';
import { planningV2, getModelClient, isPathInside } from '../server';


export function getDocsRouter(sandbox: WorkspaceSandbox) {
  const router = Router();

router.get('/templates', (req, res) => {
  res.json({ success: true, templates });
});

router.post('/generate', async (req, res) => {
  const { templateId } = req.body;
  if (!templateId) return res.status(400).json({ success: false, error: 'templateId is required' });

  const selectedTemplate = templates.find(t => t.id === templateId);
  if (!selectedTemplate) return res.status(404).json({ success: false, error: 'Template not found' });

  try {
    const root = sandbox.getWorkspaceRoot();
    const service = planningV2();
    const scan = service.scanDocsContext();
    const client = getModelClient();

    const userPrompt = [
      `You are Kryleos Docs Autopilot. Your task is to generate a professional, production-grade documentation document for this codebase.`,
      `The document to generate is a: **${selectedTemplate.name}**`,
      `Description: ${selectedTemplate.description}`,
      ``,
      `=== CODEBASE CONTEXT ===`,
      `Workspace Directory: ${root}`,
      scan.packageJson ? `Package Manifest: ${JSON.stringify(scan.packageJson, null, 2)}` : '',
      scan.readmeExcerpt ? `README Excerpt:\n${scan.readmeExcerpt}` : '',
      scan.sourceTree ? `Source Tree:\n${scan.sourceTree}` : '',
      `Test Files Found: ${scan.testFilesCount}`,
      scan.recentGitChanges ? `Recent Commits:\n${scan.recentGitChanges}` : '',
      scan.gitStatus ? `Git Status:\n${scan.gitStatus}` : '',
      ``,
      `Write a comprehensive, professional Markdown document for this ${selectedTemplate.name}. Make sure it is detailed, accurate to the codebase details, and complete. Avoid generic placeholders.`
    ].filter(Boolean).join('\n\n');

    const messages: Message[] = [
      { role: 'system', content: 'You generate high-quality technical documentation for codebases. Respond with ONLY the markdown content. Do not write chat intro or outro.' },
      { role: 'user', content: userPrompt }
    ];

    let generatedContent = '';
    await client.chatStream(messages, {
      onContentChunk: (chunk) => { generatedContent += chunk; },
      onComplete: (content) => { generatedContent = content; }
    });

    if (!generatedContent) {
      throw new Error('LLM generated empty response.');
    }

    const { bypassSecrets } = req.body;
    if (!bypassSecrets) {
      const foundSecrets = scanSecrets(generatedContent);
      if (foundSecrets.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Secrets detected in the generated documentation. Document generation blocked.',
          secrets: foundSecrets,
          requiresBypass: true,
          content: generatedContent
        });
      }
    }

    res.json({ success: true, content: generatedContent, defaultPath: `.kryleos/docs/${templateId}.md` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

router.post('/patch', async (req, res) => {
  const { docPath } = req.body;
  if (!docPath) return res.status(400).json({ success: false, error: 'docPath is required' });

  try {
    const root = sandbox.getWorkspaceRoot();
    const absPath = path.isAbsolute(docPath) ? docPath : path.resolve(root, docPath);
    if (!isPathInside(root, absPath)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Path is outside the workspace root.' });
    }
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ success: false, error: 'Documentation file not found.' });
    }

    const currentDocContent = fs.readFileSync(absPath, 'utf-8');

    let gitDiff = '';
    try {
      gitDiff = execSync('git diff HEAD~1 HEAD', { cwd: root, encoding: 'utf-8' }).trim();
    } catch {
      try {
        gitDiff = execSync('git diff', { cwd: root, encoding: 'utf-8' }).trim();
      } catch {}
    }

    if (!gitDiff) {
      return res.json({ success: true, content: currentDocContent, message: 'No modifications found in git history.' });
    }

    const client = getModelClient();

    const userPrompt = [
      `You are Kryleos Docs Autopilot. Your task is to update this existing technical document based on the recent code changes (git diff).`,
      ``,
      `=== EXISTING DOCUMENT ===`,
      currentDocContent,
      ``,
      `=== RECENT CHANGES (GIT DIFF) ===`,
      gitDiff,
      ``,
      `Review the changes and update the document content to accurately reflect them. Keep the formatting and structure. Return the FULL updated Markdown document. Do not include chat intros/outros.`
    ].join('\n\n');

    const messages: Message[] = [
      { role: 'system', content: 'You update technical documentation files based on git diffs. Return the complete updated markdown document only.' },
      { role: 'user', content: userPrompt }
    ];

    let updatedContent = '';
    await client.chatStream(messages, {
      onContentChunk: (chunk) => { updatedContent += chunk; },
      onComplete: (content) => { updatedContent = content; }
    });

    if (!updatedContent) {
      throw new Error('LLM generated empty response.');
    }

    res.json({ success: true, content: updatedContent });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

router.post('/write', async (req, res) => {
  const { docPath, content } = req.body;
  if (!docPath) return res.status(400).json({ success: false, error: 'docPath is required' });
  if (!content) return res.status(400).json({ success: false, error: 'content is required' });

  try {
    const root = sandbox.getWorkspaceRoot();
    const absPath = path.isAbsolute(docPath) ? docPath : path.resolve(root, docPath);
    if (!isPathInside(root, absPath)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Path is outside the workspace root.' });
    }

    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf-8');

    res.json({ success: true, path: path.relative(root, absPath).replace(/\\/g, '/') });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Operation failed.' });
  }
});

  return router;
}
