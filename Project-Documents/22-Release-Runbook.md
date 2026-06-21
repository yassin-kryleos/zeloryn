# Kryleos Forge Release Runbook

Target version: `0.1.0-beta.1`.

## 1. Repository verification

From the repository root:

```bash
node scripts/verify-all.mjs
```

Then run all browser and packaged flows:

```bash
cd Desktop-app && npm run test:e2e && npm run test:e2e:packaged
cd ../Web-app && npm run test:e2e
cd ../Mobile-app && npm run test:e2e
```

Run the final scorer from the repository root:

```bash
node qa/scripts/release-score.mjs
```

Do not release unless the scorer exits successfully. Demand and soak gates require genuine external evidence.

## 2. Version and artifact checks

- Confirm Desktop, Web, and Mobile package versions are `0.1.0-beta.1`.
- Confirm Expo `version`, iOS build number, and Android version code are intentional.
- Inspect generated pricing files after `generate:pricing`.
- Verify the packaged Electron app, not only the Vite renderer.
- Confirm checksums and SBOM artifacts are attached to the release workflow run.

## 3. Signed release prerequisites

- Windows Authenticode certificate and CI secrets.
- Apple Developer identity, signing certificate, and notarization credentials.
- Production Stripe and Razorpay credentials and webhook secrets.
- Store credentials for EAS mobile distribution.

Use the manual GitHub release workflow. Select the unsigned channel only for explicitly approved private testing. Public distribution requires the signed channel and successful credential checks.

## 4. Product evidence gates

- At least 1 committed design partner.
- At least 25 waitlist respondents with stated installation intent.
- A recorded passing soak of at least 30 minutes.
- Native iOS and Android smoke verification on supported devices or emulators.
- Privacy, pricing, and feature claims reviewed against the shipping build.

Never edit counters or soak output to make a gate pass.

## 5. Rollback and incident response

1. Mark the affected GitHub release as draft or prerelease and stop distribution.
2. Revoke compromised companion devices locally with `DELETE /api/companion/devices/:deviceId`.
3. Rotate exposed provider, billing, signing, or CI credentials at their provider.
4. Preserve relevant logs after redaction and document scope, versions, and affected users.
5. Ship a patched version only after the full verification and scorer gates pass again.

There is no remote credential-clear endpoint; do not claim or rely on one.
