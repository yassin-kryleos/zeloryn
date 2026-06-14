import * as vscode from 'vscode';
import WebSocket from 'ws';

const SESSION_ID = 'vscode_agent';

type ReviewFile = {
  file: string;
  state: string;
  reviewStatus: string;
  hasWorkingChanges: boolean;
  hasStagedChanges: boolean;
  riskNotes?: string[];
};

type ReviewState = {
  success: boolean;
  currentBranch?: string;
  files?: ReviewFile[];
  message?: string;
};

type CommandApprovalRequest = {
  tool: string;
  command: string;
  commandId?: string;
};

class ForgeClient {
  public backendUrl(): string {
    return vscode.workspace.getConfiguration('kryleosForge').get('backendUrl', 'http://localhost:3001').replace(/\/$/, '');
  }

  public websocketUrl(): string {
    return this.backendUrl().replace(/^http/i, 'ws');
  }

  public modelConfig(): { model: string; ollamaUrl: string } {
    const config = vscode.workspace.getConfiguration('kryleosForge');
    return {
      model: config.get('model', 'ollama:qwen2.5:7b'),
      ollamaUrl: config.get('ollamaUrl', 'http://localhost:11434')
    };
  }

  public async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.backendUrl()}${path}`);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json() as Promise<T>;
  }

  public async postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.backendUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json() as Promise<T>;
  }

  public async syncWorkspace(folderPath: string): Promise<string> {
    const result = await this.postJson<{ workspaceRoot: string }>('/api/workspace', { path: folderPath });
    return result.workspaceRoot;
  }

  public async reviewCurrent(): Promise<ReviewState> {
    return this.getJson<ReviewState>('/api/review/current');
  }

  public async setReviewStatus(filePath: string, status: 'accepted' | 'rejected'): Promise<void> {
    await this.postJson('/api/review/status', { path: filePath, status });
  }

  public async askForgeAgent(
    prompt: string,
    onEvent: (message: string) => void,
    onApprovalRequired: (request: CommandApprovalRequest) => Promise<boolean>
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.websocketUrl());
      let settled = false;
      let rejected = false;

      const finish = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      ws.on('open', () => {
        const modelConfig = this.modelConfig();
        onEvent(`[config] Using ${modelConfig.model}`);
        ws.send(JSON.stringify({
          type: 'config',
          model: modelConfig.model,
          ollamaUrl: modelConfig.ollamaUrl
        }));
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'query',
            text: prompt,
            sessionId: SESSION_ID,
            space: 'code'
          }));
        }, 250);
      });

      ws.on('message', (raw: unknown) => {
        const text = raw instanceof Buffer ? raw.toString('utf8') : String(raw);
        try {
          const event = JSON.parse(text);
          if (event.type === 'status' && event.message) onEvent(`[status] ${event.message}`);
          if (event.type === 'command_approval_required') {
            const request: CommandApprovalRequest = {
              tool: event.tool || 'runCommand',
              command: event.command || '',
              commandId: event.commandId
            };
            onEvent(`[approval required] ${request.command}`);
            onApprovalRequired(request)
              .then(approved => {
                ws.send(JSON.stringify({
                  type: 'approve_command',
                  approved,
                  commandId: request.commandId
                }));
                onEvent(approved ? '[approval sent] Command approved.' : '[approval sent] Command rejected.');
              })
              .catch(err => {
                onEvent(`[approval error] ${err.message}`);
                ws.send(JSON.stringify({
                  type: 'approve_command',
                  approved: false,
                  commandId: request.commandId
                }));
              });
          }
          if (event.type === 'error' && event.message) {
            onEvent(`[error] ${event.message}`);
            rejected = true;
            reject(new Error(event.message));
          }
          if (event.type === 'execution_trace' && event.message) onEvent(`[trace] ${event.message}`);
          if (event.type === 'update') {
            const logs = Array.isArray(event.logs) ? event.logs.slice(-6) : [];
            for (const log of logs) {
              if (log?.message) onEvent(`[${log.sender || 'forge'}] ${log.message}`);
            }
            if (event.isStreaming === false) {
              ws.close();
              finish();
            }
          }
        } catch {
          onEvent(text);
        }
      });

      ws.on('error', (err: Error) => {
        rejected = true;
        if (!settled) reject(err);
      });

      ws.on('close', () => {
        if (!rejected) finish();
      });
    });
  }

  // Deterministic approval-modal smoke test: drives the backend's real command
  // approval + execution flow for a fixed command. No model/API key involved.
  public async runSmokeCommand(
    command: string,
    onEvent: (message: string) => void,
    onApprovalRequired: (request: CommandApprovalRequest) => Promise<boolean>
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.websocketUrl());
      let settled = false;
      let rejected = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };

      ws.on('open', () => {
        onEvent(`[smoke] requesting approval for "${command}"`);
        ws.send(JSON.stringify({ type: 'smoke_command', command }));
      });

      ws.on('message', (raw: unknown) => {
        const text = raw instanceof Buffer ? raw.toString('utf8') : String(raw);
        try {
          const event = JSON.parse(text);
          if (event.type === 'status' && event.message) onEvent(`[status] ${event.message}`);
          if (event.type === 'command_approval_required') {
            const request: CommandApprovalRequest = {
              tool: event.tool || 'runCommand',
              command: event.command || '',
              commandId: event.commandId
            };
            onEvent(`[approval required] ${request.command}`);
            onApprovalRequired(request)
              .then(approved => {
                ws.send(JSON.stringify({ type: 'approve_command', approved, commandId: request.commandId }));
                onEvent(approved ? '[approval sent] approved' : '[approval sent] rejected');
              })
              .catch(err => {
                onEvent(`[approval error] ${err.message}`);
                ws.send(JSON.stringify({ type: 'approve_command', approved: false, commandId: request.commandId }));
              });
          }
          if (event.type === 'smoke_result') {
            onEvent(`[smoke result] ${event.output || '(no output)'}`);
            ws.close();
            finish();
          }
          if (event.type === 'error' && event.message) {
            onEvent(`[error] ${event.message}`);
            rejected = true;
            ws.close();
            reject(new Error(event.message));
          }
        } catch {
          onEvent(text);
        }
      });

      ws.on('error', (err: Error) => { rejected = true; if (!settled) reject(err); });
      ws.on('close', () => { if (!rejected) finish(); });
    });
  }
}

class ReviewViewProvider {
  private view?: any;
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly client: ForgeClient) {}

  public resolveWebviewView(webviewView: any): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.html('Loading review state...');
    webviewView.webview.onDidReceiveMessage(async (message: any) => {
      if (message?.type === 'refresh') await this.refresh();
      if (message?.type === 'syncWorkspace') {
        await syncWorkspace(this.client, { notify: true, promptForFolder: true });
        await this.refresh();
      }
      if (message?.type === 'setStatus' && message.file && message.status) {
        await this.setStatus(message.file, message.status);
      }
    });
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 5000);
  }

  public dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }

  public async refresh(): Promise<void> {
    if (!this.view) return;
    try {
      const state = await this.client.reviewCurrent();
      this.view.webview.html = this.html('', state);
    } catch (err: any) {
      this.view.webview.html = this.html(`Forge backend offline: ${err.message}`);
    }
  }

  private async setStatus(filePath: string, status: 'accepted' | 'rejected'): Promise<void> {
    if (!this.view) return;
    this.view.webview.html = this.html(`Saving ${status} for ${filePath}...`, undefined, false);
    try {
      await this.client.setReviewStatus(filePath, status);
      await this.refresh();
    } catch (err: any) {
      this.view.webview.html = this.html(`Could not mark ${filePath} ${status}: ${err.message}`);
    }
  }

  private html(message: string, state?: ReviewState, isError = true): string {
    const files = state?.files || [];
    const rows = files.length
      ? files.map(file => this.fileRow(file)).join('')
      : '<div class="empty">No working or staged changes.</div>';
    const header = state
      ? `<div class="meta">Branch: ${escapeHtml(state.currentBranch || 'unknown')} · ${files.length} file(s)</div>`
      : '';
    const controls = `<div class="controls">
      <button class="refresh" data-refresh="1">Refresh</button>
      <button class="refresh" data-sync="1">Sync Workspace</button>
    </div>`;
    const body = message && !state
      ? `<div class="${isError ? 'error' : 'meta'}">${escapeHtml(message)}</div>${controls}<div class="hint">Start the Forge backend on localhost:3001 and open a folder in VS Code if this stays empty.</div>`
      : `${header}${controls}<div class="files">${rows}</div>`;

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { color: var(--vscode-foreground); font-family: var(--vscode-font-family); padding: 10px; }
    button { cursor: pointer; }
    .meta { color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
    .file { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin-bottom: 8px; }
    .name { font-weight: 700; word-break: break-all; }
    .badges { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0; }
    .badge { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 1px 6px; font-size: 11px; }
    .controls, .actions { display: flex; gap: 6px; margin-top: 8px; margin-bottom: 8px; }
    .risk { color: var(--vscode-editorWarning-foreground); font-size: 11px; margin-top: 4px; }
    .error { color: var(--vscode-errorForeground); }
    .empty { color: var(--vscode-descriptionForeground); }
    .hint { color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 8px; }
    .refresh { margin-bottom: 8px; }
  </style>
</head>
<body>
  ${body}
  <script>
    const vscode = acquireVsCodeApi();
    document.body.addEventListener('click', event => {
      const target = event.target;
      if (target?.dataset?.refresh) vscode.postMessage({ type: 'refresh' });
      if (target?.dataset?.sync) vscode.postMessage({ type: 'syncWorkspace' });
      if (target?.dataset?.status) {
        vscode.postMessage({ type: 'setStatus', file: target.dataset.file, status: target.dataset.status });
      }
    });
  </script>
</body>
</html>`;
  }

  private fileRow(file: ReviewFile): string {
    const risks = (file.riskNotes || []).map(note => `<div class="risk">${escapeHtml(note)}</div>`).join('');
    return `<div class="file">
  <div class="name">${escapeHtml(file.file)}</div>
  <div class="badges">
    <span class="badge">${escapeHtml(file.state)}</span>
    <span class="badge">${escapeHtml(file.reviewStatus)}</span>
    ${file.hasStagedChanges ? '<span class="badge">staged</span>' : ''}
    ${file.hasWorkingChanges ? '<span class="badge">working</span>' : ''}
  </div>
  ${risks}
  <div class="actions">
    <button data-status="accepted" data-file="${escapeAttr(file.file)}">Accept</button>
    <button data-status="rejected" data-file="${escapeAttr(file.file)}">Reject</button>
  </div>
</div>`;
  }
}

