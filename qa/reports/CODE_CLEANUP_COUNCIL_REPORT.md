# Code Cleanup Council — Duplicate & Dead Code Report

**Date:** 2026-06-15
**Scope:** Desktop-app, Web-app, Mobile-app, scripts (qa/scripts, Desktop-app/scripts)
**Status:** **Identify-only. No code was changed.** All findings below are verified observations with twin/caller proof; corrections are described, not applied.

---

## Executive Summary

After de-duplicating overlapping reports (several findings were independently surfaced by more than one scan area), there are **20 distinct findings**.

### Counts by severity

| Severity | Count |
|----------|-------|
| High     | 7     |
| Medium   | 8     |
| Low      | 5     |
| **Total**| **20**|

### Counts by category

| Category | Count |
|----------|-------|
| duplicate | 9 |
| redundant | 5 |
| dead-code | 2 |
| unused-export | 2 |
| leftover-ai-scaffold | 2 |
| orphan-file | 1 |

### Top themes

1. **Provider copy-paste (Desktop backend).** The four streaming providers (`anthropic`, `openai`, `openrouter`, `deepseek`) carry identical HTTP-error blocks and near-identical SSE buffer-parsing frames. This is the densest cluster of redundancy and the highest-value merge.
2. **Cross-surface duplication of utilities.** `useVoiceInput`, `redactSensitiveData`, `isIndianLocale`/`loadRazorpayCheckoutScript`, and `FEATURE_STATUS_LABELS` are each copied between two or three of Desktop/Web/Mobile with no shared module — drift is already visible (Desktop/Web `redactSensitiveData` are missing the AWS-key patterns the Mobile canonical version has).
3. **Intra-Desktop duplicate helpers.** `driftClass`/`planDriftClass`, `getAssigneeColor`, and `agentFileName` are each defined twice in `src/` with identical or near-identical bodies.
4. **Orphaned / unwired scaffold.** A never-imported `CodeRain` component, a disconnected CSS generator, a missing Mobile pricing-generation hook, and a superseded manual test runbook.
5. **Type-safety erosion.** `OpenAIProvider.setModel()` widens its type union and uses `as any`, bypassing the constructor's declared model set.

> **Security note:** Theme 2 is not cosmetic. The Web and Desktop inline copies of `redactSensitiveData` omit AWS access-key patterns (`AKIA/ASIA/...`) present in the Mobile canonical version, so those two surfaces leak AWS keys in logs that Mobile would mask. Consolidating onto the Mobile implementation closes a real PII/secret-redaction gap.

---

## De-duplicated overlaps

The raw findings contained the same issue reported from multiple scan areas. These were merged into single findings:

