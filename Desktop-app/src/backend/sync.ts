import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Secure password hashing using PBKDF2
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// Simulated-OAuth login is a development convenience only. It is hard-disabled
// in production so the shared literal can never act as an auth bypass on a real
// deployment (SEC-M1). Requires BOTH: NODE_ENV !== 'production' AND the explicit
// opt-in flag OAUTH_SIM_ENABLED=true (must be set in .env — never in production).
// Evaluated dynamically so test suites can control the flag via process.env.
const OAUTH_SIM_SECRETS = new Set(['google-oauth-flow-secret', 'apple-oauth-flow-secret']);
export function isOauthSimSecret(password: string): boolean {
  const enabled =
    process.env.NODE_ENV !== 'production' &&
    process.env.OAUTH_SIM_ENABLED === 'true';
  return enabled && OAUTH_SIM_SECRETS.has(password);
}

// Secure password verification with timing-safe comparison.
// SEC-M1: the plaintext-equality fallback was removed — any non-PBKDF2 stored
// value fails closed. The OAuth simulation path is gated to non-production.
function verifyPassword(password: string, storedHash: string): boolean {
  if (isOauthSimSecret(password) && storedHash === password) {
    return true;
  }

  if (storedHash.includes(':')) {
    try {
      const [salt, hash] = storedHash.split(':');
      if (!salt || !hash) return false;
      const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
      const stored = Buffer.from(hash, 'hex');
      if (stored.length !== derivedKey.length) return false;
      return crypto.timingSafeEqual(stored, derivedKey);
    } catch (e) {
      return false;
    }
  }
  // No plaintext fallback. Unhashed/legacy records fail closed.
  return false;
}

// KRYLEOS_DATA_DIR overrides where the local sync DB lives. Tests set it to a
// temp dir so runs never touch (or depend on) the real home-directory state.
function getPaths() {
  const homeDir = process.env.KRYLEOS_DATA_DIR
    || process.env.USERPROFILE || process.env.HOME || process.cwd();
  return {
    homeDir,
    usersFile: path.join(homeDir, '.kryleos_sync_users.json'),
    syncFile: path.join(homeDir, '.kryleos_sync_state.json')
  };
}

export type SubscriptionTier = 'free' | 'basic' | 'pro' | 'enterprise' | 'solo' | 'solo_plus' | 'founder' | 'agency';

export interface UserAccount {
  email: string;
  passwordHash: string; // Plain password for simulation
  isPremium: boolean;
  tier: SubscriptionTier;
  token: string;
  billingProvider?: 'stripe' | 'razorpay' | 'license';
  billingSubscriptionId?: string;
}

interface SyncPayload {
  lastUpdated: string;
  payload: any;
}

function ensureFiles() {
  const { homeDir, usersFile, syncFile } = getPaths();
  if (!fs.existsSync(homeDir)) {
    fs.mkdirSync(homeDir, { recursive: true });
  }
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, '{}', 'utf-8');
  }
  if (!fs.existsSync(syncFile)) {
    fs.writeFileSync(syncFile, '{}', 'utf-8');
  }
}

export async function readUsers(): Promise<Record<string, UserAccount>> {
  ensureFiles();
  const { usersFile } = getPaths();
  const content = await fs.promises.readFile(usersFile, 'utf-8');
  return JSON.parse(content || '{}');
}

export async function writeUsers(users: Record<string, UserAccount>) {
  ensureFiles();
  const { usersFile } = getPaths();
  await fs.promises.writeFile(usersFile, JSON.stringify(users, null, 2), 'utf-8');
}

// Remove a user from the local sync DB. Used to keep test runs idempotent,
// since the sync DB persists in the user's home directory across runs.
export async function deleteUser(email: string): Promise<void> {
  const users = await readUsers();
  if (users[email.toLowerCase()]) {
    delete users[email.toLowerCase()];
    await writeUsers(users);
  }
}

async function readSyncs(): Promise<Record<string, SyncPayload>> {
  ensureFiles();
  const { syncFile } = getPaths();
  const content = await fs.promises.readFile(syncFile, 'utf-8');
  return JSON.parse(content || '{}');
}

async function writeSyncs(syncs: Record<string, SyncPayload>) {
  ensureFiles();
  const { syncFile } = getPaths();
  await fs.promises.writeFile(syncFile, JSON.stringify(syncs, null, 2), 'utf-8');
}

export async function register(email: string, passwordHash: string): Promise<UserAccount> {
  const users = await readUsers();
  if (users[email.toLowerCase()]) {
    throw new Error('User already exists');
  }

  const token = `token_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`;
  const newUser: UserAccount = {
    email: email.toLowerCase(),
    passwordHash: hashPassword(passwordHash),
    isPremium: false,
    tier: 'free',
    token
  };

  users[email.toLowerCase()] = newUser;
  await writeUsers(users);
  return newUser;
}

