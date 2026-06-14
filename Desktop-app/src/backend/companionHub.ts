import { WebSocket } from 'ws';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AgentOrchestrator, type AgentLog } from './agents';
import type { ProjectTask, ExecutionTrace } from './db';
import * as deviceRegistry from './deviceRegistry';
import { getPublicKey, signPayload, verifyEd25519Signature } from './security';

// Phase 5.4: a connection-scoped closure (registered by server.ts) that
// resolves a planItemId to its task, runs it through FORGE, and reports
// progress via `send` — decoupled from any specific WebSocket so a remote
// run can broadcast to all paired companions.
export type ForgeRunner = (planItemId: string, send: (payload: any) => void, deviceId?: string) => Promise<void>;

export class CompanionHub {
  // Maps each connected companion socket to its paired deviceId, or `null`
  // for a connection that has only presented the pairing code so far (legacy
  // web-companion flow, or a mobile device mid-PAIR_DEVICE handshake).
  private activeCompanions = new Map<WebSocket, string | null>();
  private activeOrchestrators = new Map<string, AgentOrchestrator>();
  private activeForgeRunners = new Map<string, ForgeRunner>();
  private pairingCode: string | null = null;
  private pairingSecret: string | null = null;
  private workspaceRoot: string = '';

  // SEC-B4 / SEC-M4: pairing hardening.
  private pairingExpiry = 0;          // epoch ms after which the code is dead
  private failedAttempts = 0;         // consecutive wrong guesses
  private lockedUntil = 0;            // epoch ms; verification refused until then
  // Phase 5.2: the QR/secret path is now the primary pairing flow (manual
  // 6-digit entry is the human fallback), so the window is shortened from
  // 10 minutes to 2 to reduce the brute-force surface.
  private static readonly CODE_TTL_MS = 2 * 60 * 1000;   // code valid 2 minutes
  private static readonly MAX_ATTEMPTS = 5;              // wrong guesses before lockout
  private static readonly LOCKOUT_MS = 60 * 1000;        // lockout window
  private static readonly PAIRING_SECRET_BYTES = 32;

  // Phase 5.3: replay-protection for signed device messages. Nonce -> expiry.
  private usedNonces = new Map<string, number>();
  private static readonly NONCE_TTL_MS = 5 * 60 * 1000;

  constructor() {
    // Phase 5.5: real process telemetry (replaces the previous Math.random()
    // simulation). cpuLoad is the % of wall-clock time this process spent on
    // CPU since the last tick; memoryUsage is RSS in MB.
    let lastCpuUsage = process.cpuUsage();
    let lastCpuTime = Date.now();
    setInterval(() => {
      if (this.activeCompanions.size > 0) {
        const cpuDelta = process.cpuUsage(lastCpuUsage);
        const now = Date.now();
        const elapsedMs = now - lastCpuTime;
        const cpuLoad = elapsedMs > 0
          ? Math.min(100, Math.round(((cpuDelta.user + cpuDelta.system) / 1000 / elapsedMs) * 100))
          : 0;
        lastCpuUsage = process.cpuUsage();
        lastCpuTime = now;
        this.broadcastToCompanions({
          type: 'telemetry_stream',
          cpuLoad,
          memoryUsage: Math.round(process.memoryUsage().rss / (1024 * 1024))
        });
      }
    }, 3000).unref();
  }

  public setWorkspaceRoot(root: string) {
    this.workspaceRoot = root;
  }

  public registerOrchestrator(sessionId: string, orchestrator: AgentOrchestrator) {
    this.activeOrchestrators.set(sessionId, orchestrator);
  }

  public unregisterOrchestrator(sessionId: string) {
    this.activeOrchestrators.delete(sessionId);
  }

  public registerForgeRunner(sessionId: string, runner: ForgeRunner) {
    this.activeForgeRunners.set(sessionId, runner);
  }

  public unregisterForgeRunner(sessionId: string) {
    this.activeForgeRunners.delete(sessionId);
  }

  public generatePairingCode(): string {
    // SEC-B4: cryptographically-secure 6-digit code with a bounded lifetime.
    this.pairingCode = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    // Phase 5.2: companion paired-device handshake secret, carried in the QR
    // payload alongside the human-readable code. Same TTL as the code.
    this.pairingSecret = crypto.randomBytes(CompanionHub.PAIRING_SECRET_BYTES).toString('base64url');
    this.pairingExpiry = Date.now() + CompanionHub.CODE_TTL_MS;
    this.failedAttempts = 0;
    this.lockedUntil = 0;
    return this.pairingCode;
  }

  private ensureFreshPairing(): void {
    // Regenerate if missing or expired so a stale code/secret is never handed out.
    if (!this.pairingCode || Date.now() > this.pairingExpiry) {
      this.generatePairingCode();
    }
  }

