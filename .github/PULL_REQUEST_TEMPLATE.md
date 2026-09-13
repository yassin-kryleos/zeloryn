## Summary of Changes
Provide a brief summary of what this pull request changes and why.

## Related Issues
Fixes # (or Closes #)

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Refactoring / Code cleanup
- [ ] Documentation update
- [ ] Performance optimization

## Verification & Testing Performed
Describe the tests you ran to verify your changes:
- [ ] Desktop app tests (`npm test` in `Desktop-app`)
- [ ] Desktop app build (`npm run build` in `Desktop-app`)
- [ ] Web app tests/build (`npm test` & `npm run build` in `Web-app`)
- [ ] Mobile app tests/typecheck (`npm test` & `npx tsc --noEmit` in `Mobile-app`)
- [ ] Manual verification (detail steps taken)

## Open-Source & Security Checklist
- [ ] **BYOK Preserved**: No payment gating, subscriptions, license tiers, or forced account login introduced.
- [ ] **Security Boundaries Preserved**: `LOCAL_SESSION_SECRET`, companion pairing auth (`COMPANION_AUTH_TOKEN`), `OS_FINGERPRINT`, and command approval classifier remain intact.
- [ ] **No Secrets Committed**: Checked `git diff` to ensure no `.env` files, API keys, private keys, or personal filesystem paths were added.
- [ ] **Code Style & Types**: TypeScript compiles with zero errors and no regressions.
