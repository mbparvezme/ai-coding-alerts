# AI Coding Alerts — Managed Permission Relay Design

**Date:** 2026-09-14
**Status:** Approved design (brainstormed). Ready for implementation planning.
**Scope:** The **managed permission relay** — a seller-hosted Telegram bot that delivers an agent's permission request to a Pro user's phone and routes the approve/deny decision back to the originating device. This is **sub-project #4** of the post-pivot roadmap (accounts → dashboard → free DIY bot → **managed relay**). It builds on #1 (accounts/tokens/devices) and #3 (the free DIY two-way bot protocol), and is the headline **paid** feature.

**Explicitly scoped to the relay only.** Automatic cross-device settings/history sync — sometimes bundled with the "managed" idea — is a separate, independent subsystem and becomes **sub-project #5**. The one dashboard surface added here is the minimal Telegram-linking + status UI the relay needs.

---

## 1. Background & where this fits

**AI Coding Alerts** (VS Code extension, publisher `mbparvezme`, repo root `D:\ai-coding-alerts`) alerts a developer when Claude Code needs their attention.

- **#1 accounts** (built + deployed): GitHub OAuth, `users`/`subscriptions`/`devices`/`settings_backups` in D1, Ed25519 entitlement token (`sub = accountId`, + `deviceId`, 7-day TTL / 14-day grace / daily recheck), `isPro()` offline. Next.js-on-Cloudflare-Workers app.
- **#2 web frontend** (merged): marketing site + dashboard + Paddle checkout.
- **#3 free DIY two-way bot** (merged, PR #4): approve/deny an agent's `PermissionRequest` from the user's **own** Telegram bot. All two-way traffic is user-machine ↔ their bot (`getUpdates` long-poll); **zero seller cost**.

