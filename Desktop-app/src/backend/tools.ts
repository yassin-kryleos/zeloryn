import * as fs from 'fs';
import * as path from 'path';
import { exec, execFile, type ChildProcess } from 'child_process';
import mammoth from 'mammoth';
// @ts-ignore
import HTMLtoDOCX from 'html-to-docx';

export type ReviewStatus = 'pending' | 'accepted' | 'rejected' | 'reverted' | 'staged';

export interface GitReviewFile {
  id: string;
  file: string;
  state: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  hasWorkingChanges: boolean;
  hasStagedChanges: boolean;
  reviewStatus: ReviewStatus;
  diff: string;
  stagedDiff: string;
  riskNotes: string[];
  updatedAt: string;
}

export interface GitReviewState {
  success: boolean;
  currentBranch: string;
  files: GitReviewFile[];
  message?: string;
}

interface ReviewStoreData {
  version: number;
  records: Record<string, { status: ReviewStatus; updatedAt: string }>;
}

function markdownToHtml(markdown: string): string {
  let html = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Escape raw HTML tags to protect math symbols and code tags from stripping
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (```lang ... ```)
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Headings
  html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
  html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Inline bold/italic/code
  html = html.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');
  html = html.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Process lists and paragraphs
  const lines = html.split('\n');
  let inUl = false;
  let inOl = false;
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if line is already an HTML block tag we created
    const isHtmlBlock = /^(<h[1-6]>|<pre>|<\/pre>|<code>|<\/code>|<ul>|<\/ul>|<ol>|<\/ol>|<li>|<\/li>)/i.test(trimmed);

    // Unordered lists
    const ulMatch = line.match(/^[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (inOl) {
        processedLines.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        processedLines.push('<ul>');
        inUl = true;
      }
      processedLines.push(`<li>${ulMatch[1]}</li>`);
      continue;
    }

    // Ordered lists
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (inUl) {
        processedLines.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        processedLines.push('<ol>');
        inOl = true;
      }
      processedLines.push(`<li>${olMatch[1]}</li>`);
      continue;
    }

    if ((inUl || inOl) && trimmed === '') {
      if (inUl) {
        processedLines.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        processedLines.push('</ol>');
        inOl = false;
      }
      processedLines.push('');
      continue;
    }

    if (trimmed !== '' && !isHtmlBlock && !inUl && !inOl) {
      processedLines.push(`<p>${trimmed}</p>`);
    } else {
      processedLines.push(line);
    }
  }

  if (inUl) processedLines.push('</ul>');
  if (inOl) processedLines.push('</ol>');

  return processedLines.join('\n');
}

// ─── Command classification (security sandbox) ──────────────────────────────
//
// classifyCommand() is the policy core for runCommand()'s blocklist. It is
// also exported for reuse by the companion remote-approval flow (Phase 5),
// which needs `destructive` to gate an extra confirmation step on top of the
// normal approval for phone-originated commands.

export interface CommandClassification {
  blocked: boolean;
  destructive: boolean;
  reason?: string;
}

const HOME_PLACEHOLDER = '<HOME>';
// `/*` and `~/*` (i.e. `<HOME>/*`) are as dangerous as a bare `/` or `~` —
// they wipe everything inside the root or home directory.
const HOME_DANGEROUS_TARGETS = new Set([HOME_PLACEHOLDER, '/', '*', '.', '..', '/*', `${HOME_PLACEHOLDER}/*`]);
const RECURSIVE_DELETE_CMDS = new Set(['rm', 'rmdir', 'del', 'erase']);
const LEADING_DANGER_CMDS = new Set(['kill', 'killall', 'pkill', 'taskkill', 'shutdown', 'reboot', 'poweroff', 'halt']);
const DESTRUCTIVE_GIT_PATTERNS = [/\bgit\s+reset\s+--hard\b/i, /\bgit\s+clean\s+-[a-z]*f/i];
const SQL_DESTRUCTIVE_PATTERN = /\b(drop|truncate)\s+(table|database|schema)\b/i;
const FORMAT_DANGER_PATTERN = /(^|\s)(format\s+[a-z]:|mkfs(?:\.\w+)?\s|diskpart\b)/i;
const FIND_DELETE_PATTERN = /\bfind\b[\s\S]*(-delete\b|-exec\s+rm\b)/i;
// Matches a single `>` redirect, but not `>>` (append) or `>&`/`2>&1`-style
// stream duplication — both of those are common and non-destructive.
const OVERWRITE_REDIRECT_PATTERN = /(?<![<>])>(?!>)(?!&)/;

// Canonicalize home-directory references (~, $HOME, %USERPROFILE%, etc.) to a
// single placeholder so the blocklist below doesn't need a pattern per shell.
function normalizeHomeRefs(command: string): string {
  return command
    .replace(/\$\{HOME\}/gi, HOME_PLACEHOLDER)
    .replace(/\$HOME\b/gi, HOME_PLACEHOLDER)
    .replace(/%USERPROFILE%/gi, HOME_PLACEHOLDER)
    .replace(/\$(?:env:)?USERPROFILE\b/gi, HOME_PLACEHOLDER)
    .replace(/~(?=[\\/]|\s|$)/g, HOME_PLACEHOLDER);
}

