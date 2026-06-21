# Kryleos Forge Remediation Verification Report

Verified independently on June 16, 2026. This report replaces the earlier Antigravity completion claim.

## Verified implementation

- The administrative HTTP and WebSocket server is loopback-only on port 3001.
- Electron generates a random process-scoped session secret, passes it through preload, and requires it on administrative REST and WebSocket traffic. Missing and invalid credentials are covered by adversarial browser tests.
- Companion traffic uses a separate configurable listener on port 3002 and only accepts the companion WebSocket upgrade path.
- Browser-origin WebSocket requests are restricted to the known local renderer origins; originless clients must be loopback clients.
- Companion device registration rotates the one-time pairing material. Planning-note sync and other privileged companion messages require a registered device, signature, nonce, signed timestamp, clock-window validation, and replay validation. Pairing/reconnect attempts are rate-limited per IP and device.
- Workspace authorization uses canonical real paths and `path.relative` containment. Sibling-prefix, traversal, symlink, and junction escapes are rejected. Selecting a new workspace removes the old workspace authority.
- Electron external navigation accepts HTTPS and loopback HTTP only.
- Electron fallback credential encryption writes authenticated AES-256-GCM ciphertext using a per-install key. Legacy AES-CBC and base64 values remain read-only migration paths.
- Web provider credentials and auth tokens are memory-only; obsolete localStorage values are removed. Mobile device identity and tokens use Expo SecureStore on native platforms.
- Pricing is generated from the shared source, Agency is described as preview-only, and unsupported privacy/product claims were corrected.
- Desktop and Web production bundles are split below the 500 KB chunk warning threshold.
- A manual release workflow, checksums, SBOM generation, contributor/security files, and cross-platform verification script were added.
- GitHub Actions references are pinned to immutable commits, and the verifier no longer uses unsafe Windows shell argument concatenation.
- Web and Mobile no longer probe administrative REST/WebSocket routes. They use the companion channel; Web account/billing calls require an explicitly configured hosted service URL.

## Fresh verification evidence

- Non-browser verifier: passed for Desktop, Web, and Mobile builds, typechecks, lint, unit tests, and production dependency audits.
- Desktop unit tests: 465 passed, 1 expected failure, 1 skipped.
- Web unit tests: 19 passed.
- Mobile unit tests: 47 passed.
- Desktop browser E2E: 33/33 passed, including missing/invalid local credential rejection.
- Web browser E2E: 31/31 passed.
- Mobile Expo Web E2E: 17/17 passed.
- Packaged Windows Electron E2E: 1/1 passed.
- Production dependency audits: no high or critical findings in any app.

## Remaining release gates

- Release scorer: raw technical score 9.8/10; final score 6.0/10 because the demand phase gate correctly applied its hard cap.
- Demand validation remains 0/1 committed design partners and 0/25 waitlist respondents with stated intent. Repository activity must not be substituted for external demand.
- Recorded soak: 30 minutes, 6,988 requests, zero failures, 9.9 ms p95 latency, and -23.1 MB working-set growth; passed.
- Windows/macOS signing and macOS notarization credentials are external prerequisites for signed distribution.
- Native iOS/Android device behavior is not covered by Expo Web Playwright tests and requires device or emulator verification.
- The large `server.ts` and top-level app components remain maintainability debt. Security transport and rate limiting were extracted into focused modules, but broad UI/domain decomposition remains post-beta work.

## Recommendation

The code is suitable for continued private engineering validation. Do not declare a public or invited-beta GO until the release scorer passes with genuine demand and soak evidence.
