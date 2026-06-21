import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';

const secret = randomBytes(32).toString('base64url');
const env = {
  ...process.env,
  KRYLEOS_LOCAL_SESSION_SECRET: secret,
  VITE_KRYLEOS_LOCAL_SESSION_SECRET: secret,
};
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const children = [
  spawn(npx, ['vite'], { env, stdio: 'inherit' }),
  spawn(npx, ['tsx', 'src/backend/server.ts'], { env, stdio: 'inherit' }),
  spawn(npx, ['electron', '.'], { env, stdio: 'inherit' }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on('error', error => {
    console.error(error);
    stop(1);
  });
  child.on('exit', code => {
    if (!stopping) stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
