#!/usr/bin/env node
/**
 * Update Homebrew and Winget distribution manifests with version and checksums.
 * Usage: node distribution/scripts/update-distribution-manifests.mjs <version> [artifacts-dir]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

const version = process.argv[2] ? process.argv[2].replace(/^v/, '') : null;
const artifactsDir = process.argv[3] || path.join(rootDir, 'Desktop-app', 'dist-desktop');

if (!version) {
  console.error('Error: Version argument required (e.g. 0.1.0 or v0.1.0)');
  process.exit(1);
}

console.log(`[distribution] Updating manifests for version ${version} from ${artifactsDir}`);

function computeSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Map files
let files = [];
if (fs.existsSync(artifactsDir)) {
  files = fs.readdirSync(artifactsDir);
}

const checksums = {};
for (const file of files) {
  const fullPath = path.join(artifactsDir, file);
  if (fs.statSync(fullPath).isFile()) {
    checksums[file] = computeSha256(fullPath);
    console.log(`  Artifact: ${file} => ${checksums[file]}`);
  }
}

// 1. Update Homebrew Cask
const caskPath = path.join(rootDir, 'distribution', 'homebrew', 'Casks', 'kryleos-forge.rb');
if (fs.existsSync(caskPath)) {
  let content = fs.readFileSync(caskPath, 'utf8');
  content = content.replace(/version "([^"]+)"/, `version "${version}"`);

  // Find mac artifacts
  const armFile = files.find(f => f.includes('mac') && f.includes('arm64') && f.endsWith('.dmg'));
  const x64File = files.find(f => f.includes('mac') && f.includes('x64') && f.endsWith('.dmg'));

  if (armFile && checksums[armFile]) {
    content = content.replace(/sha256 arm: "([0-9a-fA-F]*)"/, `sha256 arm: "${checksums[armFile]}"`);
  }
  if (x64File && checksums[x64File]) {
    content = content.replace(/intel: "([0-9a-fA-F]*)"/, `intel: "${checksums[x64File]}"`);
  }

  fs.writeFileSync(caskPath, content, 'utf8');
  console.log(`[distribution] Updated Homebrew Cask: ${caskPath}`);
}

// 2. Update Winget manifest
const wingetPath = path.join(rootDir, 'distribution', 'winget', 'Kryleos.Forge.yaml');
if (fs.existsSync(wingetPath)) {
  let content = fs.readFileSync(wingetPath, 'utf8');
  content = content.replace(/PackageVersion: .*/, `PackageVersion: ${version}`);
  content = content.replace(/v[0-9]+\.[0-9]+\.[0-9]+/g, `v${version}`);

  const exeFile = files.find(f => f.endsWith('.exe') && (f.includes('Setup') || f.includes('installer')));
  if (exeFile && checksums[exeFile]) {
    content = content.replace(/InstallerSha256: [0-9a-fA-F]+/, `InstallerSha256: ${checksums[exeFile]}`);
  }

  fs.writeFileSync(wingetPath, content, 'utf8');
  console.log(`[distribution] Updated Winget manifest: ${wingetPath}`);
}

console.log('[distribution] Manifest update complete.');
