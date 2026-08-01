# Free DIY Two-Way Telegram Bot — Design Spec

**Sub-project #3 of the AI Coding Alerts managed-convenience roadmap.**

**Date:** 2026-07-31
**Status:** Approved design — ready for implementation plan
**Repo:** `D:\ai-coding-alerts` (VS Code extension)

---

## 1. Goal

Let a free, self-hosted user **approve or deny an AI coding agent's permission
request from their phone**, using the user's *own* Telegram bot. When Claude
Code stops to ask "can I run this command?", the extension pings Telegram with
Approve / Deny buttons; the tapped decision flows back and the agent proceeds
or stops — with zero server cost to us (all traffic is user-machine ↔ Telegram).

This is the free "try-before-buy" that markets the paid managed bot (#4). It
ships before the site is published.

## 2. Background — what exists today

The current Telegram integration is **one-way and fire-and-forget**:

- The hook script (`hooks/alert-hook.sh` / `.cmd`) POSTs the Claude Code
  payload to the extension's local ingress and gets a `202` **immediately** —
  it never waits for a decision. If no listener, it plays a fallback sound.
- `IngressServer` accepts `POST /alert`, parses, and fires the payload onto the
  `AlertBus`; reactors run. (`src/ingress/IngressServer.ts`)
- `TelegramNotifier` is **send-only** — it calls `sendTelegramMessage`, which
  only hits Telegram's `sendMessage`. No `getUpdates`, no `inline_keyboard`.
  (`src/reactors/TelegramNotifier.ts`, `src/platform/telegramSend.ts`)
- `ClaudeCodeDetector` already classifies `PreToolUse` / `PermissionRequest`
  events as `type: "permission"`, reading `tool_name` and
  `tool_input.{command,description}`. (`src/detection/ClaudeCodeDetector.ts`)
- The `Alert` model **already** carries `status: "pending" | "approved" |
  "denied"` and `respondedAt` — the two-way shape was anticipated but nothing
  ever sets it. (`src/model/Alert.ts`)
- On bind, the extension **rewrites the hook to point at its own port** ("Hooks
  were updated to match", `src/extension.ts:145`), with port fallback via
  `candidatePorts`. Preferred port default 51789.

So #3 = make permission alerts **block for a decision**, add action buttons,
add a `getUpdates` loop to catch the tap, and route the decision back to the
waiting hook.

## 3. Scope

**In scope**

- Two-way **approve / deny** for `PermissionRequest` events via the user's own
  bot, gating the agent's tool call.
- Four buttons: **Approve**, **Deny**, **Approve & remember**, **Mute**.
- A blocking hook (POST + poll) that returns Claude Code's permission decision.
- A `getUpdates` long-poll loop with `callback_query` handling, message
  editing, and `chatId` validation.
- Timeout → fall back to Claude Code's native permission prompt.
- PC-side parity: the extension's own Approve/Deny notification, synchronized
  with Telegram (first decision wins).

**Out of scope** (explicitly deferred)

- **Settings backup/restore** wiring — its own small follow-up (backend
  endpoints already exist; extension client code does not).
- **Managed bot / relay / cross-device sync** — sub-project #4.
- Multi-agent support beyond Claude Code (the detector is Claude-Code-specific;
  the two-way path is built on `PermissionRequest`, a Claude Code event).

## 4. Locked decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| No-response behavior | **Wait up to a configurable timeout (default 5 min), then fall back to the local prompt** | Safe superset of today's behavior; no surprise auto-approve/deny |
| Blocking transport | **POST + poll** (`POST /permission` → id, then `GET /decision/:id`) | No long-held sockets; survives extension restart mid-wait; minimal change to existing ingress |
| Gated event | **`PermissionRequest`, not `PreToolUse`** | `PermissionRequest` fires *only* when a decision is genuinely needed (no per-tool spam) and sidesteps the desktop-harness `PreToolUse` reliability issue |
| Buttons | Approve / Deny / **Approve & remember** (session allow-rule) / **Mute** | Full set — no MVP compromise |
| Multi-window | **Single broker window** (the hook's current port target) | The hook already targets one window; that window is the sole Telegram sender + poller. No leader lock / disk coordination needed |
| "Approve & remember" scope | **Session-scoped, in-memory**, keyed on `agent + tool + normalized command` | Not persisted to disk — safer; cleared on window reload |

### Verified Claude Code hook contract

Confirmed against the current Claude Code hooks docs (code.claude.com/docs/en/hooks):

- A **`PermissionRequest`** hook returns
  `hookSpecificOutput.decision.behavior` ∈ `{"allow","deny"}`.
- Claude Code **waits synchronously** for the hook; default hook timeout is
  **600 s (10 min)** (overridable via the hook's `timeout` field).
- If the hook returns **no** decision, the **normal permission dialog shows** —
  this is exactly our timeout fallback, obtained for free.
- The `PermissionRequest` payload includes `tool_name` and `tool_input` (the
  existing detector already relies on this for permission events), giving us
  the fields for the message body and the allow-rule key.

Our decision timeout (5 min) sits safely inside the 600 s hook timeout.

## 5. Architecture & data flow

```
Claude Code (PermissionRequest)
   │  runs the permission hook (blocking), payload on stdin
   ▼
permission-hook.(sh|cmd)  ──POST /permission──►  IngressServer (broker window)
   │                                                │
   │  poll GET /decision/:id every ~2s              ├─ PendingDecisionStore.create(id)
   │  (until allow/deny/expired)                    ├─ check session allow-rule → maybe resolve "allow" now
   ▼                                                ├─ TelegramActionNotifier.send(inline_keyboard) ─► Telegram
emit hookSpecificOutput.decision.behavior           └─ show PC notification (Approve/Deny)
   │  allow  → tool runs
   │  deny   → tool blocked                        getUpdates loop (broker only, while pending)
   │  (none) → native dialog (timeout/no listener)   │  callback_query → validate chatId
   ▼                                                  │  → PendingDecisionStore.resolve(id, choice)
Claude Code proceeds                                  │  → answerCallbackQuery + editMessageText
                                                      ▼
                                        PC notification & Telegram message
                                        both reflect the outcome (first wins)
```

**Broker window.** Because the hook points at exactly one window's port
(last-writer-wins on bind), that window receives *all* hook payloads. It is
therefore the **only** window that: creates pending decisions, sends Telegram
messages, shows PC notifications, and polls `getUpdates`. No other window has
pending decisions, so no other window polls → no Telegram `409` conflict, and
no cross-window coordination is required. A `409` from `getUpdates` is treated
as "another poller is active" → back off and retry (a backstop for transient
overlap during window handoff).

**Poll only while needed.** The `getUpdates` loop runs only while the broker
has ≥ 1 pending permission decision (plus a short idle tail), then stops. This
keeps exactly one active poller and avoids idle network chatter.

## 6. Components

### New

- **`src/permission/PendingDecisionStore.ts`** — in-memory registry of pending
  permission decisions, keyed by id.
  - `create(alert): { id }` — registers a pending decision with `createdAt` and
    the timeout.
  - `resolve(id, "allow"|"deny", source): boolean` — first call wins; returns
    false if already resolved/expired.
  - `get(id): { status: "pending"|"allow"|"deny"|"expired" }` — for the poll
    endpoint.
  - Emits a change event so the PC notification and getUpdates handler can
    react; sweeps expired entries.
  - Pure/isolated — unit-testable without VS Code or network.

- **`src/permission/AllowRules.ts`** — session-scoped auto-approve rules.
  - `key(alert): string` = `${agent}|${tool}|${normalizedCommand}`.
  - `remember(alert)`, `matches(alert): boolean`, `clear()`.
  - In-memory only; no persistence.

- **`src/platform/telegramApi.ts`** — thin Telegram Bot API client extending
  the existing send-only helper. Adds:
  - `sendMessage(token, chatId, text, replyMarkup?)` (inline keyboard)
  - `editMessageText(token, chatId, messageId, text)` (clear buttons + show
    outcome)
  - `answerCallbackQuery(token, callbackQueryId, text?)`
  - `getUpdates(token, offset, timeoutSec)` (long poll)
  - Same injectable/mockable shape as today's `TelegramSender` so tests stay
    network-free.

- **`src/permission/TelegramPoller.ts`** — owns the `getUpdates` loop.
  - Tracks the update `offset` (in `context.globalState`, so a restart resumes
    without reprocessing).
  - Validates `callback_query.message.chat.id` (and/or `from.id`) against the
    configured `chatId`; ignores anything else.
  - Parses `callback_data` (`v1:<id>:<choice>`), routes to
    `PendingDecisionStore.resolve` / `AllowRules.remember` / mute.
  - Calls `answerCallbackQuery` + `editMessageText` to reflect the outcome.
  - Starts when a decision becomes pending, stops on idle; backs off on `409`.

- **`src/permission/permissionController.ts`** — glue invoked from
  `handlePayload` when `alert.type === "permission"`: checks `AllowRules`
  (auto-resolve), otherwise registers the pending decision, sends the Telegram
  action message, shows the PC notification, and starts the poller.

- **`hooks/permission-hook.sh` / `hooks/permission-hook.cmd`** — the blocking
  hook: reads the payload, `POST /permission` → `{id}`, polls
  `GET /decision/:id` every ~2 s until `allow`/`deny`/`expired` or its own
  hard cap, then prints the Claude Code decision JSON (or nothing, to fall back
  to the native dialog). On connection failure (no listener) it prints nothing
  and exits 0 → native dialog.

### Modified

- **`src/ingress/IngressServer.ts`** — add `POST /permission` (register + return
  `{id}`) and `GET /decision/:id` (return status). Keep `POST /alert` for
  one-way notifications unchanged.
- **`src/reactors/TelegramNotifier.ts`** — stays one-way and handles only
  non-permission alerts. Permission alerts are routed to `permissionController`
  instead of this reactor. Factor the shared "enabled / token / chatId / muted"
  guard into a small helper that both the notifier and the controller reuse, so
  the gating logic lives in one place.
- **`src/extension.ts`** — wire `permissionController` into `handlePayload`;
  construct the store, allow-rules, poller, and Telegram API client; register an
  **"Unmute Telegram alerts"** command.
- **Hook installer** (the one-click setup that deploys scripts + writes Claude
  Code hook config) — also deploy `permission-hook.*` and register a
  **`PermissionRequest`** hook entry pointing at it (with an appropriate
  `timeout`). Existing `Notification`/`Stop` hook entries stay.
- **`MuteController`** — reused for the Mute action (see §9).

## 7. Message format & buttons

Permission alert message (Telegram, `inline_keyboard`):

```
🔔 Permission needed
Claude Code wants to run: npm run test

[ ✅ Approve ]            [ ⛔ Deny ]
[ ✅ Approve & remember ] [ 🔕 Mute ]
```

- `callback_data`: `v1:<id>:approve | deny | remember | mute`.
- After any tap: `answerCallbackQuery` (stops the button spinner) +
  `editMessageText` to remove the keyboard and show the outcome, e.g.
  `✅ Approved from phone · 9:41 PM`, `⛔ Denied`, `✅ Approved (will remember)`,
  or (on a Mute tap with the request still open) leave the decision buttons and
  append `🔕 Alerts muted`.
- Non-permission alerts (completion / notification) remain **one-way**, no
  buttons — handled by the existing `TelegramNotifier`.

## 8. Timeout & fallback

- Decision timeout: **default 300 s, configurable** (`aiCodingAlerts.*`).
- The hook polls until the store reports `allow`/`deny`, or until the timeout
  (the store marks the entry `expired`), then the hook prints **no decision** →
  Claude Code shows its **native** permission dialog.
- On expiry, the Telegram message is edited to
  `⏱ Timed out — answer on your computer` so it isn't left with live buttons.
- No listener (VS Code closed / broker down): the hook's initial POST fails → no
  decision → native dialog. Two-way requires the extension to be running, which
  is expected.

## 9. Allow-rule ("remember") & Mute semantics

**Approve & remember.** Resolves the current request as `allow` *and* records
`AllowRules.remember(alert)`. Future `PermissionRequest`s whose
`agent|tool|normalizedCommand` key matches are auto-resolved `allow` in
`permissionController` **before** any ping — silent. Session-scoped: the map
lives in the broker window and clears on reload. Command normalization (trim,
collapse whitespace) is defined in `AllowRules` and unit-tested.

**Mute.** Silences **future** alerts; it does **not** decide the current
request (which still awaits Approve/Deny or times out — muting must never force
a risky auto-decision). Because every Telegram alert originates from the broker
window (all hook payloads land there), muting in the broker is globally
effective. Reuses `MuteController`; a default auto-expiry (e.g. 8 h) plus an
**"Unmute Telegram alerts"** command prevent a permanently silent bot. The
existing local mute (sounds/popups) is unchanged.

## 10. Error handling & edge cases

- **First-decision-wins:** `PendingDecisionStore.resolve` is idempotent; a
  second input (PC after phone, or a double tap) is a no-op and the UI shows the
  already-resolved outcome.
- **Stale button tap** (after resolve/expiry): `resolve` returns false;
  `answerCallbackQuery` shows "Already handled"; message already edited.
- **`getUpdates` 409** (another poller): back off, retry with jitter; do not
  crash.
- **Telegram/network failure while sending the action message:** fall back to a
  one-way informational send if possible; the PC notification still works, and
  timeout → native dialog still protects the agent.
- **Bad/foreign `callback_query`** (wrong `chatId`): ignored, offset still
  advanced so it isn't reprocessed.
- **Extension restart mid-wait:** the hook keeps polling; a restarted broker
  has lost the in-memory pending entry → `GET /decision/:id` returns `expired`
  (unknown id) → hook falls back to native dialog. Acceptable.
- **Concurrent pending decisions:** store is keyed by id; the poller routes each
  `callback_data` id independently.

## 11. Security & privacy

- Only accept `callback_query` whose chat/from id equals the configured
  `chatId`. The bot token and chatId stay local (extension settings); nothing
  leaves the user's machine except calls to `api.telegram.org`.
- `callback_data` is structured and validated; ids are opaque
  (`src/util/id`), not guessable resource references.
- No new outbound endpoints beyond Telegram; no account required (this is the
  free tier).

## 12. Testing strategy

Framework: existing `node:test` (extension suite). Keep everything
network-free via injected senders/clients, mirroring today's `TelegramSender`.

- **PendingDecisionStore:** create → pending; resolve once → allow/deny; second
  resolve → false; expiry → `expired`; change events fire.
- **AllowRules:** key normalization; `matches` true/false; `clear` on reset.
- **callback_data:** round-trip encode/parse; reject malformed; choice mapping.
- **TelegramPoller:** offset advance; `chatId` validation (accept/ignore);
  routing of each choice to the right effect; 409 backoff; injected
  `getUpdates`.
- **permissionController:** allow-rule auto-resolve path (no send); normal path
  registers pending + sends + shows PC notification; mute path.
- **IngressServer:** `POST /permission` returns an id and registers; `GET
  /decision/:id` reflects status transitions; unknown id → expired; `POST
  /alert` unchanged.
- **Hook script:** integration-level test of the poll loop against a stub HTTP
  server returning pending→allow, pending→deny, and pending→expired; assert the
  emitted JSON (or empty output) in each case, cross-platform (`.sh` + `.cmd`).
- **Detector:** already classifies `PermissionRequest` → permission (regression
  guard that `tool_name`/`tool_input` are surfaced).

## 13. Global constraints

- **Node ≥ 21** for the extension test glob (existing CI pins Node 24); no new
  runtime dependency — use `node:https`/`node:http` as the current code does.
- **Cross-platform hooks** — ship both `.sh` and `.cmd`; on Windows, follow the
  established rule: quoted path, **no** `cmd /c` wrapper (see project memory).
- **No behavior change for one-way alerts** — completion/notification paths and
  the offline sound fallback stay exactly as they are.
- **Free tier, no account** — nothing here may require sign-in or our backend.
- Reuse existing primitives (`Alert`, `AlertBus`, `MuteController`, `newId`,
  the injected-sender test pattern) rather than parallel machinery.

## 14. Open items to confirm during planning

- Exact shape of the Claude Code **`PermissionRequest`** JSON payload on stdin
  (field names for `tool_input`) and the precise **decision JSON** envelope,
  re-verified against the installed Claude Code version at plan time.
- How the one-click **hook installer** currently writes Claude Code hook config
  (user vs project settings), so the `PermissionRequest` entry is added the same
  way and the port-rewrite on rebind also updates the permission hook.
- Whether to gate two-way behind a settings flag
  (`aiCodingAlerts.telegram.twoWay`) defaulting on when a bot/chat is set.
```
