// CC Deviation Service — captures workspace state before/after a Claude Code
// CLI run, computes per-file deviations from plan intent, and stores them for
// human review in CodeReviewPanel ("CC DEVIATION" tab).
//
// Flow:
//   1. takeSnapshot() before claudeCodeRun — records HEAD sha + dirty files
//   2. claudeCodeRun() executes
//   3. computeDeviations() after — diffs HEAD, subtracts pre-existing dirtiness
//   4. getDeviations() / updateDeviationStatus() — review panel consumes
//
// Storage: JSON file at <workspaceRoot>/.kryleos/cc-deviations.json

import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const MAX_BUFFER = 5 * 1024 * 1024;

export type DeviationStatus = 'pending' | 'accepted' | 'rejected';

export interface DeviationSnapshot {
  id: string;
  timestamp: string;
  planItemId?: string;
  queryText: string;
  workspaceRoot: string;
  headSha: string;
  dirtyFiles: string[];
}

export interface DeviationRecord {
  id: string;
  snapshotId: string;
  file: string;
  action: 'modified' | 'created' | 'deleted';
  diff: string;
  planItemId?: string;
  status: DeviationStatus;
  riskNotes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DeviationStore {
  snapshots: Record<string, DeviationSnapshot>;
  deviations: DeviationRecord[];
}

let store: DeviationStore = { snapshots: {}, deviations: [] };
let storePath: string | null = null;

function normalizePath(p: string): string {
  return path.resolve(p).replace(/\\/g, '/');
}

function execGit(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, maxBuffer: MAX_BUFFER },
      (err, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          code: err && err.code === 'ENOENT' ? 1 : 0,
        });
      },
    );
  });
}

function loadStore(): DeviationStore {
  if (!storePath) return { snapshots: {}, deviations: [] };
  try {
    const data = fs.readFileSync(storePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { snapshots: {}, deviations: [] };
  }
}

function saveStore(s: DeviationStore): void {
  store = s;
  if (storePath) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(s, null, 2), 'utf-8');
  }
}

