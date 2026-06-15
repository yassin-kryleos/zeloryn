import { test, expect, _electron as electron } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function packagedExecutable(): string {
  const root = path.resolve('dist-desktop');
  const candidates = process.platform === 'win32'
    ? [path.join(root, 'win-unpacked', 'Kryleos Forge.exe')]
    : process.platform === 'darwin'
      ? [path.join(root, 'mac', 'Kryleos Forge.app', 'Contents', 'MacOS', 'Kryleos Forge')]
      : [path.join(root, 'linux-unpacked', 'kryleos-forge'), path.join(root, 'linux-unpacked', 'Kryleos Forge')];
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (!executable) throw new Error(`Packaged executable not found. Checked: ${candidates.join(', ')}`);
  return executable;
}

test('packaged Electron reaches a green no-key demo trace', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kryleos-packaged-e2e-'));
  const app = await electron.launch({
    executablePath: packagedExecutable(),
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), `--user-data-dir=${path.join(dataDir, 'user-data')}`],
    env: { ...process.env, KRYLEOS_DATA_DIR: dataDir }
  });
  try {
    const page = await app.firstWindow();
    await expect(page).toHaveTitle(/Kryleos Forge/i);
    await page.evaluate(() => {
      localStorage.removeItem('matrix_setup_done');
      localStorage.removeItem('matrix_activation_demo');
      localStorage.removeItem('matrix_activation_repo');
      localStorage.removeItem('legal_terms_accepted');
    });
    await page.reload();
    const demoButton = page.getByRole('button', { name: /run no-key demo/i });
    await expect(demoButton).toBeVisible({ timeout: 30_000 });
    await demoButton.click();
    await expect(page.getByText(/demo trace passed without an api key/i)).toBeVisible({ timeout: 30_000 });
  } finally {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
