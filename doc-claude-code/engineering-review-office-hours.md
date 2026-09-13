# Engineering Review: /office-hours Design Doc

**Date:** 2026-06-21  
**Branch:** features/forge-extensions  
**Context:** Prerequisite for /plan-eng-review of the full branch.

---

## 1. Feature Inventory

| Feature | Status | Files |
|---------|--------|-------|
| Claude Code CLI runner | ✅ Implemented | `claudeCodeRunner.ts` (184 lines) |
| Terminal MVP (node-pty + xterm.js) | ✅ Implemented | `terminalManager.ts` (331 lines) |
| Terminal command approval gate | ✅ Implemented | Embedded in `terminalManager.ts` L144–240 |
| CC Deviation service | ✅ Implemented | `ccDeviationService.ts` (289 lines) |
| Terminal companion forwarding | ✅ Implemented | `companionHub.ts` L428–434 |
| Sliding window rate limiter | ✅ Implemented | `slidingWindowLimiter.ts` (27 lines) |
| Amber design system | ✅ Implemented | DESIGN.md + index.css rewrite |
| CodeReviewPanel CC DEVIATION tab | ✅ Implemented | `CodeReviewPanel.tsx` L54–65, L328–434 |
| Companion auth (Ed25519 + nonce + lockout) | ✅ Implemented | `companionHub.ts` |

---

## 2. Findings

### Finding 1: claudeCodeRunner misses modern CLI flags

**Severity:** MEDIUM  
**File:** `claudeCodeRunner.ts:112–143`

The runner uses `--print` with a raw text prompt and string-parses stdout. Current Claude Code CLI (v2.1+) supports:

- `--output-format json` — structured JSON output with `tool_use` blocks
- `--json-schema` — constrain the final response shape
- `--bare` — minimial UI output (cleaner programmatic parse)
- `--allowedTools "Read,Edit,Bash,Grep,Glob"` — restrict tool access
- `--permission-mode "bypass-accepted"` — auto-accept for sandboxed runners

The runner uses none of these. Output parsing is regex-based (`extractMentionedFiles` in `ccDeviationService.ts` L148–163) — fragile across CLI versions.

**Recommendation:** Upgrade to `--output-format json --bare`. Add a version probe (`claude --version`) to detect capability. Fall back to current `--print` path for old versions.

### Finding 2: SlidingWindowLimiter leaks memory

**Severity:** LOW (MEDIUM under sustained load)  
**File:** `slidingWindowLimiter.ts:3`

The `attempts` Map grows unbounded — entries are never removed. Under a multi-key spray attack, this leaks N entries × timestamp arrays per key indefinitely.

**Recommendation:** Add a 30-second periodic GC or a lazy-cleanup on `consume()` that prunes entries with zero recent timestamps.

### Finding 3: Amber accent fails WCAG AA for small text on dark

**Severity:** HIGH  
**File:** DESIGN.md L63, index.css  

`#f59e0b` (amber) on `#09090b` (zinc-950) produces ~3.3:1 contrast ratio — below the 4.5:1 threshold for small text (<14px). Design uses amber for badges (11px), labels (11px), and button text.

**Recommendation:** Define an `--amber-text` token at `#d97706` (amber-600) or `#fbbf24` (amber-300) for small text. Document in DESIGN.md with a `contrast` column. Use `--amber-text` for any amber content below 14px body size.

### Finding 4: Terminal approval gate writes chars before classification

**Severity:** MEDIUM (edge case)  
**File:** terminalManager.ts L162–165

Non-`\r` characters are written to PTY immediately, before classification. This means:

- Pasted content with embedded `\r` triggers multiple line boundaries in one `writeInput` call
- Shell completions (`Tab`) execute before any classification
- `for` loop destructive inner commands never hit the approval gate (only `for` syntax is classified)

**Recommendation:** Buffer ALL input until `\r`, classify the complete line, then write text + `\r` atomically. Trade-off: no visible typeahead before Enter is pressed. Acceptable for a security-conscious terminal.

### Finding 5: Companion remote terminal input has unsupported threat model

**Severity:** MEDIUM (design gap, not implementation flaw)  
**File:** companionHub.ts L428–434

`broadcastTerminalOutput` is read-only. The architecture handles discrete signed actions (APPROVE_COMMAND, REJECT_COMMAND) well. A future remote terminal INPUT feature would require a different nonce/streaming model.

**Recommendation:** Document this in a code comment so the next developer knows the streaming-input threat model is unaddressed.

---

## 3. Architectural Recommendations (Priority Order)

1. **P0 — Amber contrast fix** (Finding 3): WCAG violation blocks accessibility compliance. Ship-blocker if accessibility is a requirement.
2. **P1 — SlidingWindowLimiter GC** (Finding 2): 5-line fix, high ROI for memory safety.
3. **P2 — claudeCodeRunner CLI flags upgrade** (Finding 1): Improves output reliability and parseability. Do before shipping CC deviation flow.
4. **P3 — Terminal pre-classification buffering** (Finding 4): Improves safety but trades UX (no typeahead). Revisit after MVP.
5. **P4 — Companion remote input threat model** (Finding 5): Document-only until feature is planned.

---

## 4. Current Verdict

**Architecture:** 9/10 — clean separation, well-tested, appropriate use of abstractions.  
**Security:** 8/10 — strong foundations (Ed25519, nonce, lockout, env sanitization, command classification). Amber contrast is the only concrete WC3 fail.  
**Completeness:** 8/10 — all MVP features present. The two gaps (CLI flags, rate limiter GC) are tactical, not strategic.  
**Test coverage:** 9/10 — 25 tests for TerminalManager, deviation service tests exist, rate limiter test exists. Missing: companion terminal forwarding integration test, sliding window GC test, claudeCodeRunner flag test.

**Overall:** Solid branch. Ship after amber contrast fix and rate limiter GC.