**This sub-project (#4)** delivers the *paid* equivalent: one **seller-hosted** bot, zero user setup, that works across the user's devices. The engineering problem it solves is routing a decision from a shared server bot back to a specific device that has no public URL.

### 1.1 Cost boundary (a load-bearing property)
- **Free (DIY, #3):** user's own bot token on the user's machine; the extension talks directly to `api.telegram.org`. The seller's server is never in that path. **Seller marginal cost: $0**, regardless of volume.
- **Paid (managed, #4):** the seller's bot + server *are* in the path. Every `/relay/*` call requires a valid entitlement token, so only Pro users can invoke it; the cost is covered by the subscription.
- A free user only ever touches seller infrastructure if they *optionally* create an account (once-per-day token refresh + occasional settings blob) — negligible, inside Cloudflare's free allowances.

## 2. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| **Scope** | **Relay only**; cross-device sync split to #5 | Relay (real-time request routing) and sync (background state replication) are independent subsystems; bundling bloats the spec. |
| **Transport** | **Server-poll — NO Durable Object / WebSocket** | The device is always the initiator (the hook fires locally), and #3 already solved decision-delivery by polling. Device→server→poll is NAT-proof, stateless, cheap, and reuses tested machinery. A DO/WS buys ~2s of latency nobody notices on a human phone tap, at the cost of always-on connections + billing + lifecycle code. |
| **Local machinery** | **Unchanged from #3** | The blocking `permission-hook`, `IngressServer` `/permission`+`/decision`, `PendingDecisionStore`, `callbackData`, `AllowRules` are reused verbatim. Only the `permissionController` *deps* (the "broker") are swapped. |
| **Mode default** | **Managed is the default for Pro + Telegram-linked users** | They paid for the zero-setup convenience. A `preferManagedBot` setting (default true) lets a privacy-conscious Pro user force their own DIY bot instead. |
| **Buttons** | **Managed = 2 buttons (✅ Approve / ⛔ Deny) only** | #3's "Approve & remember" (a local session allow-rule) and "Mute" (local `MuteController`) are device-local concepts; threading them back through a server round-trip adds complexity for little value. Managed keeps the core gate clean; remember/mute remain **DIY-only**. |
| **Fail-safe** | **Every failure → native prompt** (never fails open) | Server down, not linked, token expired, no answer, originating device gone — all collapse to "no decision → Claude Code's native dialog", exactly as #3. |
| **Decision store** | **D1 (`relay_requests`), lazy-expired** | Strongly consistent (the poll must see the decision immediately — KV's eventual consistency is disqualifying), one store, easy ownership checks. Rows are ephemeral and never logged. |
| **Entitlement check** | **Trust the signed token (≤7-day revocation lag)** | Consistent with #1's model — the token TTL *is* the revocation lag. No per-request D1 subscription lookup. |

## 3. Architecture & end-to-end flow

**One-line idea:** keep #3's entire *local* machinery; swap only the broker via `permissionController` deps — DIY sends to the user's bot and polls Telegram; **managed sends to our server and polls our server.** Same shape, different endpoint.

**Two new subsystems:**

1. **Server** (extends the existing Next.js-on-Workers app + D1): relay endpoints + the seller-bot Telegram webhook + linking. Stateless Worker logic over D1.
2. **Extension** (managed broker mode): a `ManagedTransport` wired into `createPermissionSystem` when the user is **Pro + linked**, plus a pure `modeSelect` precedence function.

**End-to-end flow (managed):**
```
Claude Code hook ──blocking POST──▶ local IngressServer /permission        (unchanged from #3)
                                          │
                              broker (managed): POST /relay/permission ──▶ Worker
                                                                            │ store pending row, send Telegram
   phone ◀────────── seller bot msg  [✅ Approve] [⛔ Deny] ──────────────────┘
     │ tap
     └─▶ Telegram ──webhook──▶ Worker POST /webhooks/telegram
                                   │ verify chat owns requestId, write decision, edit message
   broker polls GET /relay/decision/:id ──▶ reads allow/deny ──▶ resolves local PendingDecisionStore
                                                                    │
   local hook's poll returns allow/deny ──▶ Claude Code proceeds or is blocked
```

**Device targeting & fail-safe:** the `requestId` is owned by `(user_id, device_id)`; only the originating device polls for it. If that device is gone when the tap lands, the row is simply never read — the device already hit its 5-min timeout → **native prompt**. There is no path where a failure auto-approves.

## 4. Mode selection (extension)

A **pure precedence function** picks exactly one broker per request (never double-notifies):

1. **Managed** — `isPro()` **and** account is Telegram-linked **and** `preferManagedBot` is on.
2. **DIY (#3)** — else if the user configured their own bot (`enableTelegramPush` + `enableTelegramTwoWay` + `telegramBotToken` + `telegramChatId`).
3. **Native** — else emit nothing → Claude Code's native prompt.

- **`isPro()` is local** (cached entitlement token — startup never blocked). **Linked-status** rides on the daily `/auth/refresh` response and is cached locally. So mode selection is **fully offline on the hot path** — no network call when a permission request fires.
- New setting **`preferManagedBot` (default `true`)** — the privacy opt-out that keeps a Pro user on their own bot.
- Linking is never forced: an unlinked Pro user falls through to DIY (if configured) or native.

## 5. Data model (D1)

New tables (extend #1's schema; `expired` is computed on read from `expires_at`, mirroring `PendingDecisionStore`):

```sql
CREATE TABLE telegram_links (          -- one Telegram chat <-> one account
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  chat_id    TEXT NOT NULL UNIQUE,     -- UNIQUE: a Telegram chat cannot serve two accounts
  linked_at  INTEGER NOT NULL
);

CREATE TABLE telegram_link_codes (     -- short-lived deep-link codes (~10 min)
  code       TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE relay_requests (          -- ephemeral pending decisions (~5 min)
  request_id    TEXT PRIMARY KEY,      -- opaque uuid, carried in callback_data
  user_id       TEXT NOT NULL REFERENCES users(id),
  device_id     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | allow | deny
  tg_message_id INTEGER,                          -- to edit "Approved/Denied" after a tap
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);
CREATE INDEX idx_relay_requests_user ON relay_requests(user_id);
```

- `relay_requests` rows are deleted on resolve or lazily swept after expiry; the command text is **never persisted** on the row and **never logged** (see §8).

## 6. Endpoints

All on the existing Next.js-on-Workers app. `/relay/*` auth = a valid unexpired Ed25519 entitlement token (Bearer), verified by signature offline; `sub` yields the account, and the token's `deviceId` is the originating device.

| Route | Auth | Behavior |
|---|---|---|
| `POST /relay/link-code` | token or web session | Generate a one-time `linkCode` (~10 min TTL) for the account; return `{ code, deepLink }` where `deepLink = https://t.me/<SellerBot>?start=<code>`. |
| `POST /relay/permission` | token | Body `{ tool, command, ttlSec }` — device from the token's `deviceId`; `ttlSec` mirrors the extension's `permissionTimeoutSec` so the row's `expires_at` aligns with the local hook's timeout. If the account has no `telegram_links` row → **409 not-linked** (broker falls back). Else mint `requestId`, insert a pending `relay_requests` row (`expires_at = now + ttlSec`), send the seller-bot Telegram message (truncated command, two inline buttons `✅ Approve` / `⛔ Deny` keyed by `callback_data = v1:<requestId>:<choice>`, `choice ∈ approve\|deny`), store `tg_message_id`, return `{ requestId, expiresAt }`. Enforce per-account concurrency + rate caps (§8). |
| `GET /relay/decision/:requestId` | token | Verify the row's `user_id` matches the token account; return `{ status }` (lazy-expire: `pending` past `expires_at` → `expired`). This is what the managed broker polls (~2–3s). |
| `POST /webhooks/telegram` | Telegram secret header | The seller bot's webhook. **callback_query** (button tap): parse `callback_data`, load the `relay_requests` row, verify the tap's `chat_id` equals the `telegram_links.chat_id` for that row's `user_id`; if still pending & unexpired, set `status` (idempotent first-wins), edit the message (`✅ Approved` / `⛔ Denied`), `answerCallbackQuery`. **message `/start <code>`**: complete linking (see §7). |

**Dashboard (minimal):** a "Connect Telegram" action calling `POST /relay/link-code` and rendering the deep link + "Open Telegram" button; a linked/unlinked indicator with an "Unlink" action (deletes the `telegram_links` row). Device list/status reuses #1's existing dashboard data.

## 7. Telegram linking UX

1. Dashboard **"Connect Telegram"** → `POST /relay/link-code` → show deep link `https://t.me/<SellerBot>?start=<code>` + "Open Telegram" button.
2. User taps → Telegram opens the seller bot → auto-sends `/start <code>`.
3. Webhook receives `/start <code>` + the sender's `chat_id`: validate the code (exists, unexpired); upsert `telegram_links(user_id, chat_id)`; delete the code; reply **"✅ Linked — approval requests will arrive here."**
   - If `chat_id` is already linked to a *different* account → reject with an explanatory reply, do not relink.
   - If the code is unknown/expired → reply asking the user to generate a fresh link from the dashboard.
4. **Unlink** from the dashboard → delete the `telegram_links` row.
5. The extension learns linked-status from a field piggybacked on the daily `/auth/refresh` response (plus a manual **"AI Coding Alerts: Refresh account status"** command), cached locally — so mode selection needs no extra hot-path call.

## 8. Security & abuse

- **Auth:** every `/relay/*` call requires a valid unexpired entitlement token (signature-verified offline; `sub` = account). Revocation lag is the token TTL (≤7 days), consistent with #1.
- **Decision ownership:** the webhook accepts a tap only when its Telegram `chat_id` matches the `telegram_links.chat_id` owning the `requestId`. `requestId` is an opaque uuid; even if guessed, a non-owning chat cannot decide it. Status is idempotent first-wins.
- **Webhook authenticity:** Telegram webhook secured with a secret URL path **and** the `X-Telegram-Bot-Api-Secret-Token` header (`TELEGRAM_WEBHOOK_SECRET`); reject mismatches.
- **Blast radius:** cap concurrent pending requests per account and a per-minute `POST /relay/permission` rate, so a compromised device can't spam a user's phone (Telegram's own send limits are a second backstop).
- **Privacy:** the command text transits the seller's server + Telegram — **must be documented in the privacy policy**. It is **truncated (~200 chars)** in the message, **never stored** on the `relay_requests` row, and **never logged**. The `preferManagedBot = false` escape hatch (§4) keeps privacy-conscious Pro users on their own bot.
- **Transport back-channel:** `callback_data` carries only `v1:<requestId>:<choice>` — no command text on the return path.

## 9. Components — reused vs new

**Reused verbatim (no changes):** `hooks/permission-hook.{sh,ps1,cmd}`, `src/ingress/IngressServer.ts`, `src/permission/PendingDecisionStore.ts`, `src/permission/callbackData.ts` (used with `choice ∈ approve|deny` in managed), and the `createPermissionSystem` shell (deps are the injection point). `src/permission/AllowRules.ts` and `MuteController` remain in the shared shell but are **not exercised in managed mode** — the "Approve & remember" allow-rule and "Mute" are DIY-only (§2 Buttons), so managed simply never populates them.

**New — extension (`src/`):**
- `src/permission/managedTransport.ts` — implements the broker deps against the relay: `create(payload)` → `POST /relay/permission`; a poll loop over `GET /relay/decision/:id`; maps `{status}` → the store's resolve. Injected `fetch`/clock for tests.
- `src/permission/modeSelect.ts` — the pure precedence function (§4): `selectBroker({ isPro, linked, preferManaged, diyConfigured }) → "managed" | "diy" | "native"`.
- Account-status plumbing: extend the `/auth/refresh` client + local cache to carry `telegramLinked`; a "Refresh account status" command; a "Connect Telegram" command that opens the dashboard link.
- `extension.ts` wiring: choose the broker per request via `modeSelect`; construct the managed vs DIY deps accordingly. Config: `preferManagedBot` (default true) in `package.json` + `readAlertSettings`.

**New — server (`web/`):**
- A framework-agnostic `relay/` core: `createLinkCode`, `completeLink`, `createRelayRequest`, `readDecision`, `handleTelegramCallback` — pure `(input, deps)` functions with an injected Telegram transport + D1 repo, tested without Next.
- Thin Next route handlers: `/relay/link-code`, `/relay/permission`, `/relay/decision/[id]`, `/webhooks/telegram`.
- A seller-bot Telegram client (`sendMessage`/`editMessageText`/`answerCallbackQuery`) over `node:https`/`fetch`, injectable for tests.
- D1 schema additions (§5); dashboard "Connect Telegram"/unlink UI.

## 10. Testing strategy

- **Server:** the `relay/` core unit-tested with Miniflare + D1 and an **injected Telegram transport** (no real network), mirroring #1's crypto-core tests. Cases: create → pending; tap → allow/deny + message edit; **ownership rejection** (foreign chat); expiry; `/start` link happy-path; **relink-conflict** (chat already owned); not-linked → 409; webhook-secret rejection; concurrency/rate caps.
- **Extension:** `ManagedTransport` with injected `fetch` (POST → `requestId`, poll → status mapping, timeout → native); `modeSelect` as a pure function covering all three branches — reusing #3's injected-deps, network-free, VS-Code-free pattern.
- **Manual (human step):** one real end-to-end with the registered seller bot + a phone (register bot → link → trigger a permission prompt → approve/deny → confirm the agent proceeds/stops → confirm timeout falls back to native), as with #3's smoke test.

## 11. Secrets inventory (new)

| Secret | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | The seller-hosted bot's token (Worker secret; never committed). |
| `TELEGRAM_WEBHOOK_SECRET` | Value checked against `X-Telegram-Bot-Api-Secret-Token` on the webhook. |

Alongside the existing inventory (`GITHUB_OAUTH_*`, `AUTH_SECRET`, `LICENSE_SIGNING_PRIVATE_KEY`, `PADDLE_WEBHOOK_SECRET`).

## 12. Out of scope & human steps

**Out of scope (later):**
- Cross-device settings/history sync → **sub-project #5** (leans on the already-built `settings_backups` endpoints).
- Any managed *notification* delivery beyond the permission-approval relay (e.g. one-way completion pushes through the seller bot) — not needed for the paid headline; revisit only if asked.

**Human steps before/at implementation:**
- **Register the seller Telegram bot** with @BotFather → obtain `TELEGRAM_BOT_TOKEN` and the bot username (`<SellerBot>`); set the webhook URL (`/webhooks/telegram`) with `TELEGRAM_WEBHOOK_SECRET`.
- Add the two new Worker secrets to the deployed environment.
- **Privacy policy update:** disclose that, for managed-bot users, tool command text transits the seller's server + Telegram (with the `preferManagedBot=false` opt-out).
- Apply the §5 schema additions to the live D1 database.