- **`agentFileName` (CoworkSpace.tsx:99 vs crewPersonas.ts:34)** — reported by both `desktop-components-big` and `desktop-components-small`. Merged into **#8**.
- **`redactSensitiveData` inline copies (Desktop App.tsx:1037-1053 and Web App.tsx:371-387)** — each reported twice (`cross-surface-dupes` and `web-mobile-own`). The Mobile canonical `utils/redact.ts` (`dead-code` finding) is the same root issue. All three are treated as **one cross-surface family** (#5, #6, #7) sharing one recommended fix.
- **Two-sided pairs** (`driftClass`/`planDriftClass`; `getAssigneeColor` ProjectBoard/CoworkSpace) are each genuinely two definitions in two files; they are kept as paired entries but share a single corrective action.

---

## All findings

| # | Severity | Category | File:lines | Issue | Recommended correction |
|---|----------|----------|------------|-------|------------------------|
| 1 | High | redundant | `Desktop-app/src/backend/anthropic.ts:78-94` (twins: openai.ts:72-88, openrouter.ts:68-84, deepseek.ts:92-108) | Identical HTTP error-handling block in all 4 streaming providers; only the error-prefix string differs | MERGE into `handleHttpStreamError(statusCode, errorData, prefix)`; call from each provider |
| 2 | High | duplicate | `Desktop-app/src/components/ProjectBoard.tsx:37-51` | `driftClass()` is byte-identical to `planDriftClass()` in PlanningScreen | MERGE both into one shared `driftClassification` util; import in both |
| 3 | High | duplicate | `Desktop-app/src/components/PlanningScreen.tsx:73-87` | `planDriftClass()` duplicates `driftClass()` in ProjectBoard | MERGE (see #2) |
| 4 | High | unused-export | `Desktop-app/src/components/CodeRain.tsx:1-106` | Component exported but zero imports across `src/`; only referenced in product docs as deprioritized | REMOVE the file (or refactor to a flagged lazy component if the opt-in effect is still wanted) |
| 5 | High | dead-code | `Mobile-app/src/utils/redact.ts:1-17` | Canonical `redactSensitiveData` (incl. AWS-key patterns) lives only in Mobile; Desktop/Web have weaker inline copies | MERGE to a shared `redact` module as the single source; have Desktop/Web import it |
| 6 | High | duplicate | `Desktop-app/src/App.tsx:33-60` (twin: Web-app/src/App.tsx:937-956) | `isIndianLocale()` + `loadRazorpayCheckoutScript()` duplicated (top-level vs closure) | MERGE into shared `razorpay`/billing util; import in both apps |
| 7 | High | duplicate | `qa/scripts/performance-test-scripts/node-load-test.mjs:87-126, 129-168` | `makePostRequest` and `makePutRequest` differ only by HTTP method | MERGE into one `makeRequest(endpoint, method, payload, token)` |
| 8 | Medium | duplicate | `Desktop-app/src/components/CoworkSpace.tsx:99` (twin: shared/crewPersonas.ts:34) | `agentFileName()` defined identically in two places, neither exported | MERGE: export from `crewPersonas.ts`, import in CoworkSpace |
| 9 | Medium | redundant | `Desktop-app/src/backend/anthropic.ts:96-130` (twins: openai.ts:90-130, openrouter.ts:86-126, deepseek.ts:110-171) | Near-identical SSE buffer/line-split frame across all 4 providers; only per-provider JSON field extraction differs | MERGE buffer/event-loop into a util taking a per-line callback |
| 10 | Medium | redundant | `Desktop-app/src/backend/openai.ts:26-27` | `setModel()` widens type union + uses `as any`, bypassing constructor's declared models | REMOVE undocumented strings + `as any` (or formalize gpt-5.x in the interface) |
| 11 | Medium | redundant | `Desktop-app/src/components/ProjectBoard.tsx:461-474` (twin: CoworkSpace.tsx:481-489) | `getAssigneeColor()` same switch shape, divergent role names, same colors | MERGE into shared util with role-name normalization |
| 12 | Medium | redundant | `Desktop-app/src/components/CoworkSpace.tsx:481-489` | `getAssigneeColor()` semantic twin of ProjectBoard version | MERGE (see #11) |
| 13 | Medium | duplicate | `Desktop-app/src/hooks/useVoiceInput.ts:1-77` (twin: Web-app/src/hooks/useVoiceInput.ts:1-74) | Functionally identical voice-input hook in both apps (trivial wording/formatting diffs) | MERGE to a shared hooks module; import in both |
| 14 | Medium | duplicate | `Web-app/src/App.tsx:371-387` | Inline `redactSensitiveData`, missing AWS-key coverage | REMOVE inline; import shared canonical (see #5) |
| 15 | Medium | duplicate | `Desktop-app/src/App.tsx:1037-1053` | Inline `redactSensitiveData`, missing AWS-key coverage | REMOVE inline; import shared canonical (see #5) |
| 16 | Medium | leftover-ai-scaffold | `Desktop-app/scripts/gen-utilities.cjs:1-11` | CSS-utility generator not wired to any npm/build hook though its output is in `index.css` | REMOVE (if CSS is now hand-maintained) or wire to `predev`/`prebuild` |
| 17 | Medium | unused-export | `Mobile-app/package.json:1-43` | No `generate:pricing` script/hook despite `pricing.generated.ts` existing; Desktop/Web both wire it | ADD `generate:pricing` + predev/prebuild hooks matching the other surfaces |
| 18 | Low | duplicate | `Web-app/src/App.tsx:26-32` (twin: Mobile-app/App.tsx:14-20) | `FEATURE_STATUS_LABELS` lookup table duplicated | MERGE to a shared constants module |
| 19 | Low | leftover-ai-scaffold | `qa/scripts/run-all-tests.md:1-43` | Manual runbook superseded by `qa/scripts/run-all-tests.mjs`; referenced nowhere | REMOVE (migrate any unique context into a dev README) |
| 20 | Low | redundant | `Desktop-app/src/backend/anthropic.ts:1-9` (+ OpenAI/OpenRouter/DeepSeek/Gemini configs) | Provider `*Config` interfaces repeat the `{apiKey, model, baseUrl?}` shape | Optional MERGE into `ProviderConfig<T>` base; low value given provider-specific fields |

> **Intentional duplication — no action (excluded from the 20):** `pricing.generated.ts` across all three surfaces, the identical `main.tsx` React entry points (Desktop/Web), and the by-design Ed25519/RSA protocol split between `Mobile-app/src/utils/deviceIdentity.ts` and `Desktop-app/src/backend/security.ts`. These are documented in the backlog only as "verify/document," not as corrections. The two private ChatConsole helpers (`formatTerminalText`, `parseInlineFormatting`) are correctly module-private and also require no action.

---

## Detailed write-ups

### High severity

#### 1 — Identical HTTP error-handling block across all 4 streaming providers
**What it is:** `anthropic.ts:78-94` performs the status-code check, error-body collection, and JSON-parse-with-message-extraction.
**Evidence:** The same block appears in `openai.ts:72-88`, `openrouter.ts:68-84`, and `deepseek.ts:92-108`. Only the error-prefix literal (`'Anthropic API Error'`, `'OpenAI API Error'`, ...) differs.
**Correction:** MERGE — extract a shared `handleHttpStreamError(statusCode, errorData, errorPrefix)` and call it from each provider's `chatStream`.

#### 2 & 3 — `driftClass()` / `planDriftClass()` duplicated
**What it is:** `ProjectBoard.tsx:37-51` (`driftClass`, called at 494/799) and `PlanningScreen.tsx:73-87` (`planDriftClass`, called at 1753/1869).
**Evidence:** Both switch on `DriftClassification` and return identical CSS class strings for every status case (`complete`, `in_progress`, `blocked`, `needs_review`/`diverged`, default).
**Correction:** MERGE — move to a shared util (e.g. `src/shared/driftClassification.ts`), export, and import in both components, deleting both local copies.

#### 4 — Orphan `CodeRain` component
**What it is:** `CodeRain.tsx:1-106`, exported at line 7.
**Evidence:** Zero `import.*CodeRain` matches anywhere in `src/`. Only product docs mention it (as demoted to opt-in).
**Correction:** REMOVE the file. If the opt-in Matrix-rain effect is still planned, reintroduce later as a flagged, lazy-loaded component rather than leaving dead code.

#### 5 — Canonical `redactSensitiveData` isolated in Mobile (Desktop/Web copies are weaker)
**What it is:** `Mobile-app/src/utils/redact.ts:1-17` exports the regex-based PII/secret masker and is the only version with AWS access-key patterns (line 9).
**Evidence:** Mobile imports it in `App.tsx`. Desktop (`App.tsx:1037-1053`) and Web (`App.tsx:371-387`) re-implement it inline **without** the AWS patterns; Web does not even use it everywhere. The drift is a genuine security gap on two surfaces.
**Correction:** MERGE — promote `redact.ts` to a shared location as the single source (including AWS coverage); have Desktop and Web import it and delete their inline copies (see #14, #15).

#### 6 — Razorpay locale + script loader duplicated (Desktop ↔ Web)
**What it is:** `isIndianLocale()` and `loadRazorpayCheckoutScript()`.
**Evidence:** Desktop `App.tsx:33-60` (top-level fns, used at 1529/1575) vs Web `App.tsx:937-956` (closures inside `App()`, used at 964/1002). Same `endsWith('-in')` check and same `checkout.razorpay.com` load; only scope differs.
**Correction:** MERGE into a shared billing/razorpay util imported by both apps to prevent payment-path drift.

#### 7 — `makePostRequest` / `makePutRequest` differ only by HTTP method
**What it is:** `node-load-test.mjs:87-126` and `129-168`.
**Evidence:** Identical JSON serialization, header construction (Content-Type/Length, optional Authorization), `http.request` setup, body buffering, response handling, and status-500 error path — only `'POST'` vs `'PUT'`.
**Correction:** MERGE into `makeRequest(endpoint, method, payload, token)`; update both call sites (~40 lines removed).

### Medium severity

#### 8 — `agentFileName()` duplicated
**What it is:** `CoworkSpace.tsx:99` and `shared/crewPersonas.ts:34`, both `const agentFileName = (role) => role.toLowerCase().replace(/[^a-z0-9_-]+/g, '_')`, neither exported.
**Evidence:** CoworkSpace uses it at 325/351; crewPersonas uses it at 43 inside the exported `installCrewPersona`. CoworkSpace does not import from crewPersonas.
**Correction:** MERGE — export from `crewPersonas.ts` (the shared location), delete the CoworkSpace copy, import it.

#### 9 — SSE buffer-parsing frame duplicated across 4 providers
**What it is:** `anthropic.ts:96-130` — `res.setEncoding`, `buffer += chunk`, `buffer.split('\n')`, `buffer = lines.pop()`.
**Evidence:** Near-identical in `openai.ts:90-130`, `openrouter.ts:86-126`, `deepseek.ts:110-171`. Only the per-provider JSON field extraction differs (`data.delta.text` vs `data.choices[0].delta.content` vs `data.choices[0].delta`).
**Correction:** MERGE — extract the line-buffering/event-loop frame into a util that accepts a callback to handle each parsed data line.

#### 10 — `setModel()` type widening + `as any`
**What it is:** `openai.ts:26-27`. The signature accepts `'gpt-4o' | 'gpt-4o-mini' | 'gpt-5.5' | 'gpt-5.5-mini' | 'gpt-5.4' | string` and uses `as any` on assignment.
**Evidence:** Constructor (lines 5-9) declares only `'gpt-4o' | 'gpt-4o-mini'`; the `| string` plus `as any` lets any string through unvalidated.
**Correction:** REMOVE the undocumented strings and the `as any` (keeping the constructor's declared set), or formally document/support gpt-5.x in the interface. Do not cast.

#### 11 & 12 — `getAssigneeColor()` semantic duplication
**What it is:** `ProjectBoard.tsx:461-474` (roles planner/builder/analyst/reviewer, used at 522) and `CoworkSpace.tsx:481-489` (roles coordinator/developer/researcher/debugger, used at 598).
**Evidence:** Identical switch structure returning the same Tailwind colors (`text-forge-neon`, `text-cyan-400`, `text-purple-400`, neon-amber) in corresponding positions; only role names differ.
**Correction:** MERGE into one shared util that normalizes role names to a canonical set before color lookup.

#### 13 — `useVoiceInput` hook duplicated (Desktop ↔ Web)
**What it is:** `Desktop-app/src/hooks/useVoiceInput.ts:1-77` and `Web-app/src/hooks/useVoiceInput.ts:1-74`.
**Evidence:** Same signature, same type defs (`SpeechRecognitionResultEvent`, `SpeechRecognitionErrorEvent`, `LocalSpeechRecognition`), same logic. Only diffs: extra blank lines and `'this browser runtime'` vs `'this browser'` error text.
**Correction:** MERGE into a shared hooks module; import in both apps. Record the single source in DECISIONS.md.

#### 14 & 15 — Inline `redactSensitiveData` copies (Web, Desktop)
**What it is:** Web `App.tsx:371-387`, Desktop `App.tsx:1037-1053` (Desktop used once at 1101).
**Evidence:** Both inline copies omit the AWS access-key patterns that the canonical Mobile export has.
**Correction:** REMOVE both inline functions; import the shared canonical implementation from #5.

#### 16 — Disconnected CSS utility generator
**What it is:** `Desktop-app/scripts/gen-utilities.cjs:1-11`; its output sits in `index.css` (GEN:UTILITIES markers at 924-1234).
**Evidence:** `Desktop-app/package.json` has no `generate:utilities`/`pregenbuild` hook; the script only documents manual invocation.
**Correction:** Either wire it to `predev`/`prebuild` via a `generate:utilities` script, or REMOVE it and note that `index.css` is hand-maintained. The disconnected state causes maintenance confusion.

#### 17 — Mobile missing pricing-generation hook
**What it is:** `Mobile-app/package.json:1-43`.
**Evidence:** `Mobile-app/src/pricing.generated.ts` exists, but unlike Desktop/Web (which wire `generate:pricing` + predev/prebuild), Mobile has no such script — the generation pipeline is orphaned for Mobile.
**Correction:** ADD a `generate:pricing` script and predev/prebuild hooks matching the other surfaces so the generated file stays in sync.

### Low severity

#### 18 — `FEATURE_STATUS_LABELS` duplicated (Web ↔ Mobile)
**What it is:** Web `App.tsx:26-32` and Mobile `App.tsx:14-20`, the same `{ production, preview, simulator, mock, planned }` label map.
**Correction:** MERGE into a shared constants module imported by both.

#### 19 — Superseded manual test runbook
**What it is:** `qa/scripts/run-all-tests.md:1-43`, documenting manual lint/test/e2e/perf steps.
**Evidence:** `qa/scripts/run-all-tests.mjs:1-40` automates the same flow and is the canonical runner; the `.md` is referenced nowhere.
**Correction:** REMOVE the `.md`; migrate any unique context into a dev README if useful.

#### 20 — Repeated provider `*Config` interface shape
**What it is:** `AnthropicConfig`, `OpenAIConfig`, `OpenRouterConfig`, `DeepSeekConfig`, `GeminiConfig` all repeat `{ apiKey, model: literal-union, baseUrl? }`.
**Evidence:** Each provider redefines the shape rather than extending a base.
**Correction:** Optional MERGE into a `ProviderConfig<T extends string>` base. Low value — provider-specific fields (`thinkingCapability`, `temperature`, `useSearch`) limit unification; only worthwhile if more providers are added.

---

## Corrections backlog (safest-first)

Ordered so that low-risk deletions land before refactors that introduce new shared modules.

**Tier A — orphan / unwired files (delete or wire; no call-site rewiring of logic):**
- [ ] #4 REMOVE `Desktop-app/src/components/CodeRain.tsx` (zero imports).
- [ ] #19 REMOVE `qa/scripts/run-all-tests.md` (superseded by `.mjs`).
- [ ] #16 REMOVE or wire `Desktop-app/scripts/gen-utilities.cjs`.
- [ ] #17 ADD `generate:pricing` script + predev/prebuild hooks to `Mobile-app/package.json`.

**Tier B — type-safety / single-file fixes:**
- [ ] #10 REMOVE the `as any` + undocumented model strings in `openai.ts:26-27`.

**Tier C — exports / single-callsite merges (low blast radius):**
- [ ] #8 Export `agentFileName` from `crewPersonas.ts`; delete CoworkSpace copy.
- [ ] #7 MERGE `makePost/PutRequest` into `makeRequest` in `node-load-test.mjs`.

**Tier D — intra-Desktop shared-util extractions:**
- [ ] #2/#3 MERGE `driftClass`/`planDriftClass` → shared `driftClassification` util.
- [ ] #11/#12 MERGE `getAssigneeColor` → shared util with role normalization.
- [ ] #1 MERGE provider HTTP-error block → `handleHttpStreamError`.
- [ ] #9 MERGE provider SSE buffer frame → callback-based util.
- [ ] #20 (optional) MERGE provider configs → `ProviderConfig<T>` base.

**Tier E — cross-surface shared modules (need a new shared package/location; highest coordination cost; do last):**
- [ ] #5 + #14 + #15 MERGE `redactSensitiveData` onto Mobile canonical (incl. AWS patterns) in a shared module; Desktop/Web import. **Closes a real secret-redaction gap — prioritize within this tier.**
- [ ] #6 MERGE `isIndianLocale`/`loadRazorpayCheckoutScript` → shared billing util.
- [ ] #13 MERGE `useVoiceInput` → shared hooks module.
- [ ] #18 MERGE `FEATURE_STATUS_LABELS` → shared constants module.

**Verify-only (document, do not delete):** confirm `pricing.generated.ts` regeneration runs in CI; document the Ed25519/RSA protocol split between `deviceIdentity.ts` and `security.ts`; confirm `landing.html` is truly unreferenced before any removal decision.

---

*This report is identify-only. No source files were modified during this council pass.*