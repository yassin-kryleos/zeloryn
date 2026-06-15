import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { AgentLog } from './agents';
import type { Message } from './deepseek';

// SEC-B3b: the JSON DB is encrypted at rest. The key must NOT be a hardcoded
// constant (which would be identical across installs and sit in source).
// Instead we use a per-install random 32-byte key persisted with owner-only
// permissions. Data written by the previous constant-key scheme is still
// readable via a legacy-key fallback, and is transparently re-encrypted with
// the per-install key on the next write.
let _dbKeyCache: Buffer | null = null;

function getDbKeyDir(): string {
  if (process.env.KRYLEOS_DATA_DIR) return process.env.KRYLEOS_DATA_DIR;
  if (process.env.KRYLEOS_DB_PATH) return path.dirname(path.resolve(process.env.KRYLEOS_DB_PATH));
  return process.env.USERPROFILE || process.env.HOME || process.cwd();
}

function getDbKey(): Buffer {
  if (_dbKeyCache) return _dbKeyCache;
  const dir = getDbKeyDir();
  const keyPath = path.join(dir, '.kryleos_db.key');
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(keyPath)) {
      const existing = fs.readFileSync(keyPath);
      if (existing.length === 32) {
        _dbKeyCache = existing;
        return existing;
      }
    }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    try { fs.chmodSync(keyPath, 0o600); } catch {}
    _dbKeyCache = key;
    return key;
  } catch {
    // Could not persist — use an ephemeral process key (safe failure: data from
    // this run won't decrypt next run, rather than reverting to a shared key).
    if (!_dbKeyCache) _dbKeyCache = crypto.randomBytes(32);
    return _dbKeyCache;
  }
}

// Legacy constant-derived key, used only to read pre-existing data.
function getLegacyDbKey(): Buffer {
  return crypto.scryptSync(
    process.env.OS_FINGERPRINT || 'kryleos-fallback-key-9988',
    'kryleos-salt-9281',
    32
  );
}

function encryptData(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getDbKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `enc:${iv.toString('hex')}:${encrypted}`;
}