// Splits on shell command separators so each sub-command (e.g. in
// `true; rm -rf ~`) is classified independently. Deliberately excludes bare
// `&` (background operator) — splitting on it would also break apart
// `2>&1`-style stream redirections, which are common and non-destructive.
function splitSubcommands(command: string): string[] {
  return command.split(/&&|\|\||[;|\n]/).map(s => s.trim()).filter(Boolean);
}

function stripQuotes(token: string): string {
  if (token.length >= 2) {
    const first = token[0];
    const last = token[token.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return token.slice(1, -1);
    }
  }
  return token;
}

function normalizeTarget(token: string): string {
  const t = stripQuotes(token);
  return t.length > 1 && t.endsWith('/') ? t.slice(0, -1) : t;
}

// Pass-through wrappers that run another command as their argument rather
// than being the security-relevant command themselves, e.g.
// `sudo /usr/bin/rm -rf /`, `env rm -rf /`, `xargs rm -rf`.
const WRAPPER_CMDS = new Set(['sudo', 'doas', 'env', 'xargs']);

// Resolves a token to a bare command name for blocklist matching: strips
// surrounding quotes, a leading backslash (used to bypass shell aliases,
// e.g. `\rm` runs the real `rm` even if `rm` is aliased), any directory
// prefix (e.g. `/usr/bin/rm`, `C:\Windows\System32\taskkill.exe`), and a
// Windows executable extension.
function resolveCmdName(token: string): string {
  let t = stripQuotes(token);
  if (t.startsWith('\\') && !t.startsWith('\\\\')) t = t.slice(1);
  const segments = t.split(/[\\/]+/);
  const name = segments[segments.length - 1].toLowerCase();
  return name.replace(/\.(exe|cmd|bat|com)$/i, '');
}

function classifySubcommand(sub: string): CommandClassification {
  const normalized = normalizeHomeRefs(sub);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { blocked: false, destructive: false };

  let idx = 0;
  let cmd = resolveCmdName(tokens[idx]);

  // Unwrap pass-through wrappers so the blocklist sees the real command,
  // e.g. `sudo /usr/bin/rm -rf /`, `env FOO=bar rm -rf /`, `xargs -n1 rm -rf`.
  let unwraps = 0;
  while (WRAPPER_CMDS.has(cmd) && idx < tokens.length - 1 && unwraps < 8) {
    unwraps++;
    idx++;
    if (cmd === 'env') {
      // skip env's own flags (-i, -0, -u VAR) and VAR=value assignments
      while (idx < tokens.length && (/^-/.test(tokens[idx]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[idx]))) {
        idx++;
      }
    } else {
      // skip the wrapper's own flags (sudo -E, xargs -n1, ...)
      while (idx < tokens.length && /^-/.test(tokens[idx])) {
        idx++;
      }
    }
    if (idx >= tokens.length) return { blocked: false, destructive: false };
    cmd = resolveCmdName(tokens[idx]);
  }
  const argStart = idx + 1;

  // Hard blocks: process/power control as the command itself (not merely
  // appearing somewhere in the string, which previously broke script names
  // like `kill-server.sh`).
  if (LEADING_DANGER_CMDS.has(cmd)) {
    return { blocked: true, destructive: true, reason: `'${cmd}' is not permitted` };
  }

  // Hard blocks: disk-format commands (replaces a bare /\bformat\b/ which
  // broke `git format-patch` / `npm run format`).
  if (FORMAT_DANGER_PATTERN.test(normalized)) {
    return { blocked: true, destructive: true, reason: 'disk-format commands are not permitted' };
  }

  // Hard blocks: find -delete / find -exec rm
  if (FIND_DELETE_PATTERN.test(normalized)) {
    return { blocked: true, destructive: true, reason: 'find -delete / -exec rm is not permitted' };
  }

  // rm / rmdir / del / erase: recursive delete of home/root/wildcard/cwd/parent
  // is a hard block; any other recursive or plain delete is allowed but
  // destructive (extra confirmation for remote approvals).
  if (RECURSIVE_DELETE_CMDS.has(cmd)) {
    const args = tokens.slice(argStart);
    let recursive = false;
    const targets: string[] = [];
    for (const raw of args) {
      const lower = raw.toLowerCase();
      // `-rf`/`--recursive`/Windows `/s` are flags; a bare `/` (root) is a
      // target and must not be mistaken for a Windows-style flag.
      const isUnixFlag = lower.startsWith('-') && lower.length > 1;
      const isWindowsFlag = /^\/[a-z]{1,2}$/.test(lower);
      if (isUnixFlag || isWindowsFlag) {
        if (lower === '--recursive' || lower === '/s' || /^-[a-z]*r[a-z]*$/.test(lower)) {
          recursive = true;
        }
        continue;
      }
      targets.push(normalizeTarget(raw));
    }
    // Windows `rmdir /s` (recursive directory delete) stays a hard block
    // regardless of target — there's no reliable "safe" target to allow it
    // for, and that was the prior behavior.
    if (cmd === 'rmdir' && recursive) {
      return { blocked: true, destructive: true, reason: 'recursive directory removal (rmdir /s) is not permitted' };
    }
    const hitsDangerousTarget = targets.some(t => HOME_DANGEROUS_TARGETS.has(t));
    if (recursive && hitsDangerousTarget) {
      return { blocked: true, destructive: true, reason: `recursive delete of ${targets.join(', ')} is not permitted` };
    }
    if (targets.length > 0) {
      return { blocked: false, destructive: true, reason: `${cmd} removes files or directories` };
    }
  }

  // Destructive-but-allowed: git history/working-tree rewrites.
  if (DESTRUCTIVE_GIT_PATTERNS.some(p => p.test(normalized))) {
    return { blocked: false, destructive: true, reason: 'rewrites or discards working-tree state' };
  }

  // Destructive-but-allowed: DROP/TRUNCATE table/database/schema.
  if (SQL_DESTRUCTIVE_PATTERN.test(normalized)) {
    return { blocked: false, destructive: true, reason: 'drops or truncates a table, database, or schema' };
  }

  // Destructive-but-allowed: `>` overwrite redirect.
  if (OVERWRITE_REDIRECT_PATTERN.test(normalized)) {
    return { blocked: false, destructive: true, reason: 'overwrites a file via redirection' };
  }

  return { blocked: false, destructive: false };
}