class ForgeStatus {
  private item: any;
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly client: ForgeClient) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
    this.item.command = 'kryleosForge.syncWorkspace';
    this.item.show();
  }

  public start(): void {
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 5000);
  }

  public dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.item.dispose();
  }

  private async refresh(): Promise<void> {
    try {
      const workspace = await this.client.getJson<{ workspaceRoot: string }>('/api/workspace');
      this.item.text = '$(flame) Forge';
      this.item.tooltip = `Connected to ${workspace.workspaceRoot}`;
    } catch {
      this.item.text = '$(debug-disconnect) Forge';
      this.item.tooltip = 'Kryleos Forge backend offline';
    }
  }
}

export function activate(context: any): void {
  const client = new ForgeClient();
  const output = vscode.window.createOutputChannel('Kryleos Forge');
  const reviewProvider = new ReviewViewProvider(client);
  const status = new ForgeStatus(client);

  context.subscriptions.push(output, reviewProvider, status);
  status.start();

  context.subscriptions.push(vscode.window.registerWebviewViewProvider('kryleosForge.review', reviewProvider));
  context.subscriptions.push(vscode.commands.registerCommand('kryleosForge.syncWorkspace', async () => {
    await syncWorkspace(client, { notify: true, promptForFolder: true });
  }));
  context.subscriptions.push(vscode.commands.registerCommand('kryleosForge.refreshReview', async () => {
    await reviewProvider.refresh();
  }));
  context.subscriptions.push(vscode.commands.registerCommand('kryleosForge.testCommandApproval', async () => {
    output.show(true);
    output.appendLine('[smoke] starting deterministic command-approval test (no model)...');
    try {
      await client.runSmokeCommand(
        'node -v',
        message => output.appendLine(message),
        request => confirmCommandApproval(request, output)
      );
      output.appendLine('[smoke] done.');
    } catch (err: any) {
      output.appendLine(`[smoke] failed: ${err.message}`);
      vscode.window.showErrorMessage(`Forge smoke test failed: ${err.message}. Is the backend running on localhost:3001?`);
    }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('kryleosForge.askForgeAgent', async (arg?: any) => {
    const prompt = typeof arg === 'string' ? arg : await buildPrompt(arg);
    if (!prompt) return;
    output.show(true);
    output.appendLine(`> ${prompt}`);
    try {
      await syncWorkspace(client, { notify: false, promptForFolder: false });
      await client.askForgeAgent(
        prompt,
        message => output.appendLine(message),
        request => confirmCommandApproval(request, output)
      );
      vscode.window.showInformationMessage('Forge agent run completed.');
    } catch (err: any) {
      output.appendLine(`[error] ${err.message}`);
      vscode.window.showErrorMessage(`Forge agent failed: ${err.message}`);
    }
  }));

  const autoSync = vscode.workspace.getConfiguration('kryleosForge').get('autoSyncWorkspace', true);
  if (autoSync) syncWorkspace(client, { notify: false, promptForFolder: false });
}

async function confirmCommandApproval(request: CommandApprovalRequest, output: any): Promise<boolean> {
  output.appendLine('');
  output.appendLine(`Forge requested command approval (${request.tool}):`);
  output.appendLine(request.command);
  const choice = await vscode.window.showWarningMessage(
    `Forge wants to run: ${request.command}`,
    { modal: true, detail: 'Approve only if this command is expected for the active workspace.' },
    'Approve',
    'Reject'
  );
  return choice === 'Approve';
}

export function deactivate(): void {}

async function syncWorkspace(
  client: ForgeClient,
  options: { notify?: boolean; promptForFolder?: boolean } = {}
): Promise<void> {
  const notify = options.notify !== false;
  let folder = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  if (!folder) {
    if (options.promptForFolder) {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Sync Folder to Forge',
        title: 'Select the workspace folder to sync with Kryleos Forge'
      });
      folder = picked?.[0]?.fsPath;
    }
    if (!folder) {
      if (notify) {
        vscode.window.showWarningMessage('Open a folder, or choose one from the Sync Workspace picker, before syncing Kryleos Forge.');
      }
      return;
    }
  }
  try {
    const synced = await client.syncWorkspace(folder);
    if (notify) vscode.window.showInformationMessage(`Kryleos Forge workspace synced: ${synced}`);
  } catch (err: any) {
    if (notify) vscode.window.showErrorMessage(`Could not sync Forge workspace: ${err.message}`);
  }
}

async function buildPrompt(uri?: any): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor;
  const selection = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : '';
  const activeFile = uri?.fsPath || editor?.document?.uri?.fsPath;

  const defaultPrompt = [
    'Review this context and suggest the next implementation step.',
    activeFile ? `File: ${activeFile}` : '',
    selection ? `\nSelected code:\n${selection}` : ''
  ].filter(Boolean).join('\n');

  return vscode.window.showInputBox({
    title: 'Ask Forge Agent',
    prompt: 'Send a context-aware request to the local Forge backend.',
    value: defaultPrompt,
    ignoreFocusOut: true
  });
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
