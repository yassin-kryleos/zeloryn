import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function runCommand(command, args, cwd) {
  if (process.platform !== 'win32') {
    return spawnSync(command, args, { cwd, stdio: 'inherit' });
  }
  const commandLine = [command, ...args].join(' ');
  return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], {
    cwd,
    stdio: 'inherit',
  });
}

const checks = [
  ['Desktop typecheck', 'Desktop-app', npx, ['tsc', '--noEmit']],
  ['Desktop build', 'Desktop-app', npm, ['run', 'build']],
  ['Desktop lint', 'Desktop-app', npm, ['run', 'lint']],
  ['Desktop tests', 'Desktop-app', npm, ['test']],
  ['Desktop production audit', 'Desktop-app', npm, ['audit', '--omit=dev', '--audit-level=high']],
  ['Web typecheck', 'Web-app', npx, ['tsc', '--noEmit']],
  ['Web build', 'Web-app', npm, ['run', 'build']],
  ['Web lint', 'Web-app', npm, ['run', 'lint']],
  ['Web tests', 'Web-app', npm, ['test']],
  ['Web production audit', 'Web-app', npm, ['audit', '--omit=dev', '--audit-level=high']],
  ['Mobile typecheck', 'Mobile-app', npx, ['tsc', '--noEmit']],
  ['Mobile tests', 'Mobile-app', npm, ['test']],
  ['Mobile production audit', 'Mobile-app', npm, ['audit', '--omit=dev', '--audit-level=high']],
];

for (const [label, directory, command, args] of checks) {
  console.log(`\n=== ${label} ===`);
  const maxAttempts = label.includes('audit') ? 3 : 1;
  let result;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    result = runCommand(command, args, path.join(root, directory));
    if (!result.error && result.status === 0) break;
    if (attempt < maxAttempts) {
      console.warn(`${label} failed on attempt ${attempt}; retrying...`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
    }
  }
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('\nAll non-browser verification gates passed.');
