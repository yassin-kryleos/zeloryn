import { spawn } from 'child_process';
import http from 'http';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve ws dynamically from Desktop-app dependencies
const requireFromDesktop = createRequire(path.resolve(__dirname, '..', '..', 'Desktop-app', 'package.json'));
const WebSocket = requireFromDesktop('ws');

// Target port and routes
const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;

console.log('--- STARTING COMPANION E2E PAIRING CHECK ---');

// 1. Spawn server subprocess in Desktop-app
const desktopAppDir = path.resolve(__dirname, '..', '..', 'Desktop-app');
const serverProcess = spawn('npx', ['tsx', 'src/backend/server.ts'], {
  cwd: desktopAppDir,
  env: {
    ...process.env,
    PORT: PORT.toString(),
    NODE_ENV: 'test',
    KRYLEOS_DB_PATH: 'chat_history.test.json',
    KRYLEOS_DATA_DIR: 'qa-db'
  },
  shell: true
});

let serverOutput = '';
serverProcess.stdout.on('data', (data) => {
  serverOutput += data.toString();
  console.log(`[Server]: ${data.toString().trim()}`);
});

serverProcess.stderr.on('data', (data) => {
  console.error(`[Server Error]: ${data.toString().trim()}`);
});

// Helper: Query pairing code from status endpoint
function fetchPairingCode() {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}/api/companion/status`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.code);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

// 2. Wait for server to bind
let attempts = 0;
const maxAttempts = 15;

function checkServerReady() {
  attempts++;
  http.get(`${BASE_URL}/api/sessions`, (res) => {
    console.log('Server is online and listening. Fetching pairing code...');
    runWebSocketPairing();
  }).on('error', () => {
    if (attempts >= maxAttempts) {
      console.error('Server failed to start in time. Aborting.');
      serverProcess.kill();
      process.exit(1);
    }
    setTimeout(checkServerReady, 1000);
  });
}

// 3. Initiate WebSocket Connection
async function runWebSocketPairing() {
  try {
    const code = await fetchPairingCode();
    console.log(`Retrieved pairing code: ${code}`);

    const wsUrl = `${WS_URL}/api/companion/ws?code=${code}`;
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('WebSocket handshake initiated...');
    });

    ws.on('message', (message) => {
      const data = JSON.parse(message.toString());
      console.log('Received from server:', data);
      
      if (data.type === 'connection_status' && data.status === 'paired') {
        console.log('--- E2E WebSocket Pairing Validation PASSED ---');
        ws.close();
        serverProcess.kill();
        process.exit(0);
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket Error:', err);
      serverProcess.kill();
      process.exit(1);
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed.');
    });

  } catch (err) {
    console.error('E2E validation failed:', err);
    serverProcess.kill();
    process.exit(1);
  }
}

// Start checks
setTimeout(checkServerReady, 2000);
