#!/usr/bin/env node
// Issues a signed offline license key for Kryleos Forge.
//
// Ops-only — never ship this script's output private key, and never commit
// LICENSE_SIGNING_KEY. The matching public key is embedded in
// src/backend/license.ts (PRODUCTION_PUBLIC_KEY_DER_B64).
//
// Usage:
//   LICENSE_SIGNING_KEY="$(cat license-signing-key.pem)" \
//     node scripts/issue-license.mjs --tier founder --expiry 2027-06-01 [--email user@example.com] [--hwid abc123]
//
// To generate a new keypair (only when rotating keys — requires updating the
// embedded public key in license.ts and re-issuing all outstanding licenses):
//   node -e "const c=require('crypto');const{publicKey,privateKey}=c.generateKeyPairSync('ed25519');console.log('PUBLIC (base64 DER SPKI):',publicKey.export({type:'spki',format:'der'}).toString('base64'));console.log('PRIVATE (PEM):');console.log(privateKey.export({type:'pkcs8',format:'pem'}).toString())"

import * as crypto from 'node:crypto';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      out[arg.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (!args.tier || !args.expiry) {
  console.error('Usage: node scripts/issue-license.mjs --tier <tier> --expiry <YYYY-MM-DD> [--email <email>] [--hwid <hwid>]');
  process.exit(1);
}

const privateKeyPem = process.env.LICENSE_SIGNING_KEY;
if (!privateKeyPem) {
  console.error('LICENSE_SIGNING_KEY env var is required (PEM-encoded Ed25519 private key).');
  process.exit(1);
}

const privateKey = crypto.createPrivateKey(privateKeyPem);

const payload = {
  tier: args.tier,
  expiry: args.expiry,
  ...(args.email ? { email: args.email } : {}),
  ...(args.hwid ? { hwid: args.hwid } : {})
};

const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf-8');
const sigBuf = crypto.sign(null, payloadBuf, privateKey);

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

console.log(`${b64url(payloadBuf)}.${b64url(sigBuf)}`);
