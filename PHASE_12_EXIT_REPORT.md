## Exit Report — Phase 12: Fix remaining dependency vulnerabilities

### Changes made
- `Desktop-app/package.json` & `Desktop-app/package-lock.json`:
  - Pruned `html-to-docx` (and `mammoth`), removing the 2 high-severity vulnerabilities (`image-size` infinite-loop DoS GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq). The only call site was dead synthetic code in `tools.ts` (`mergeAndWriteFile` if `.docx`), which had no user-facing consumers in this code sandbox.
  - Upgraded `electron-builder` from `^25.1.8` to `^26.15.3` in `devDependencies`. This updated `@electron/rebuild`, `builder-util-runtime`, `app-builder-lib`, and `tar` past their vulnerable versions (resolving 1 critical and 11 high vulnerabilities including `tar <=7.5.20` and `builder-util-runtime <9.7.0`).
  - Verified native modules `node-pty` and `tree-sitter` compile and execute cleanly with no regressions.
- `Mobile-app/package.json` & `Mobile-app/package-lock.json`:
  - Added overrides for `metro: "0.84.5"`, `metro-config: "0.84.5"`, and `metro-transform-worker: "0.84.5"`.
  - In `metro@0.84.4` (pulled by `@react-native/community-cli-plugin`), `image-size@1.2.1` was a direct dependency, causing 4 high-severity vulnerabilities. In `metro@0.84.5`, `image-size` is no longer a dependency, completely eliminating the vulnerability.
  - Pinning to `0.84.5` matches the exact version required by `@expo/metro@56.0.2` in Expo SDK 56, passing `npx expo-doctor`'s check for overridden dependencies and building successfully with `npx expo export --no-bytecode`.

### Deviations from plan
- **Desktop-app `html-to-docx`**: Rather than forcing a breaking bump to `html-to-docx@1.1.2` (which still relies on obsolete transitive image parsers), code inspection confirmed that `.docx` generation had no UI call sites or active production features (it was dead code originally added speculatively to `tools.ts` and mocked in unit tests). Pruning it cleanly eliminated 100% of the vulnerability surface with 0 impact on features.
- **Desktop-app Dev-only `electron-builder`**: Upgrading `electron-builder` to `26.15.3` cleanly resolved all dev-time `tar` / `node-gyp` / `builder-util-runtime` vulnerabilities to 0 without breaking `node-pty` or `tree-sitter` native compilation.

### Tests run
- **Desktop-app Production Dependency Audit**:
  - `npm audit --omit=dev` → **found 0 vulnerabilities** (reduced from 2 high to 0).
- **Desktop-app Full Dependency Audit**:
  - `npm audit` → **found 0 vulnerabilities** (reduced from 14 vulnerabilities [1 critical, 13 high] to 0).
- **Desktop-app Native Module Verification**:
  - `node -e "const pty = require('node-pty'); console.log('pty version:', pty); const Parser = require('tree-sitter'); const parser = new Parser(); console.log('tree-sitter loaded:', typeof parser.parse);"` → PASS (native bindings loaded and initialized without errors).
- **Desktop-app Unit Tests**:
  - `npm test` → PASS (65 test files passed, 1 skipped, 557 tests passed, 1 expected fail, 1 skipped in 4.54s).
- **Desktop-app Build**:
  - `npm run build` → PASS (`tsc -b`, Vite client build, and esbuild backend bundle all succeeded with 0 errors).
- **Desktop-app E2E Smoke Tests**:
  - `npx playwright test e2e/smoke.e2e.ts` → PASS (8/8 tests passed in 15.2s).
- **Mobile-app Production Dependency Audit**:
  - `npm audit --omit=dev` → **found 0 vulnerabilities** (reduced from 4 high to 0).
- **Mobile-app Full Dependency Audit**:
  - `npm audit` → **found 0 vulnerabilities** (reduced from 4 high to 0).
- **Mobile-app Health Check (`expo-doctor`)**:
  - `npx expo-doctor` → 19/22 checks passed (identical to baseline; overridden dependency check passed; remaining 3 are known Expo 56 upstream items: Hermes memory notice, unmaintained voice package, and minor Expo SDK patch tag).
- **Mobile-app Export / Bundling**:
  - `npx expo export --no-bytecode` → PASS (Web bundled in 892ms, Android bundled in 1161ms, iOS bundled in 1177ms).
- **Mobile-app Unit Tests**:
  - `npm test` → PASS (5/5 test files passed, 46 tests passed in 436ms).
- **Mobile-app E2E Smoke & Accessibility Tests**:
  - `npm run test:e2e` → PASS (17/17 Playwright tests passed in 18.8s).
- **Web-app Production Dependency Audit**:
  - `npm audit --omit=dev` → **found 0 vulnerabilities**.

### Known gaps / follow-ups
- **Web-app Dev Dependencies**: `Web-app` dev dependencies currently have 7 non-production audit warnings (in `vitest`, `postcss`, `browserslist`, `brace-expansion`, `nanoid`). These are purely build/test dev-dependencies and were out of scope for Phase 12 (which focused on Desktop-app, Mobile-app, and Desktop dev-only). Can be addressed with non-breaking bumps in routine maintenance.
- **Expo SDK 57 Migration**: `npx expo-doctor` flags Hermes V1 memory regression on Expo SDK 56, recommending eventual migration to Expo SDK 57 (`expo@^57.0.9`, React Native `0.86.2+`). This is an upstream Expo framework upgrade outside Phase 12 scope.

### Verification needed from reviewer
1. **Desktop-app Zero Vulnerabilities**:
   - Run `npm audit --omit=dev` and `npm audit` in `Desktop-app/` and confirm `found 0 vulnerabilities`.
   - Run `npm test` and `npm run build` in `Desktop-app/` and verify clean execution.
2. **Mobile-app Zero Vulnerabilities**:
   - Run `npm audit --omit=dev` and `npm audit` in `Mobile-app/` and confirm `found 0 vulnerabilities`.
   - Run `npx expo export --no-bytecode` in `Mobile-app/` and verify that Web, Android, and iOS bundles build cleanly.
   - Run `npm run test:e2e` in `Mobile-app/` and verify all 17 Playwright tests pass.
3. **Preserved Security Features**:
   - Verify that `LOCAL_SESSION_SECRET`, companion pairing (`COMPANION_AUTH_TOKEN`), and `OS_FINGERPRINT` remain intact and uncompromised.