// Classifies a (possibly compound) shell command. Each `;`/`&&`/`||`/`|`/`&`
// separated sub-command is checked independently — `true; rm -rf ~` is
// blocked because of its second half. The first hard block short-circuits;
// otherwise `destructive` is the OR of all sub-commands.
export function classifyCommand(command: string): CommandClassification {
  let destructive = false;
  let reason: string | undefined;
  for (const sub of splitSubcommands(command)) {
    const result = classifySubcommand(sub);
    if (result.blocked) return result;
    if (result.destructive && !destructive) {
      destructive = true;
      reason = result.reason;
    }
  }
  return { blocked: false, destructive, reason };
}

export class WorkspaceSandbox {
  private workspaceRoot: string;
  private userTier: string = 'free';
  private whitelistedDirectories: Set<string> = new Set();
  private userRole: 'admin' | 'developer' = 'admin';
  private commandPolicies: { allowedPrefixes?: string[]; blockedPrefixes?: string[] } = {};
  private activeCommandProcesses: Set<ChildProcess> = new Set();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = this.canonicalizePath(path.resolve(workspaceRoot));
    this.whitelistedDirectories.add(this.workspaceRoot);
  }

  private canonicalizePath(targetPath: string): string {
    const resolved = path.resolve(targetPath);
    let existing = resolved;
    const suffix: string[] = [];

    while (!fs.existsSync(existing)) {
      const parent = path.dirname(existing);
      if (parent === existing) break;
      suffix.unshift(path.basename(existing));
      existing = parent;
    }

    let canonicalBase = existing;
    if (fs.existsSync(existing)) {
      try {
        canonicalBase = fs.realpathSync.native(existing);
      } catch {
        canonicalBase = fs.realpathSync(existing);
      }
    }

    return path.resolve(canonicalBase, ...suffix);
  }

  private isWithinRoot(root: string, target: string): boolean {
    const comparisonRoot = process.platform === 'win32' ? root.toLowerCase() : root;
    const comparisonTarget = process.platform === 'win32' ? target.toLowerCase() : target;
    const relative = path.relative(comparisonRoot, comparisonTarget);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
  }

  public setUserTier(tier: string) {
    this.userTier = tier;
  }

  public getUserTier(): string {
    return this.userTier;
  }

  public setUserRole(role: 'admin' | 'developer') {
    this.userRole = role;
  }

  public setCommandPolicies(policies: { allowedPrefixes?: string[]; blockedPrefixes?: string[] }) {
    this.commandPolicies = policies;
  }

  public whitelistDirectory(dirPath: string) {
    const resolved = this.canonicalizePath(dirPath);
    this.whitelistedDirectories.add(resolved);
  }

  public getWhitelistedDirectories(): string[] {
    return Array.from(this.whitelistedDirectories);
  }

  public killActiveProcesses(): number {
    const processes = Array.from(this.activeCommandProcesses);
    for (const child of processes) {
      try {
        if (process.platform === 'win32' && child.pid) {
          execFile('taskkill', ['/pid', String(child.pid), '/T', '/F']);
        } else {
          child.kill('SIGTERM');
        }
      } catch {
        // Ignore processes that have already exited.
      }
    }
    this.activeCommandProcesses.clear();
    return processes.length;
  }

  // Registry of line-level timestamps for LWW conflict resolution
  private lwwRegistry: Map<string, Map<string, number>> = new Map();

  // In-memory snapshots of files before modifications
  private snapshots: Map<string, string> = new Map();

  // Helper to resolve and verify path is within whitelisted directories
  public resolvePath(targetPath: string): string {
    const absolutePath = path.isAbsolute(targetPath)
      ? path.resolve(targetPath) 
      : path.resolve(this.workspaceRoot, targetPath);
    const canonicalPath = this.canonicalizePath(absolutePath);
    
    let isWhitelisted = false;
    for (const allowedDir of this.whitelistedDirectories) {
      if (this.isWithinRoot(allowedDir, canonicalPath)) {
        isWhitelisted = true;
        break;
      }
    }

    if (!isWhitelisted) {
      throw new Error(`Access Denied: Path "${targetPath}" is outside the whitelisted directories: ${Array.from(this.whitelistedDirectories).join(', ')}`);
    }
    return canonicalPath;
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  public setWorkspaceRoot(newRoot: string) {
    const resolved = this.canonicalizePath(newRoot);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`Invalid workspace root: "${newRoot}" must be an existing directory.`);
    }
    this.workspaceRoot = resolved;
    this.whitelistedDirectories = new Set([resolved]);
  }

  private normalizeWorkspacePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/^\.\/+/, '');
  }

  private async execGit(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      execFile('git', args, { cwd: this.workspaceRoot, maxBuffer: 1024 * 1024 * 12 }, (error, stdout, stderr) => {
        const errorCode = error ? Number((error as any).code) || 1 : 0;
        resolve({
          stdout: stdout?.toString() || '',
          stderr: stderr?.toString() || '',
          code: errorCode
        });
      });
    });
  }

  private getReviewStorePath(): string {
    return path.join(this.workspaceRoot, '.kryleos', 'reviews', 'review-state.json');
  }

  private async readReviewStore(): Promise<ReviewStoreData> {
    const storePath = this.getReviewStorePath();
    try {
      const content = await fs.promises.readFile(storePath, 'utf-8');
      const parsed = JSON.parse(content) as ReviewStoreData;
      return {
        version: parsed.version || 1,
        records: parsed.records || {}
      };
    } catch {
      return { version: 1, records: {} };
    }
  }

  private async writeReviewStore(store: ReviewStoreData): Promise<void> {
    const storePath = this.getReviewStorePath();
    await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
    await fs.promises.writeFile(storePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  private detectReviewRisks(filePath: string, diff: string): string[] {
    const risks: string[] = [];
    const lowerPath = filePath.toLowerCase();
    const lowerDiff = diff.toLowerCase();
    const addedLines = diff.split(/\r?\n/).filter(line => line.startsWith('+') && !line.startsWith('+++')).length;
    const removedLines = diff.split(/\r?\n/).filter(line => line.startsWith('-') && !line.startsWith('---')).length;

    if (/\b(env|secret|token|api[_-]?key|password|credential|\.pem)\b/.test(lowerPath) || /\b(secret|token|api[_-]?key|password|credential)\b/.test(lowerDiff)) {
      risks.push('Sensitive config or credential-like text changed');
    }

    if (/(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|vite\.config|tsconfig|electron|server\.ts)$/.test(lowerPath)) {
      risks.push('Build, dependency, or runtime configuration touched');
    }

    if (addedLines >= 80 || removedLines >= 40) {
      risks.push('Large change; inspect before staging or committing');
    }

    if (/auth|billing|sync|permission|sandbox|delete|remove|credential|token/.test(lowerDiff)) {
      risks.push('Security, billing, sync, or destructive behavior may be affected');
    }

    return risks;
  }

  private async createUntrackedDiff(filePath: string): Promise<string> {
    try {
      const content = await this.readFile(filePath);
      const lines = content.split(/\r?\n/).slice(0, 500);
      const suffix = content.split(/\r?\n/).length > 500 ? '\n+[Review truncated: file is larger than 500 lines]' : '';
      return [`diff --git a/${filePath} b/${filePath}`, 'new file mode 100644', '--- /dev/null', `+++ b/${filePath}`, ...lines.map(line => `+${line}`)].join('\n') + suffix;
    } catch (err: any) {
      return `diff --git a/${filePath} b/${filePath}\n--- /dev/null\n+++ b/${filePath}\n+Unable to preview untracked file: ${err.message}`;
    }
  }

  private parsePorcelainPath(rawPath: string): string {
    const renameArrow = rawPath.indexOf(' -> ');
    const filePath = renameArrow >= 0 ? rawPath.slice(renameArrow + 4) : rawPath;
    return this.normalizeWorkspacePath(filePath.replace(/^"|"$/g, ''));
  }

  public async readFile(filePath: string): Promise<string> {
    const resolved = this.resolvePath(filePath);
    if (filePath.toLowerCase().endsWith('.docx')) {
      // @ts-ignore
      const result = await mammoth.convertToMarkdown({ path: resolved });
      return result.value;
    }
    return fs.promises.readFile(resolved, 'utf-8');
  }

  public async mergeAndWriteFile(filePath: string, newContent: string): Promise<string> {
    const resolved = this.resolvePath(filePath);
    let currentContent = '';
    try {
      currentContent = await this.readFile(filePath);
    } catch {
      // File doesn't exist yet
    }

    if (!currentContent) {
      await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
      if (filePath.toLowerCase().endsWith('.docx')) {
        const html = markdownToHtml(newContent);
        const docxBuffer = await HTMLtoDOCX(html);
        await fs.promises.writeFile(resolved, docxBuffer);
      } else {
        await fs.promises.writeFile(resolved, newContent, 'utf-8');
      }
      return newContent;
    }

    const currentLines = currentContent.split(/\r?\n/);
    const newLines = newContent.split(/\r?\n/);

    if (!this.lwwRegistry.has(filePath)) {
      this.lwwRegistry.set(filePath, new Map());
    }
    const fileMap = this.lwwRegistry.get(filePath)!;
    const now = Date.now();

    // Register timestamps for new lines
    newLines.forEach(line => {
      if (!fileMap.has(line)) {
        fileMap.set(line, now);
      }
    });

    const mergedLines: string[] = [];
    const newLineSet = new Set(newLines);

    // Retain lines from current file that were modified recently (e.g. within 3 seconds)
    currentLines.forEach(line => {
      const lineTime = fileMap.get(line) || 0;
      if (!newLineSet.has(line) && (now - lineTime < 3000)) {
        mergedLines.push(line);
      }
    });

    // Append incoming new lines
    newLines.forEach(line => {
      mergedLines.push(line);
    });

    // Deduplicate consecutive identical lines
    const finalLines: string[] = [];
    mergedLines.forEach((line, idx) => {
      if (idx === 0 || line !== mergedLines[idx - 1]) {
        finalLines.push(line);
      }
    });

    const mergedContent = finalLines.join('\n');
    await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
    if (filePath.toLowerCase().endsWith('.docx')) {
      const html = markdownToHtml(mergedContent);
      const docxBuffer = await HTMLtoDOCX(html);
      await fs.promises.writeFile(resolved, docxBuffer);
    } else {
      await fs.promises.writeFile(resolved, mergedContent, 'utf-8');
    }
    return mergedContent;
  }

  public async createSnapshot(filePath: string, content: string): Promise<void> {
    if (!this.snapshots.has(filePath)) {
      this.snapshots.set(filePath, content);
    }
  }

  public async revertFile(filePath: string): Promise<boolean> {
    if (!this.snapshots.has(filePath)) {
      return false;
    }
    const resolved = this.resolvePath(filePath);
    const originalContent = this.snapshots.get(filePath)!;
    if (filePath.toLowerCase().endsWith('.docx')) {
      const html = markdownToHtml(originalContent);
      const docxBuffer = await HTMLtoDOCX(html);
      await fs.promises.writeFile(resolved, docxBuffer);
    } else {
      await fs.promises.writeFile(resolved, originalContent, 'utf-8');
    }
    this.snapshots.delete(filePath);
    return true;
  }

  public async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const current = await this.readFile(filePath);
      await this.createSnapshot(filePath, current);
    } catch {
      // File doesn't exist yet, no snapshot needed
    }
    await this.mergeAndWriteFile(filePath, content);
  }

  public async listDir(dirPath: string = '.'): Promise<Array<{ name: string; isDirectory: boolean; size?: number }>> {
    const resolved = this.resolvePath(dirPath);
    const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
    
    const results = [];
    for (const entry of entries) {
      const fullPath = path.join(resolved, entry.name);
      let size: number | undefined;
      
      if (entry.isFile()) {
        try {
          const stats = await fs.promises.stat(fullPath);
          size = stats.size;
        } catch {
          // Ignore stats errors
        }
      }
      
      results.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size
      });
    }
    
    return results;
  }

  public async modifyFile(filePath: string, targetContent: string, replacementContent: string): Promise<{ success: boolean; message: string; diff?: string }> {
    const resolved = this.resolvePath(filePath);
    const content = await this.readFile(filePath);
    
    if (!content.includes(targetContent)) {
      if (content.includes(replacementContent)) {
        return {
          success: true,
          message: `Successfully modified ${path.basename(filePath)} (Conflict resolved: Changes already merged by concurrent agent)`
        };
      }
      return {
        success: false,
        message: `Target content not found in ${path.basename(filePath)}`
      };
    }
    
    // Count occurrences
    const occurrences = content.split(targetContent).length - 1;
    if (occurrences > 1) {
      return {
        success: false,
        message: `Target content is not unique in ${path.basename(filePath)} (found ${occurrences} occurrences)`
      };
    }
    
    await this.createSnapshot(filePath, content);
    const updatedContent = content.replace(targetContent, replacementContent);
    
    // Write using LWW-CRDT sync
    await this.mergeAndWriteFile(filePath, updatedContent);

    const targetLines = targetContent.split(/\r?\n/);
    const replacementLines = replacementContent.split(/\r?\n/);
    const diffLines: string[] = [];
    targetLines.forEach(line => diffLines.push(`-${line}`));
    replacementLines.forEach(line => diffLines.push(`+${line}`));

    return {
      success: true,
      message: `Successfully modified ${path.basename(filePath)}`,
      diff: diffLines.join('\n')
    };
  }

  public async grepSearch(query: string, dirPath: string = '.'): Promise<Array<{ file: string; line: number; content: string }>> {
    const resolved = this.resolvePath(dirPath);
    
    interface MatchResult {
      file: string;
      line: number;
      content: string;
      score: number;
    }
    
    const results: MatchResult[] = [];
    
    const queryTerms = query.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean);
    if (queryTerms.length === 0) return [];

    const searchDirectory = async (currentDir: string) => {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        // Skip node_modules, .git, dist, etc.
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.gemini'].includes(entry.name)) {
            continue;
          }
          await searchDirectory(fullPath);
        } else if (entry.isFile()) {
          // Only search text-like files
          const ext = path.extname(entry.name).toLowerCase();
          if (['.js', '.ts', '.tsx', '.jsx', '.css', '.html', '.json', '.md', '.txt', '.yaml', '.yml', '.env'].includes(ext)) {
            try {
              const fileContent = await fs.promises.readFile(fullPath, 'utf-8');
              const lines = fileContent.split('\n');
              lines.forEach((line, index) => {
                const lowerLine = line.toLowerCase();
                let score = 0;
                let matchedAny = false;

                // 1. Check full exact phrase match (high boost)
                if (lowerLine.includes(query.toLowerCase())) {
                  score += 1000;
                  matchedAny = true;
                }

                // 2. Check individual term matches with boundary boosts
                queryTerms.forEach(term => {
                  if (lowerLine.includes(term)) {
                    matchedAny = true;
                    score += 10; // base term match

                    // Word boundary check
                    const boundaryRegex = new RegExp(`\\b${term}\\b`, 'i');
                    if (boundaryRegex.test(line)) {
                      score += 15; // boundary match boost
                    }
                  }
                });

                if (matchedAny) {
                  const relativePath = path.relative(this.workspaceRoot, fullPath);
                  results.push({
                    file: relativePath.replace(/\\/g, '/'),
                    line: index + 1,
                    content: line.trim(),
                    score
                  });
                }
              });
            } catch {
              // Ignore read errors
            }
          }
        }
      }
    };

    await searchDirectory(resolved);
    results.sort((a, b) => b.score - a.score);

    return results.map(r => ({
      file: r.file,
      line: r.line,
      content: r.content
    })).slice(0, 100);
  }

  public async buildSemanticCache(): Promise<{ success: boolean; count: number }> {
    if (this.userTier !== 'pro' && this.userTier !== 'enterprise') {
      throw new Error("Access Denied: Semantic Indexing is gated behind Pro/Enterprise tiers.");
    }
    
    const results: Record<string, { symbols: Array<{ name: string; type: string; line: number; signature: string }> }> = {};
    let count = 0;

    const searchDirectory = async (currentDir: string) => {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.gemini'].includes(entry.name)) {
            continue;
          }
          await searchDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            try {
              const content = await fs.promises.readFile(fullPath, 'utf-8');
              const fileLines = content.split('\n');
              const symbols: Array<{ name: string; type: string; line: number; signature: string }> = [];

              fileLines.forEach((line, index) => {
                const trimmed = line.trim();
                const funcMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
                const classMatch = trimmed.match(/(?:export\s+)?class\s+([a-zA-Z0-9_]+)/);
                const typeMatch = trimmed.match(/(?:export\s+)?(?:interface|type)\s+([a-zA-Z0-9_]+)/);
                const arrowMatch = trimmed.match(/(?:export\s+)?const\s+([a-zA-Z0-9_]+)\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/);

                if (funcMatch) {
                  symbols.push({ name: funcMatch[1], type: 'function', line: index + 1, signature: trimmed });
                } else if (classMatch) {
                  symbols.push({ name: classMatch[1], type: 'class', line: index + 1, signature: trimmed });
                } else if (typeMatch) {
                  symbols.push({ name: typeMatch[1], type: 'type', line: index + 1, signature: trimmed });
                } else if (arrowMatch) {
                  symbols.push({ name: arrowMatch[1], type: 'arrow-function', line: index + 1, signature: trimmed });
                }
              });

              if (symbols.length > 0) {
                const rel = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
                results[rel] = { symbols };
                count += symbols.length;
              }
            } catch {}
          }
        }
      }
    };

    await searchDirectory(this.workspaceRoot);
    const cachePath = path.join(this.workspaceRoot, '.matrix_semantic_cache.json');
    await fs.promises.writeFile(cachePath, JSON.stringify(results, null, 2), 'utf-8');
    return { success: true, count };
  }

  public async querySemanticCache(query: string): Promise<Array<{ file: string; symbol: string; type: string; line: number; signature: string }>> {
    if (this.userTier !== 'pro' && this.userTier !== 'enterprise') {
      throw new Error("Access Denied: Semantic Indexing is gated behind Pro/Enterprise tiers.");
    }
    
    const cachePath = path.join(this.workspaceRoot, '.matrix_semantic_cache.json');
    if (!fs.existsSync(cachePath)) {
      return [];
    }
    
    const content = await fs.promises.readFile(cachePath, 'utf-8');
    const cacheData = JSON.parse(content) as Record<string, { symbols: Array<{ name: string; type: string; line: number; signature: string }> }>;
    const matches: Array<{ file: string; symbol: string; type: string; line: number; signature: string }> = [];
    const lowerQuery = query.toLowerCase();

    for (const [file, data] of Object.entries(cacheData)) {
      for (const sym of data.symbols) {
        if (sym.name.toLowerCase().includes(lowerQuery) || sym.signature.toLowerCase().includes(lowerQuery)) {
          matches.push({
            file,
            symbol: sym.name,
            type: sym.type,
            line: sym.line,
            signature: sym.signature
          });
        }
      }
    }
    return matches;
  }

  public async runCommand(command: string, onStdout?: (data: string) => void, onStderr?: (data: string) => void): Promise<{ stdout: string; stderr: string; code: number | null }> {
    // Command security blacklist check
    const trimmedCommand = command.trim().toLowerCase();
    const classification = classifyCommand(command);
    if (classification.blocked) {
      const errorMsg = 'Error: Command execution blocked by security sandbox policy.';
      if (onStderr) onStderr(errorMsg);
      return {
        stdout: '',
        stderr: errorMsg,
        code: -1
      };
    }

    // RBAC Command Policy check
    const restrictedPrefixes = this.commandPolicies.blockedPrefixes || ['npm publish', 'docker push', 'terraform', 'aws'];
    if (this.userTier === 'enterprise' && this.userRole !== 'admin') {
      const matchesRestricted = restrictedPrefixes.some(prefix => trimmedCommand.startsWith(prefix));
      if (matchesRestricted) {
        const errorMsg = 'Error: Restricted command execution blocked by Enterprise RBAC policy. Requires Administrator permissions.';
        if (onStderr) onStderr(errorMsg);
        return {
          stdout: '',
          stderr: errorMsg,
          code: -1
        };
      }
    }

    if (this.userTier === 'pro' || this.userTier === 'enterprise') {
      onStdout?.(`[REMOTE CONTAINER SIMULATOR ACTIVE] Preview banner only. Commands still run through the current local workspace sandbox; no production remote container is active.\r\n`);
    } else {
      onStdout?.(`[WARNING: LOCAL HOST EXECUTION ACTIVE] Operating on local host OS. Remote Container is a Pro/Enterprise simulator feature until production infrastructure is integrated.\r\n`);
    }

    return new Promise((resolve) => {
      // Execute command in workspace root with 30s timeout and 10MB buffer limits
      const child = exec(command, {
        cwd: this.workspaceRoot,
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024
      });
      this.activeCommandProcesses.add(child);
      
      let stdoutAccum = '';
      let stderrAccum = '';

      child.stdout?.on('data', (data) => {
        const str = data.toString();
        stdoutAccum += str;
        if (onStdout) onStdout(str);
      });

      child.stderr?.on('data', (data) => {
        const str = data.toString();
        stderrAccum += str;
        if (onStderr) onStderr(str);
      });

      child.on('close', async (code) => {
        this.activeCommandProcesses.delete(child);
        if (code !== 0 && (this.userTier === 'pro' || this.userTier === 'enterprise')) {
          onStderr?.(`\r\n[SELF-HEALING] Command execution failed (Exit Code: ${code}). Reverting all file changes made in this session...\r\n`);
          const filePaths = Array.from(this.snapshots.keys());
          for (const file of filePaths) {
            const reverted = await this.revertFile(file);
            if (reverted) {
              onStderr?.(`[SELF-HEALING] Reverted ${file} to baseline snapshot.\r\n`);
            }
          }
        }
        resolve({
          stdout: stdoutAccum,
          stderr: stderrAccum,
          code
        });
      });
      
      child.on('error', (err) => {
        this.activeCommandProcesses.delete(child);
        resolve({
          stdout: stdoutAccum,
          stderr: stderrAccum + `\nExecution Error: ${err.message}`,
          code: -1
        });
      });
    });
  }

  public async gitStatus(): Promise<{ success: boolean; files: Array<{ file: string; state: 'modified' | 'staged' | 'untracked' }>; currentBranch: string }> {
    const statusResult = await this.execGit(['status', '--porcelain', '-b']);
    if (statusResult.code !== 0) {
      return { success: false, files: [], currentBranch: 'detached' };
    }
    const lines = statusResult.stdout.split(/\r?\n/).filter(Boolean);
    const branchLine = lines[0] || '## main';
    const currentBranch = branchLine.startsWith('##') ? branchLine.replace('##', '').split('...')[0].trim() : 'main';

    const files: Array<{ file: string; state: 'modified' | 'staged' | 'untracked' }> = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.length < 4) continue;
      const statusCode = line.substring(0, 2);
      const filePath = this.parsePorcelainPath(line.substring(3).trim());

      let state: 'modified' | 'staged' | 'untracked' = 'modified';
      if (statusCode === '??') {
        state = 'untracked';
      } else if (statusCode[0] !== ' ') {
        state = 'staged';
      } else {
        state = 'modified';
      }

      files.push({ file: filePath, state });
    }

    return { success: true, files, currentBranch };
  }

  public async gitStage(filePath: string): Promise<boolean> {
    const res = await this.execGit(['add', '--', filePath]);
    return res.code === 0;
  }

  public async gitUnstage(filePath: string): Promise<boolean> {
    const res = await this.execGit(['restore', '--staged', '--', filePath]);
    return res.code === 0;
  }

  public async setReviewStatus(filePath: string, status: ReviewStatus): Promise<{ success: boolean; record: { status: ReviewStatus; updatedAt: string } }> {
    const normalizedPath = this.normalizeWorkspacePath(filePath);
    const store = await this.readReviewStore();
    const updatedAt = new Date().toISOString();
    store.records[normalizedPath] = { status, updatedAt };
    await this.writeReviewStore(store);
    return { success: true, record: store.records[normalizedPath] };
  }

  public async gitReviewCurrent(): Promise<GitReviewState> {
    const insideGit = await this.execGit(['rev-parse', '--is-inside-work-tree']);
    if (insideGit.code !== 0 || insideGit.stdout.trim() !== 'true') {
      return {
        success: false,
        currentBranch: 'not-a-git-repo',
        files: [],
        message: 'Review requires a Git workspace. Initialize Git or open a repository to enable Git-grade review.'
      };
    }

    const statusResult = await this.execGit(['status', '--porcelain', '-b']);
    if (statusResult.code !== 0) {
      return { success: false, currentBranch: 'detached', files: [], message: statusResult.stderr || 'Unable to read Git status.' };
    }

    const store = await this.readReviewStore();
    const lines = statusResult.stdout.split(/\r?\n/).filter(Boolean);
    const branchLine = lines[0] || '## main';
    const currentBranch = branchLine.startsWith('##') ? branchLine.replace('##', '').split('...')[0].trim() : 'main';
    const files: GitReviewFile[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.length < 4) continue;

      const statusCode = line.substring(0, 2);
      const indexStatus = statusCode[0];
      const workingStatus = statusCode[1];
      const filePath = this.parsePorcelainPath(line.substring(3).trim());
      const normalizedPath = this.normalizeWorkspacePath(filePath);
      const isUntracked = statusCode === '??';
      const hasStagedChanges = !isUntracked && indexStatus !== ' ';
      const hasWorkingChanges = isUntracked || workingStatus !== ' ';

      let state: GitReviewFile['state'] = 'modified';
      if (isUntracked) state = 'untracked';
      else if (indexStatus === 'A') state = 'added';
      else if (indexStatus === 'D' || workingStatus === 'D') state = 'deleted';
      else if (indexStatus === 'R') state = 'renamed';

      const workingDiff = isUntracked
        ? await this.createUntrackedDiff(normalizedPath)
        : hasWorkingChanges
          ? (await this.execGit(['diff', '--', normalizedPath])).stdout
          : '';
      const stagedDiff = hasStagedChanges
        ? (await this.execGit(['diff', '--staged', '--', normalizedPath])).stdout
        : '';
      const combinedDiff = [stagedDiff, workingDiff].filter(Boolean).join('\n');
      const existingRecord = store.records[normalizedPath];
      const reviewStatus: ReviewStatus = existingRecord?.status || (hasStagedChanges && !hasWorkingChanges ? 'staged' : 'pending');

      files.push({
        id: normalizedPath,
        file: normalizedPath,
        state,
        hasWorkingChanges,
        hasStagedChanges,
        reviewStatus,
        diff: workingDiff,
        stagedDiff,
        riskNotes: this.detectReviewRisks(normalizedPath, combinedDiff),
        updatedAt: existingRecord?.updatedAt || new Date().toISOString()
      });
    }

    return { success: true, currentBranch, files };
  }

  public async gitReviewStage(filePath: string, shouldStage: boolean): Promise<{ success: boolean; message: string }> {
    const normalizedPath = this.normalizeWorkspacePath(filePath);
    const success = shouldStage ? await this.gitStage(normalizedPath) : await this.gitUnstage(normalizedPath);
    if (success) {
      await this.setReviewStatus(normalizedPath, shouldStage ? 'staged' : 'pending');
    }
    return {
      success,
      message: success ? `${shouldStage ? 'Staged' : 'Unstaged'} ${normalizedPath}` : `Unable to ${shouldStage ? 'stage' : 'unstage'} ${normalizedPath}`
    };
  }

  public async gitReviewRevert(filePath: string): Promise<{ success: boolean; message: string }> {
    const normalizedPath = this.normalizeWorkspacePath(filePath);
    const statusResult = await this.execGit(['status', '--porcelain', '--', normalizedPath]);
    const statusLine = statusResult.stdout.split(/\r?\n/).find(Boolean);

    if (!statusLine) {
      return { success: false, message: 'No Git-tracked change found for this file' };
    }

    if (statusLine.startsWith('??')) {
      const sourcePath = this.resolvePath(normalizedPath);
      const targetPath = path.join(this.workspaceRoot, '.kryleos', 'reverted', `${Date.now()}-${normalizedPath}`);
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.promises.rename(sourcePath, targetPath);
      await this.setReviewStatus(normalizedPath, 'reverted');
      return { success: true, message: `Moved untracked file to ${path.relative(this.workspaceRoot, targetPath).replace(/\\/g, '/')}` };
    }

    const indexStatus = statusLine[0];

    if (indexStatus !== ' ') {
      await this.execGit(['restore', '--staged', '--', normalizedPath]);
    }

    if (indexStatus === 'A') {
      const sourcePath = this.resolvePath(normalizedPath);
      if (fs.existsSync(sourcePath)) {
        const targetPath = path.join(this.workspaceRoot, '.kryleos', 'reverted', `${Date.now()}-${normalizedPath}`);
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.promises.rename(sourcePath, targetPath);
        await this.setReviewStatus(normalizedPath, 'reverted');
        return { success: true, message: `Moved staged new file to ${path.relative(this.workspaceRoot, targetPath).replace(/\\/g, '/')}` };
      }
    }

    const restoreResult = await this.execGit(['restore', '--', normalizedPath]);
    if (restoreResult.code !== 0 && statusLine[1] !== ' ') {
      return { success: false, message: restoreResult.stderr || `Unable to restore ${normalizedPath}` };
    }

    await this.setReviewStatus(normalizedPath, 'reverted');
    return { success: true, message: `Restored ${normalizedPath} from Git` };
  }

  public async gitCommit(message: string): Promise<{ success: boolean; output: string }> {
    const res = await this.execGit(['commit', '-m', message]);
    return { success: res.code === 0, output: res.code === 0 ? res.stdout : res.stderr };
  }

  public async gitSetRemote(url: string, token?: string): Promise<{ success: boolean; output: string }> {
    let targetUrl = url.trim();
    if (token) {
      if (targetUrl.startsWith('https://')) {
        targetUrl = targetUrl.replace('https://', `https://oauth2:${token}@`);
      } else if (!targetUrl.includes('://')) {
        targetUrl = `https://oauth2:${token}@github.com/${targetUrl}.git`;
      }
    }
    await this.execGit(['remote', 'remove', 'origin']);
    const res = await this.execGit(['remote', 'add', 'origin', targetUrl]);
    return { success: res.code === 0, output: res.code === 0 ? 'Remote origin configured' : res.stderr };
  }

  public async gitPush(branch: string = 'main'): Promise<{ success: boolean; output: string }> {
    const res = await this.execGit(['push', '-u', 'origin', branch]);
    return { success: res.code === 0, output: res.code === 0 ? res.stdout : res.stderr };
  }

  public async gitPull(branch: string = 'main'): Promise<{ success: boolean; output: string }> {
    const res = await this.execGit(['pull', 'origin', branch]);
    return { success: res.code === 0, output: res.code === 0 ? res.stdout : res.stderr };
  }
}
