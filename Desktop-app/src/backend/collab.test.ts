import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

describe('Dependency Reconciliation & WebRTC Collab Rooms', () => {
  const testDir = path.resolve(__dirname, 'collab-test-temp');

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      await fs.promises.mkdir(testDir, { recursive: true });
    }
  });

  afterAll(async () => {
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should scan and detect version mismatches in multiple package.json targets', async () => {
    const serviceA = path.join(testDir, 'service-a');
    const serviceB = path.join(testDir, 'service-b');

    await fs.promises.mkdir(serviceA, { recursive: true });
    await fs.promises.mkdir(serviceB, { recursive: true });

    const pkgA = {
      dependencies: {
        react: '^18.2.0',
        typescript: '^5.0.0'
      }
    };

    const pkgB = {
      dependencies: {
        react: '^19.0.0', // conflict!
        typescript: '^5.0.0' // matching
      }
    };

    await fs.promises.writeFile(path.join(serviceA, 'package.json'), JSON.stringify(pkgA, null, 2), 'utf-8');
    await fs.promises.writeFile(path.join(serviceB, 'package.json'), JSON.stringify(pkgB, null, 2), 'utf-8');

    // Simulate scanning logic
    const targets = [serviceA, serviceB];
    const pkgDataMap = new Map<string, any>();

    for (const targetPath of targets) {
      const pkgPath = path.join(targetPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const content = fs.readFileSync(pkgPath, 'utf-8');
        pkgDataMap.set(targetPath, JSON.parse(content));
      }
    }

    const depConflicts: Array<{ package: string; targetA: string; versionA: string; targetB: string; versionB: string }> = [];
    if (pkgDataMap.size > 1) {
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
    }

    expect(depConflicts.length).toBe(1);
    expect(depConflicts[0].package).toBe('react');
    expect(depConflicts[0].versionA).toBe('^18.2.0');
    expect(depConflicts[0].versionB).toBe('^19.0.0');
  });

  it('should register sockets in room and relay collab WebRTC signals', async () => {
    // Spin up test WebSocket Server
    const wss = new WebSocketServer({ port: 8089 });
    const collabRooms = new Map<string, Set<any>>();

    wss.on('connection', (ws) => {
      ws.on('message', (message) => {
        const data = JSON.parse(message.toString());
        if (data.type === 'join_collab_room') {
          const roomToken = data.token;
          if (!collabRooms.has(roomToken)) {
            collabRooms.set(roomToken, new Set());
          }
          collabRooms.get(roomToken)!.add(ws);
          (ws as any).collabRoomToken = roomToken;

          for (const socket of collabRooms.get(roomToken)!) {
            if (socket !== ws && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'collab_peer_joined', message: 'Peer joined' }));
            }
          }
          ws.send(JSON.stringify({ type: 'collab_room_joined', message: 'Room joined' }));
        } else if (data.type === 'collab_signal') {
          const senderRoomToken = (ws as any).collabRoomToken;
          if (senderRoomToken && collabRooms.has(senderRoomToken)) {
            for (const socket of collabRooms.get(senderRoomToken)!) {
              if (socket !== ws && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                  type: 'collab_signal',
                  signal: data.signal,
                  sender: data.sender || 'peer'
                }));
              }
            }
          }
        }
      });

      ws.on('close', () => {
        const roomToken = (ws as any).collabRoomToken;
        if (roomToken && collabRooms.has(roomToken)) {
          collabRooms.get(roomToken)!.delete(ws);
        }
      });
    });

    // Connect Client A and Client B
    const clientA = new WebSocket('ws://localhost:8089');
    const clientB = new WebSocket('ws://localhost:8089');

    await Promise.all([
      new Promise<void>((resolve) => clientA.on('open', resolve)),
      new Promise<void>((resolve) => clientB.on('open', resolve))
    ]);

    // Client A joins room
    const joinPromiseA = new Promise<void>((resolve) => {
      clientA.on('message', (dataStr) => {
        const data = JSON.parse(dataStr.toString());
        if (data.type === 'collab_room_joined') resolve();
      });
    });
    clientA.send(JSON.stringify({ type: 'join_collab_room', token: 'room-token-123' }));
    await joinPromiseA;

    // Client B joins room, client A should get peer joined notification
    const peerJoinedPromiseA = new Promise<void>((resolve) => {
      clientA.on('message', (dataStr) => {
        const data = JSON.parse(dataStr.toString());
        if (data.type === 'collab_peer_joined') resolve();
      });
    });
    clientB.send(JSON.stringify({ type: 'join_collab_room', token: 'room-token-123' }));
    await peerJoinedPromiseA;

    // Client A sends signal, Client B should receive it
    const signalPromiseB = new Promise<any>((resolve) => {
      clientB.on('message', (dataStr) => {
        const data = JSON.parse(dataStr.toString());
        if (data.type === 'collab_signal') resolve(data.signal);
      });
    });
    clientA.send(JSON.stringify({
      type: 'collab_signal',
      signal: { sdp: 'offer-sdp-data' },
      sender: 'client-a'
    }));

    const signalData = await signalPromiseB;
    expect(signalData.sdp).toBe('offer-sdp-data');

    // Cleanup
    clientA.close();
    clientB.close();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
});