export async function login(email: string, passwordHash: string): Promise<UserAccount> {
  const users = await readUsers();

  const isOauth = (email.endsWith('@gmail.com') || email.endsWith('@icloud.com')) &&
                  isOauthSimSecret(passwordHash);

  if (isOauth && !users[email.toLowerCase()]) {
    const token = `token_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`;
    users[email.toLowerCase()] = {
      email: email.toLowerCase(),
      passwordHash,
      isPremium: false,
      tier: 'free',
      token
    };
    await writeUsers(users);
  }

  const user = users[email.toLowerCase()];
  if (!user || !verifyPassword(passwordHash, user.passwordHash)) {
    throw new Error('Invalid credentials');
  }

  // Seamlessly upgrade any legacy non-PBKDF2 hash to PBKDF2 on successful login.
  // (OAuth-sim accounts keep their literal marker so the sim path keeps working.)
  if (!user.passwordHash.includes(':') && !isOauthSimSecret(passwordHash)) {
    user.passwordHash = hashPassword(passwordHash);
  }
  
  // Refresh token securely
  user.token = `token_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`;
  if (!user.tier) {
    user.tier = user.isPremium ? 'basic' : 'free';
  }
  await writeUsers(users);
  return user;
}

export async function subscribe(token: string, tier: SubscriptionTier = 'basic'): Promise<UserAccount> {
  const users = await readUsers();
  const user = Object.values(users).find(u => u.token === token);
  if (!user) {
    throw new Error('Unauthorized');
  }

  user.tier = tier;
  user.isPremium = tier !== 'free';
  await writeUsers(users);
  return user;
}

export async function subscribeByEmail(
  email: string,
  tier: SubscriptionTier = 'basic',
  billing?: { provider: UserAccount['billingProvider']; subscriptionId?: string },
): Promise<UserAccount> {
  const users = await readUsers();
  const user = users[email.toLowerCase()];
  if (!user) {
    throw new Error('User not found');
  }

  user.tier = tier;
  user.isPremium = tier !== 'free';
  if (billing?.provider) user.billingProvider = billing.provider;
  if (billing?.subscriptionId) user.billingSubscriptionId = billing.subscriptionId;
  else if (billing?.provider === 'license') delete user.billingSubscriptionId;
  await writeUsers(users);
  return user;
}

export async function setBillingSubscription(
  token: string,
  provider: Exclude<UserAccount['billingProvider'], undefined>,
  subscriptionId: string,
): Promise<UserAccount> {
  const users = await readUsers();
  const user = Object.values(users).find(u => u.token === token);
  if (!user) throw new Error('Unauthorized');
  user.billingProvider = provider;
  user.billingSubscriptionId = subscriptionId;
  await writeUsers(users);
  return user;
}

export async function getUserByBillingSubscription(subscriptionId: string): Promise<UserAccount | null> {
  const users = await readUsers();
  return Object.values(users).find(u => u.billingSubscriptionId === subscriptionId) || null;
}

export function mergeTasks(incoming: any[], stored: any[]): any[] {
  if (!Array.isArray(incoming)) return stored || [];
  if (!Array.isArray(stored)) return incoming || [];

  const mergedMap = new Map<string | number, any>();

  for (const task of stored) {
    if (task && task.id !== undefined) {
      mergedMap.set(task.id, task);
    }
  }

  for (const task of incoming) {
    if (task && task.id !== undefined) {
      const existing = mergedMap.get(task.id);
      if (!existing) {
        mergedMap.set(task.id, task);
      } else {
        const incomingTime = new Date(task.lastModified || 0).getTime();
        const existingTime = new Date(existing.lastModified || 0).getTime();
        if (incomingTime >= existingTime) {
          mergedMap.set(task.id, task);
        }
      }
    }
  }

  return Array.from(mergedMap.values());
}

export async function pushSync(token: string, payload: any): Promise<string> {
  const users = await readUsers();
  const user = Object.values(users).find(u => u.token === token);
  if (!user) {
    throw new Error('Unauthorized');
  }
  if (!user.tier || user.tier === 'free') {
    throw new Error('Upgrade to a Basic, Pro, or Enterprise subscription to enable Cloud Sync');
  }

  const syncs = await readSyncs();
  const lastUpdated = new Date().toISOString();

  let finalPayload = payload;
  const existingSync = syncs[user.email];
  if (existingSync && existingSync.payload && Array.isArray(payload.tasks)) {
    const mergedTasks = mergeTasks(payload.tasks, existingSync.payload.tasks);
    finalPayload = {
      ...payload,
      tasks: mergedTasks
    };
  }

  syncs[user.email] = {
    lastUpdated,
    payload: finalPayload
  };

  await writeSyncs(syncs);
  return lastUpdated;
}

export async function pullSync(token: string): Promise<{ lastUpdated: string; payload: any } | null> {
  const users = await readUsers();
  const user = Object.values(users).find(u => u.token === token);
  if (!user) {
    throw new Error('Unauthorized');
  }
  if (!user.tier || user.tier === 'free') {
    throw new Error('Upgrade to a Basic, Pro, or Enterprise subscription to enable Cloud Sync');
  }

  const syncs = await readSyncs();
  return syncs[user.email] || null;
}

export async function getUserTier(token: string): Promise<SubscriptionTier> {
  const users = await readUsers();
  const user = Object.values(users).find(u => u.token === token);
  return user ? user.tier : 'free';
}

export async function getUserByToken(token: string): Promise<UserAccount | null> {
  const users = await readUsers();
  const user = Object.values(users).find(u => u.token === token);
  return user || null;
}