  public getPairingCode(): string | null {
    this.ensureFreshPairing();
    return this.pairingCode;
  }

  public getPairingSecret(): string | null {
    this.ensureFreshPairing();
    return this.pairingSecret;
  }

  public getPairingExpiry(): number {
    this.ensureFreshPairing();
    return this.pairingExpiry;
  }

  public verifyPairingCode(code: string): boolean {
    const now = Date.now();
    // SEC-M4: refuse during lockout.
    if (now < this.lockedUntil) return false;
    // SEC-B4: expired or unset codes are invalid.
    if (!this.pairingCode || now > this.pairingExpiry) return false;

    // Constant-time compare; length guard avoids timingSafeEqual throwing.
    const expected = Buffer.from(this.pairingCode);
    const provided = Buffer.from(String(code ?? ''));
    const ok = provided.length === expected.length &&
      crypto.timingSafeEqual(provided, expected);

    if (!ok) {
      this.failedAttempts++;
      if (this.failedAttempts >= CompanionHub.MAX_ATTEMPTS) {
        this.lockedUntil = now + CompanionHub.LOCKOUT_MS;
        this.failedAttempts = 0;
      }
      return false;
    }

    // Success: reset the failure counter. The code is NOT rotated here so that
    // multiple legitimate companions (web + mobile) can pair within the TTL.
    this.failedAttempts = 0;
    return true;
  }

  // Verifies the pairing secret carried in the QR payload, used by
  // PAIR_DEVICE to register a device's public key. Shares the code's TTL but
  // not its lockout counter — PAIR_DEVICE can only be sent over a connection
  // that already passed verifyPairingCode(), so brute-forcing the secret
  // would first require brute-forcing the code (which IS rate-limited).
  public verifyPairingSecret(secret: string): boolean {
    const now = Date.now();
    if (!this.pairingSecret || now > this.pairingExpiry) return false;
    const expected = Buffer.from(this.pairingSecret);
    const provided = Buffer.from(String(secret ?? ''));
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  }

  // Consumes a nonce: returns false (and rejects) if it was already used or
  // is malformed; otherwise records it as used until NONCE_TTL_MS elapses.
  private consumeNonce(nonce: unknown): boolean {
    if (typeof nonce !== 'string' || nonce.length < 8) return false;
    const now = Date.now();
    for (const [used, expiry] of this.usedNonces) {
      if (expiry <= now) this.usedNonces.delete(used);
    }
    if (this.usedNonces.has(nonce)) return false;
    this.usedNonces.set(nonce, now + CompanionHub.NONCE_TTL_MS);
    return true;
  }

  // Verifies a phone-originated action message against the connection's
  // paired device identity (set at PAIR_DEVICE / deviceToken reconnection —
  // never trusted from the message body itself). A connection that has only
  // presented the pairing code (deviceId === null — it hasn't completed
  // PAIR_DEVICE yet) has no registered public key to verify against, so it
  // cannot be authorized for any signed, state-changing remote action;
  // once a connection is bound to a registered device, every such message
  // must carry a valid, fresh-nonce Ed25519 signature over
  // `${deviceId}:${type}:${itemId}:${nonce}`.
  private verifySignedDeviceMessage(ws: WebSocket, type: string, itemId: string, data: any): boolean {
    const deviceId = this.activeCompanions.get(ws);
    if (!deviceId) return false;
    const device = deviceRegistry.getDevice(deviceId);
    if (!device) return false;
    const { signature, nonce } = data;
    if (typeof signature !== 'string' || !signature) return false;
    if (!this.consumeNonce(nonce)) return false;
    const message = `${deviceId}:${type}:${itemId}:${nonce}`;
    return verifyEd25519Signature(device.publicKey, message, signature);
  }