function decryptWith(key: Buffer, iv: Buffer, encryptedText: Buffer): string {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function decryptData(text: string): string {
  if (!text.startsWith('enc:')) {
    return text;
  }
  const parts = text.split(':');
  const iv = Buffer.from(parts[1], 'hex');
  const encryptedText = Buffer.from(parts[2], 'hex');
  try {
    return decryptWith(getDbKey(), iv, encryptedText);
  } catch {
    // Pre-existing data: try the legacy constant key, then re-encrypt on write.
    try {
      return decryptWith(getLegacyDbKey(), iv, encryptedText);
    } catch (err) {
      console.error('Decryption failed, returning raw text:', err);
      return text;
    }
  }
}

export interface ProjectTask {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  assignee?: string;
  category?: string;
  source?: string;
  workspace?: string;
  blockedBy?: string[];
  acceptanceCriteria?: AcceptanceCriterion[];
  driftStatus?: DriftClassification;
  latestTraceId?: string;
  bootstrapLikelyComplete?: boolean;
  lastModified?: string;
  githubIssueNumber?: number;
  githubRepo?: string;
  htmlUrl?: string;
}

export interface PlanWorkspaceItem {
  id: string;
  title: string;
  description: string;
  category: 'frontend' | 'backend' | 'testing' | 'security' | 'docs' | 'infra';
  status: 'draft' | 'ready_for_crew';
  context?: string;
  feasibility?: {
    verdict: 'feasible' | 'needs_clarification' | 'potential_conflict';
    reason: string;
  };
  githubIssueNumber?: number;
  githubRepo?: string;
  htmlUrl?: string;
  acceptanceCriteria?: AcceptanceCriterion[];
}

export type AcceptanceCriterionType = 'file_exists' | 'symbol_exists' | 'git_grep' | 'test_passes' | 'llm_check';
export type CriterionPhase = 'phase1' | 'phase2';
export type CriterionResultStatus = 'pass' | 'fail' | 'unknown';
export type DriftClassification = 'complete' | 'in_progress' | 'not_started' | 'diverged' | 'needs_review' | 'blocked';

export interface AcceptanceCriterion {
  id: string;
  type: AcceptanceCriterionType;
  description: string;
  target: string;
  phase: CriterionPhase;
  status?: CriterionResultStatus;
  evidence?: string;
}

export interface CriterionResult {
  criterionId: string;
  type: AcceptanceCriterionType;
  status: CriterionResultStatus;
  evidence: string;
}

export interface ExecutionTrace {
  id: string;
  planItemId: string;
  timestamp: string;
  filesChanged: string[];
  commandsRun: string[];
  outcomes: string[];
  criteriaResults: CriterionResult[];
  suggestedStatus: 'todo' | 'in_progress' | 'done';
  summary: string;
  mode?: 'live' | 'demo';
  incompleteReason?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  logs: AgentLog[];
  checklist: string[];
  messages?: Message[];
  space: 'code' | 'chat' | 'cowork' | 'project';
  tasks?: ProjectTask[];
  customAgents?: Array<{ name: string; role: string; prompt: string }>;
}

export class ChatDatabase {
  private dbPath: string;
  private cache: Record<string, ChatSession> | null = null;
  // SEC-M5: serialize read-modify-write operations so concurrent saves cannot
  // lost-update each other (cold-cache races would otherwise drop all but the
  // last writer). Mutating ops chain through this promise.
  private opChain: Promise<unknown> = Promise.resolve();

  constructor() {
    const dataRoot = process.env.KRYLEOS_DATA_DIR?.trim();
    this.dbPath = process.env.KRYLEOS_DB_PATH
      || (dataRoot ? path.resolve(dataRoot, 'chat_history.json') : path.resolve(process.cwd(), 'chat_history.json'));
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.opChain.then(fn, fn);
    // Keep the chain alive regardless of individual op success/failure.
    this.opChain = result.then(() => undefined, () => undefined);
    return result;
  }

  private async ensureDbFile(): Promise<void> {
    try {
      await fs.promises.access(this.dbPath);
    } catch {
      await fs.promises.mkdir(path.dirname(this.dbPath), { recursive: true });
      await fs.promises.writeFile(this.dbPath, '{}', 'utf-8');
    }
  }

  private async readDb(): Promise<Record<string, ChatSession>> {
    if (this.cache) {
      return this.cache;
    }
    await this.ensureDbFile();
    try {
      const content = await fs.promises.readFile(this.dbPath, 'utf-8');
      const decrypted = decryptData(content.trim());
      this.cache = JSON.parse(decrypted || '{}');
      return this.cache!;
    } catch (err) {
      console.error('Error reading chat history database, resetting database.', err);
      this.cache = {};
      return this.cache;
    }
  }

  private async writeDb(data: Record<string, ChatSession>): Promise<void> {
    this.cache = data;
    const plainText = JSON.stringify(data, null, 2);
    const encrypted = encryptData(plainText);
    await fs.promises.writeFile(this.dbPath, encrypted, 'utf-8');
  }

  public async listSessions(space?: 'code' | 'chat' | 'cowork' | 'project'): Promise<Array<{ id: string; title: string; createdAt: string }>> {
    const db = await this.readDb();
    return Object.values(db)
      .filter(session => !space || session.space === space)
      .map(session => ({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getSession(id: string): Promise<ChatSession | null> {
    const db = await this.readDb();
    return db[id] || null;
  }

  public async saveSession(session: ChatSession): Promise<void> {
    return this.runExclusive(async () => {
      const db = await this.readDb();
      db[session.id] = session;
      await this.writeDb(db);
    });
  }

  public async deleteSession(id: string): Promise<void> {
    return this.runExclusive(async () => {
      const db = await this.readDb();
      if (db[id]) {
        delete db[id];
        await this.writeDb(db);
      }
    });
  }
}
