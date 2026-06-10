# Resolved Bugs Ledger

This ledger details the bugs identified and resolved during this QA sprint.

---

## 1. Sync DB Path Timing Bug (Import timing)
- **Severity**: **High**
- **Impact**: Caused test registers and dummy user actions to persist directly into the production database `C:\Users\yassi\.kryleos_sync_users.json` instead of the sandboxed `qa-db/` folder configuration, violating data isolation guidelines.
- **Root Cause**: `server.ts` imported `sync.ts` statically before calling `dotenv.config()`. `sync.ts` evaluated path paths at load time.
- **Resolution**: Redefined the directory structure in [sync.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/backend/sync.ts#L6-L14) to evaluate paths dynamically on each call inside a helper function `getPaths()`.

---

## 2. Codebase Visualizer Infinite Clustered Loading
- **Severity**: **Medium**
- **Impact**: The node visualizer stopped updating after frame 21, leaving all codebase nodes clustered in their default start arrangement and making the visualizer unreadable.
- **Root Cause**: Evaluating `maxVelocity` inside React's asynchronous state updating queue meant it evaluated to `0` immediately on ticks, triggering physics stabilization prematurely.
- **Resolution**: Refactored the layout calculation loop in [CodebaseGraph.tsx](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/components/CodebaseGraph.tsx) to execute synchronously directly on a mutable `useRef` array (`nodesRef.current`) before updating React state.

---

## 3. PII Redaction Regex Collision Bug
- **Severity**: **Medium**
- **Impact**: API keys containing long sequences of digits (e.g. `sk-proj-1234567890abcdef...`) would partially match the phone number regex, resulting in partial redactions like `sk-proj-[REDACTED_PHONE]abcdef...` instead of a full `[REDACTED_API_KEY]`.
- **Root Cause**: Phone number replacement filters were run prior to API key filters.
- **Resolution**: Re-ordered the replacement pipeline in [utils/redact.ts](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Mobile-app/src/utils/redact.ts) to evaluate API key signatures first.

