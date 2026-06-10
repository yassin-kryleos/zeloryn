# Mobile Companion

## 1. Purpose

The Kryleos Forge Mobile Companion extends the Build Loop to mobile. It is not a full coding tool. It is a planning, monitoring, and light-execution surface that lets users ideate in PLAN, check Today's tasks, and trigger FORGE execution from their phone — while the heavy work stays on Desktop.

**Launch phasing:** mobile ships as a public beta 4–6 weeks after Desktop V1. Do not block the Desktop launch on mobile.

## 2. Platform

**Native iOS and Android.** PWA is not sufficient — native push notifications (execution results, FORGE run completion), reliable background sync, and home screen widget for Today view require native APIs.

## 3. Sync Model — Async V1, Real-Time V2

### V1 — Async (queue + sync when Desktop is online)

- Mobile queues PLAN messages and execution trigger commands locally when offline or Desktop is unreachable.
- When the Desktop app is running and online, the relay service delivers queued items automatically.
- PLAN Build mode messages sync to Desktop and appear in the same session within seconds of Desktop detecting the relay queue.
- Execution triggers queue and fire as soon as Desktop picks them up.
- Sync direction: Mobile → Desktop (PLAN messages, execute commands). Desktop → Mobile (execution results, trace summaries, FLOW Today updates).

### V2 — Real-Time (cloud relay)

- Replace async polling with a persistent WebSocket relay (Cloudflare Worker or equivalent lightweight service).
- Mobile and Desktop maintain a live connection; changes propagate in under 1 second.
- Required for: live execution progress streaming to mobile, multi-device collaborative editing (Agency/Team).

V1 async is sufficient for Solo and Solo Plus. V2 real-time is required for Agency/Team collaboration.

## 4. Remote Execution Trigger

The mobile companion can trigger FORGE execution on Desktop:

1. User taps "Execute" on a Today view task in mobile.
2. Mobile posts an `execute_item` command to the relay service (REST endpoint, lightweight).
3. Desktop Forge app polls the relay (or receives via push if V2) and picks up the command.
4. Desktop runs the FORGE agent as normal, with full approval gates intact — the user must approve shell commands on Desktop, not on mobile.
5. Mobile shows task status: "Queued for Desktop" → "Running on Desktop" → "Complete" (with criteria summary pushed back via relay).

**Security:** relay commands are authenticated with the same Kryleos Sync token. Desktop never auto-executes without the local command approval gate — mobile only triggers the workflow, it cannot bypass Desktop safety controls.

## 5. Screens (V1)

### Home — Today View

Default landing screen. Mirrors FLOW Today view exactly.

- Shows 3–5 prioritized unblocked tasks (same deterministic score algorithm as Desktop).
- Each task card shows: title, category badge, status, acceptance criteria count.
- Tap task → task detail (criteria list, last trace summary, blocker info).
- **Execute** button: sends execute trigger to relay → queues for Desktop.
- **Execute All Today** button: queues all Today items as a sequence.
- Pull-to-refresh syncs latest FLOW state from Desktop.
- Execution result notification: push notification when Desktop completes a task ("Login System — 3/3 criteria passed").

### PLAN Space

- Input toggles: **Build mode** (default) / **Ask mode** — same segmented control as Desktop.
- Build mode messages queue locally if offline; sync to Desktop session on connectivity.
- Ask mode messages are ephemeral — not queued, not synced.
- Spec accumulates across sessions, same as Desktop.
- File `@mentions` are available if the workspace path is known, but file previews require Desktop connectivity.

### Notifications

- FORGE execution completed: "Task [name] — all criteria passed / N criteria failed."
- New "What's Left" items available (if user has a scheduled or triggered run).
- Blocker resolved: "Task [name] is now unblocked — ready to execute."

## 6. Out of Scope — V1

- CREW space (reviewing and refining plans on mobile).
- FORGE direct (running agents natively on mobile — execution always delegates to Desktop).
- File browser and file editing.
- Git operations.
- Preview Deck.
- FLOW full Kanban board (only Today view in V1).
- Voice input (deferred to V2).
- Real-time execution progress streaming (V2 real-time relay required).
- Multi-user collaboration (Agency/Team — requires V2 relay).

## 7. Tier Gating

| Feature | Free | Solo | Solo Plus | Founder+ |
|---|:---:|:---:|:---:|:---:|
| Today view (read-only) | Yes | Yes | Yes | Yes |
| PLAN Build/Ask mode | Yes | Yes | Yes | Yes |
| Execute trigger → Desktop | Yes | Yes | Yes | Yes |
| PLAN sync to Desktop | No | No | Yes | Yes |
| Execution result push notifications | No | Yes | Yes | Yes |
| Cross-device PLAN session continuity | No | No | Yes | Yes |

Free users can view Today view and queue PLAN notes locally, but sync to Desktop requires Solo Plus. Execute trigger works on all tiers (it delegates to Desktop, which enforces its own tier gates).

## 8. Technical Architecture

### Relay Service

A lightweight stateless relay (Cloudflare Worker or equivalent):

```
POST /relay/queue        — mobile queues a command (PLAN message or execute trigger)
GET  /relay/poll         — Desktop polls for queued commands (V1 async)
POST /relay/result       — Desktop posts execution result for mobile to receive
GET  /relay/result/poll  — mobile polls for execution results (V1 async)
```

Authentication: Kryleos Sync token in Authorization header. All payloads are end-to-end: relay stores only opaque payloads, no plaintext plan or code content.

### Mobile App Stack

- React Native (iOS + Android from one codebase).
- Expo for native module access and OTA updates.
- Local SQLite for PLAN queue and offline state.
- Push notifications via Expo Notifications (APNs + FCM).

### Desktop Relay Client

The Desktop Forge app adds a lightweight relay polling loop (runs in the main process background):

- Polls `GET /relay/poll` on a 5-second interval when a Sync token is configured.
- On execute command received: queues the plan item for FORGE execution with the same approval gate as a manual Execute.
- Posts result to `POST /relay/result` after completion.

## 9. Acceptance Criteria (V1 Launch)

- User can open Today view on mobile and see the same 3–5 tasks as Desktop FLOW Today.
- Tapping Execute on mobile queues the item and it appears in FORGE on Desktop within 10 seconds (when Desktop is online).
- Desktop executes with full command approval gate intact — no bypassing safety controls.
- Execution result push notification arrives on mobile within 30 seconds of Desktop completing.
- PLAN Build mode message typed on mobile appears in Desktop PLAN session within 10 seconds (Solo Plus+).
- App functions in offline mode: Today view shows last-synced state; PLAN messages queue locally and sync on reconnect.
- All V1 out-of-scope features are absent or labeled "Coming soon."