function generateId(): string {
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseUnifiedDiff(
  diffText: string,
): Array<{ file: string; diff: string; action: 'modified' | 'created' | 'deleted' }> {
  const results: Array<{ file: string; diff: string; action: 'modified' | 'created' | 'deleted' }> = [];
  if (!diffText || diffText.trim() === '') return results;

  const chunks = diffText.split(/\ndiff --git /).filter(Boolean);
  for (const chunk of chunks) {
    const fullContent = chunk.startsWith('diff --git ') ? chunk : `diff --git ${chunk}`;
    const headerLines = fullContent.split('\n');
    const fromToLine = headerLines[0];
    const parts = fromToLine.match(/diff --git a\/(.*) b\/(.*)/);
    if (!parts) continue;
    const file = parts[2].trim();
    let action: 'modified' | 'created' | 'deleted' = 'modified';
    if (fullContent.includes('new file mode')) action = 'created';
    else if (fullContent.includes('deleted file mode')) action = 'deleted';
    results.push({ file, diff: fullContent, action });
  }
  return results;
}

function detectDeviationRisks(file: string, diff: string, ccStdout: string): string[] {
  const risks: string[] = [];
  const lowerFile = file.toLowerCase();
  const lowerStdout = ccStdout.toLowerCase();

  if (/\b(env|secret|token|api[_-]?key|password|credential|\.pem)\b/.test(lowerFile)) {
    risks.push('CC modified sensitive config or credentials');
  }
  if (/package\.json$/.test(lowerFile)) {
    risks.push('CC changed dependencies');
  }
  if (/\.test\.(ts|tsx|js|jsx|py|go|rs)$/.test(lowerFile)) {
    risks.push('CC modified test files');
  }
  if (diff.split('\n').filter((l) => l.startsWith('-')).length >= 30) {
    risks.push('Large deletion — more than 30 lines removed');
  }
  if (lowerStdout.includes('i could not') || lowerStdout.includes('unable to') || lowerStdout.includes('failed')) {
    risks.push('CC reported errors or partial completion in output');
  }

  const mentionedFiles = extractMentionedFiles(ccStdout);
  if (mentionedFiles.length === 0) {
    risks.push('CC did not report which files it changed');
  }
  return risks;
}

function extractMentionedFiles(stdout: string): string[] {
  const files: string[] = [];
  const patterns = [
    /(?:modified|created|updated|wrote|changed)\s+(?:file\s+)?[`"']([a-zA-Z0-9_\-\/.\\]+(?:\.[a-zA-Z0-9]+)?)[`"']/gi,
    /(?:changes\s+(?:to|in)|touched|edited)\s+[`"']([a-zA-Z0-9_\-\/.\\]+(?:\.[a-zA-Z0-9]+)?)[`"']/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(stdout)) !== null) {
      const f = match[1].trim();
      if (f && f.length < 200 && !f.startsWith('--')) {
        files.push(normalizePath(f));
      }
    }
  }
  return [...new Set(files)];
}

export function initDeviationStore(filePath: string): void {
  storePath = filePath;
  store = loadStore();
}

export async function takeSnapshot(opts: {
  workspaceRoot: string;
  planItemId?: string;
  queryText: string;
}): Promise<DeviationSnapshot> {
  const headResult = await execGit(opts.workspaceRoot, ['rev-parse', 'HEAD']);
  const headSha = headResult.stdout.trim() || 'unknown';

  const dirtyResult = await execGit(opts.workspaceRoot, ['diff', '--name-only']);
  const dirtyStagedResult = await execGit(opts.workspaceRoot, ['diff', '--cached', '--name-only']);
  const allDirty = [
    ...dirtyResult.stdout.split(/\r?\n/).filter(Boolean),
    ...dirtyStagedResult.stdout.split(/\r?\n/).filter(Boolean),
  ];
  const uniqueDirty = [...new Set(allDirty)].map((f) => normalizePath(f));

  const snapshot: DeviationSnapshot = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    planItemId: opts.planItemId,
    queryText: opts.queryText,
    workspaceRoot: opts.workspaceRoot,
    headSha,
    dirtyFiles: uniqueDirty,
  };

  const s = loadStore();
  s.snapshots[snapshot.id] = snapshot;
  saveStore(s);
  return snapshot;
}

export async function computeDeviations(
  snapshotId: string,
  ccStdout: string,
): Promise<DeviationRecord[]> {
  const s = loadStore();
  const snapshot = s.snapshots[snapshotId];
  if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);

  const beforeDirty = new Set(snapshot.dirtyFiles.map((f) => normalizePath(f)));

  const diffResult = await execGit(snapshot.workspaceRoot, ['diff', 'HEAD', '--', '.']);
  const fileDiffs = parseUnifiedDiff(diffResult.stdout);

  const records: DeviationRecord[] = [];
  const now = new Date().toISOString();

  for (const { file, diff, action } of fileDiffs) {
    const normalizedFile = normalizePath(file);
    if (beforeDirty.has(normalizedFile)) continue;

    const riskNotes = detectDeviationRisks(file, diff, ccStdout);
    records.push({
      id: generateId(),
      snapshotId,
      file: normalizedFile,
      action,
      diff,
      planItemId: snapshot.planItemId,
      status: 'pending',
      riskNotes,
      createdAt: now,
      updatedAt: now,
    });
  }

  const mentionedFiles = extractMentionedFiles(ccStdout);
  const changedFilesSet = new Set(records.map((r) => normalizePath(r.file)));

  for (const mentioned of mentionedFiles) {
    const normalizedMentioned = normalizePath(mentioned);
    if (!changedFilesSet.has(normalizedMentioned)) {
      records.push({
        id: generateId(),
        snapshotId,
        file: normalizedMentioned,
        action: 'modified',
        diff: '',
        planItemId: snapshot.planItemId,
        status: 'pending',
        riskNotes: ['CC claimed changes but no git diff detected'],
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  s.deviations.push(...records);
  saveStore(s);
  return records;
}

export function getDeviations(opts?: {
  status?: DeviationStatus;
  snapshotId?: string;
}): DeviationRecord[] {
  const s = loadStore();
  let results = [...s.deviations];
  if (opts?.status) results = results.filter((r) => r.status === opts.status);
  if (opts?.snapshotId) results = results.filter((r) => r.snapshotId === opts.snapshotId);
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateDeviationStatus(id: string, status: DeviationStatus): DeviationRecord | null {
  const s = loadStore();
  const record = s.deviations.find((r) => r.id === id);
  if (!record) return null;
  record.status = status;
  record.updatedAt = new Date().toISOString();
  saveStore(s);
  return record;
}

export function getSnapshot(snapshotId: string): DeviationSnapshot | null {
  const s = loadStore();
  return s.snapshots[snapshotId] || null;
}