  public handleConnection(ws: WebSocket, req: http.IncomingMessage) {
    const urlObj = new URL(req.url || '', 'http://localhost');
    const code = urlObj.searchParams.get('code');
    const deviceToken = urlObj.searchParams.get('deviceToken');

    let deviceId: string | null = null;

    if (deviceToken) {
      // Reconnection: a previously-paired device authenticates with its
      // device token instead of the (short-lived) pairing code.
      const device = deviceRegistry.getDeviceByToken(deviceToken);
      if (!device) {
        ws.send(JSON.stringify({ type: 'error', code: 'unauthorized', message: 'Invalid or revoked device token.' }));
        ws.close(4001, 'Invalid device token');
        return;
      }
      deviceId = device.deviceId;
      deviceRegistry.touchLastSeen(deviceId);
    } else if (!code || !this.verifyPairingCode(code)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid pairing code.' }));
      ws.close(4001, 'Invalid pairing code');
      return;
    }

    this.activeCompanions.set(ws, deviceId);
    console.log(`Companion paired and connected. Total active: ${this.activeCompanions.size}`);

    // Send initial connection sync status
    ws.send(JSON.stringify({
      type: 'connection_status',
      status: 'paired',
      workspaceRoot: this.workspaceRoot,
      sessionId: 'global_session',
      deviceId
    }));

    ws.on('message', async (message: any) => {
      try {
        const messageStr = typeof message === 'string' ? message : message.toString();
        const data = JSON.parse(messageStr);

        switch (data.type) {
          case 'APPROVE_COMMAND': {
            const { sessionId, commandId } = data;
            const targetSession = sessionId || 'global_session';
            if (!this.verifySignedDeviceMessage(ws, data.type, commandId || '', data)) {
              ws.send(JSON.stringify({ type: 'error', code: 'unauthorized', message: 'Invalid or missing signature.' }));
              console.warn(`Rejected unauthorized APPROVE_COMMAND from device ${this.activeCompanions.get(ws)}`);
              break;
            }
            const orchestrator = this.activeOrchestrators.get(targetSession);
            if (orchestrator && orchestrator.commandPendingApproval) {
              orchestrator.pendingApprovalSource = { source: 'remote', deviceId: this.activeCompanions.get(ws) ?? undefined };
              const pendingId = orchestrator.pendingCommandId;
              if (commandId && commandId !== pendingId) {
                ws.send(JSON.stringify({ type: 'error', message: 'Stale command approval blocked.' }));
                orchestrator.commandPendingApproval.resolve('stale');
              } else {
                orchestrator.commandPendingApproval.resolve('approved');
                this.broadcastToCompanions({
                  type: 'command_status',
                  status: 'approved',
                  commandId
                });
              }
              orchestrator.pendingCommandId = null;
              orchestrator.pendingCommandText = null;
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'No pending command found.' }));
            }
            break;
          }

          case 'REJECT_COMMAND': {
            const { sessionId, commandId } = data;
            const targetSession = sessionId || 'global_session';
            if (!this.verifySignedDeviceMessage(ws, data.type, commandId || '', data)) {
              ws.send(JSON.stringify({ type: 'error', code: 'unauthorized', message: 'Invalid or missing signature.' }));
              console.warn(`Rejected unauthorized REJECT_COMMAND from device ${this.activeCompanions.get(ws)}`);
              break;
            }
            const orchestrator = this.activeOrchestrators.get(targetSession);
            if (orchestrator && orchestrator.commandPendingApproval) {
              orchestrator.pendingApprovalSource = { source: 'remote', deviceId: this.activeCompanions.get(ws) ?? undefined };
              orchestrator.commandPendingApproval.resolve('rejected');
              orchestrator.pendingCommandId = null;
              orchestrator.pendingCommandText = null;
              this.broadcastToCompanions({
                type: 'command_status',
                status: 'rejected',
                commandId
              });
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'No pending command found.' }));
            }
            break;
          }

          case 'STOP_WORKFLOW': {
            const { sessionId } = data;
            const targetSession = sessionId || 'global_session';
            if (!this.verifySignedDeviceMessage(ws, data.type, targetSession, data)) {
              ws.send(JSON.stringify({ type: 'error', code: 'unauthorized', message: 'Invalid or missing signature.' }));
              console.warn(`Rejected unauthorized STOP_WORKFLOW from device ${this.activeCompanions.get(ws)}`);
              break;
            }
            const orchestrator = this.activeOrchestrators.get(targetSession);
            if (orchestrator) {
              orchestrator.pendingApprovalSource = { source: 'remote', deviceId: this.activeCompanions.get(ws) ?? undefined };
              orchestrator.abortExecution();
              this.broadcastToCompanions({
                type: 'workflow_status',
                status: 'stopped',
                message: 'Workflow execution stopped remotely from companion device.'
              });
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'No active workflow found.' }));
            }
            break;
          }

          case 'SYNC_PLANNING_NOTES': {
            const { notes } = data;
            if (notes && this.workspaceRoot) {
              const scratchbookPath = path.join(this.workspaceRoot, '.kryleos', 'scratchbook.txt');
              await fs.promises.mkdir(path.dirname(scratchbookPath), { recursive: true });
              await fs.promises.appendFile(scratchbookPath, `\n\n--- Offline Note Sync (${new Date().toLocaleString()}) ---\n${notes}\n`, 'utf-8');
              ws.send(JSON.stringify({ type: 'status', message: 'Notes synchronized successfully to desktop scratchbook.' }));
              
              // Broadcast update to companions
              this.broadcastToCompanions({
                type: 'notes_synced',
                message: 'Offline planning notes merged.'
              });
            }
            break;
          }

          case 'PAIR_DEVICE': {
            const { deviceId: newDeviceId, publicKey, label, pairingSecret } = data;
            if (!newDeviceId || !publicKey || !pairingSecret) {
              ws.send(JSON.stringify({ type: 'error', code: 'unauthorized', message: 'Malformed PAIR_DEVICE payload.' }));
              break;
            }
            if (!this.verifyPairingSecret(pairingSecret)) {
              ws.send(JSON.stringify({ type: 'error', code: 'unauthorized', message: 'Invalid or expired pairing secret.' }));
              break;
            }
            const deviceToken = deviceRegistry.registerDevice(newDeviceId, publicKey, label || 'Unnamed device');
            this.activeCompanions.set(ws, newDeviceId);
            ws.send(JSON.stringify({
              type: 'device_paired',
              deviceId: newDeviceId,
              deviceToken,
              desktopPublicKey: getPublicKey()
            }));
            break;
          }

          case 'START_FORGE_RUN': {
            const { planItemId, sessionId } = data;
            const targetSession = sessionId || 'global_session';
            if (!planItemId) {
              ws.send(JSON.stringify({ type: 'error', message: 'planItemId is required.' }));
              break;
            }
            if (!this.verifySignedDeviceMessage(ws, data.type, String(planItemId), data)) {
              ws.send(JSON.stringify({ type: 'error', code: 'unauthorized', message: 'Invalid or missing signature.' }));
              console.warn(`Rejected unauthorized START_FORGE_RUN from device ${this.activeCompanions.get(ws)}`);
              break;
            }
            const orchestrator = this.activeOrchestrators.get(targetSession);
            if (orchestrator?.isRunning) {
              ws.send(JSON.stringify({ type: 'error', code: 'run_in_progress', message: 'A FORGE run is already in progress for this session.' }));
              break;
            }
            const runner = this.activeForgeRunners.get(targetSession);
            if (!runner) {
              ws.send(JSON.stringify({ type: 'error', code: 'no_active_session', message: 'No desktop session is available to run this plan item.' }));
              break;
            }
            this.broadcastToCompanions({ type: 'workflow_status', status: 'started', planItemId });
            runner(String(planItemId), (payload) => this.broadcastToCompanions(payload), this.activeCompanions.get(ws) ?? undefined).catch((err: any) => {
              this.broadcastToCompanions({ type: 'error', message: `Remote FORGE run failed: ${err.message}` });
            });
            break;
          }

          default:
            console.log('Unknown message from companion:', data);
        }
      } catch (err: any) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    });

    ws.on('close', () => {
      this.activeCompanions.delete(ws);
      console.log(`Companion disconnected. Remaining: ${this.activeCompanions.size}`);
    });
  }

  // Phase 5.5: pushes real session state (FLOW tasks, FORGE execution
  // traces, agent logs/checklist) to companions outside of the
  // per-FORGE-step `update` stream, so the mobile Live view reflects board
  // and trace changes even when no run is active.
  public broadcastSessionUpdate(payload: {
    logs?: AgentLog[];
    checklist?: string[];
    activeAgent?: string;
    tasks?: ProjectTask[];
    latestTrace?: ExecutionTrace;
  }) {
    this.broadcastToCompanions({ type: 'session_update', ...payload });
  }

  public broadcastToCompanions(payload: any) {
    const dataStr = JSON.stringify(payload);
    for (const ws of this.activeCompanions.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(dataStr);
      }
    }
  }

  public broadcastCommandApprovalRequired(sessionId: string, commandId: string, tool: string, command: string, destructive: boolean) {
    // Phase 5.3: sign so a paired phone can verify this request actually came
    // from this desktop (checked against desktopPublicKey received at pairing).
    const signature = signPayload(`${sessionId}:command_approval_required:${commandId}`);
    this.broadcastToCompanions({
      type: 'command_approval_required',
      sessionId,
      commandId,
      tool,
      command,
      destructive,
      signature
    });
  }

  public getConnectedCount(): number {
    return this.activeCompanions.size;
  }

  public listDevices(): deviceRegistry.PairedDeviceSummary[] {
    return deviceRegistry.listDevices();
  }

  // Revokes a paired device's registry entry and closes its live connection
  // (if currently connected) so a stolen deviceToken stops working immediately.
  public revokeDevice(deviceId: string): boolean {
    const revoked = deviceRegistry.revokeDevice(deviceId);
    for (const [ws, connectedDeviceId] of this.activeCompanions) {
      if (connectedDeviceId === deviceId) {
        ws.send(JSON.stringify({ type: 'error', code: 'unauthorized', message: 'Device revoked.' }));
        ws.close(4001, 'Device revoked');
        this.activeCompanions.delete(ws);
      }
    }
    return revoked;
  }
}

export const companionHub = new CompanionHub();
