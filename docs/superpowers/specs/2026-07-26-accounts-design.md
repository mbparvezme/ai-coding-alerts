# AI Coding Alerts — Accounts & Auth Design

**Date:** 2026-07-26
**Status:** Approved design (brainstormed). Ready for implementation planning.
**Scope:** The accounts + authentication layer — user identity, the web dashboard's auth, and the extension's sign-in. This is **sub-project #1** of the post-pivot roadmap (accounts → dashboard → free DIY bot → managed relay). It replaces the anonymous license-key entitlement with an account-scoped one, reusing the existing signed-token machinery.

---

## 1. Background & the pivot

**AI Coding Alerts** is a published VS Code extension (publisher `mbparvezme`, repo root `D:\ai-coding-alerts`) that alerts a developer when Claude Code needs their attention.

The **v1 licensing backend is built and merged** (Cloudflare Worker + D1, Paddle webhooks, Ed25519 offline tokens, anonymous license keys — no accounts). That design deliberately chose *keys, not accounts* (see the licensing spec §2.1), leaving migration open.

**The business model pivoted (2026-07-23, confirmed):** the paywall moved from *capability* → *convenience/infrastructure* — **"self-host free, we-host-it paid."** Two things this pivot changed make accounts now justified (the exact "future trigger" the old spec named):

1. **The managed notification relay is a real per-user server service** — it needs a durable identity to route to, not just a binary entitlement.
2. **The seller wants user data for marketing** — which requires captured, consented identities.

So this sub-project introduces **accounts**. The account (via GitHub identity) becomes the thing that holds the Pro entitlement, replacing the bearer license key.

## 2. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| **Auth method** | **GitHub OAuth** | The audience is developers who already have GitHub; VS Code has *native* GitHub auth (no password modal in the editor); zero password custody for us. |
| **Signup posture** | **Account-first funnel** — must sign in before subscribing | Standard for subscription SaaS with one-click OAuth. The "$300M forced-registration" problem applies to *anonymous one-time* purchases, not subscriptions that inherently need an account. Lets us link the subscription to an identity from the first payment. |
| **Free accounts** | **Optional, with a carrot** | Free tier stays no-signup-wall. The carrot to register is **settings backup/restore across machines**. Registered free users are also marketing leads. |
| **Managed features** | **Strictly paid**, account-required | The free DIY bot is the try-before-buy; no free managed allowance, no trial. |
| **Stack** | **Unified Next.js app on Cloudflare Workers, sharing the same D1** | One codebase/deploy for dashboard + web auth + extension API + Paddle webhook. The backend is being reworked for accounts *anyway*, so the portable crypto core is re-homed once, in the framework with the strongest Paddle/Auth.js support. |
| **Entitlement token** | **Reuse the existing Ed25519 model**, now account-scoped (`sub = accountId`) | The signing/verification/offline machinery is built and tested; only the `sub` and the issuing path change. |
| **Token lifetimes** | **7-day TTL / 14-day offline grace / daily recheck (local day-boundary, non-blocking)** | Decouples revocation lag (short TTL protects the seller) from outage tolerance (long grace protects honest offline customers). Daily recheck catches refunds within ~a day at negligible cost. Recheck fires on the first activation of a new local calendar day, in the background — it must never block editor startup. A single flat value would weld those opposing needs together. |

## 3. Identity model — one account, two front doors

The core design property: **web login and extension login converge on the same `users` row and the same GitHub identity.** One account, two entry points, no duplicated identity.

```
                         GitHub identity (github_id)
                                   │
              ┌────────────────────┴────────────────────┐
              │                                          │
   Web dashboard (browser)                    VS Code extension
   Auth.js GitHub OAuth web flow              vscode.authentication.getSession('github', …)
              │                                          │
   HTTP-only session cookie                   GitHub token → POST /auth/github
              │                                          │
              └──────────────► users row ◄───────────────┘
                                   │
                       Ed25519 entitlement token
                       (sub = accountId, + deviceId)
```

### 3.1 Extension sign-in flow
1. Extension calls `vscode.authentication.getSession('github', ['user:email'], { createIfNone: true })` → gets a GitHub access token (VS Code's native UI handles consent; no password in the editor).
2. Extension `POST /auth/github` with that token.
3. Worker verifies the token against GitHub's API (`GET /user`, `GET /user/emails`), **upserts** the `users` row keyed by `github_id`, and returns the existing **Ed25519-signed entitlement token** with `sub = accountId` (+ `deviceId`), same 7/14/3 model.
4. Extension stores the entitlement token in **SecretStorage** (bearer secret — never logged). `isPro()` checks it **offline and synchronously** against the cached token (no network — startup is never blocked). A background recheck against `/auth/refresh` (the account-scoped successor to `/license/validate`) fires **once per local calendar day**, on the first activation after the local date rolls over.

### 3.1.1 Daily recheck — non-blocking, day-boundary
- The extension stores `lastCheckDay` = the local `YYYY-MM-DD` of the last successful recheck.
- On activation and on each periodic tick: if today's local date differs from `lastCheckDay`, run the recheck. Timezone is the machine's local clock (`Date`); nothing server-side is needed.
- The recheck is **fire-and-forget after activation completes** (the existing `init().catch` pattern) — it must not be awaited in the activation path and must add **zero extra latency to editor startup**. A closed editor at midnight simply rechecks on the next new-day open; when offline, it relies on the 14-day grace and retries when next online.
- Daily recheck sits comfortably inside the 7-day TTL, so an active daily user's token refreshes long before expiry and effectively never reaches grace.

### 3.1.2 How `/auth/refresh` authenticates
The daily recheck proves identity by **silently re-fetching the GitHub session token** — `vscode.authentication.getSession('github', ['user:email'], { createIfNone: false })`. VS Code caches the session, so this returns without any prompt or UI. The extension sends that token to `/auth/refresh`; the Worker re-verifies it against GitHub, re-resolves the `users` row, reads current subscription status, and returns a fresh entitlement token.
- **Chosen over** a refresh-token scheme (presenting the current entitlement token to mint the next) because re-verifying against GitHub each time is the most robust: it self-heals if the GitHub link or subscription changes, and there is no separate refresh-token expiry edge to manage.
- **If `getSession` returns nothing** (the user revoked the GitHub session): the recheck can't proceed silently → fall back to the offline grace window, and surface a re-sign-in prompt only when grace is near expiry (never block startup).

### 3.2 Web sign-in flow
1. User clicks "Sign in with GitHub" on the dashboard → Auth.js GitHub OAuth *web* flow.
2. On success, the same `users` upsert (same `github_id`), and an **HTTP-only, Secure, SameSite=Lax session cookie** is set (never a token in `localStorage`).

## 4. Account-first subscription funnel

Payment is linked to an identity from the very first transaction:

1. User must be **signed in** (web or extension) before starting Paddle checkout.
2. The dashboard opens Paddle checkout with the **`accountId` in Paddle `custom_data`**.
3. The Paddle **webhook** reads `custom_data.accountId` and links the `subscriptions` row to that user (and stores `paddle_customer_id` on the `users` row for support/reconciliation).
4. Entitlement (`isPro`) is thereafter derived from the user's subscription status, not from a standalone key.

This removes the v1 lost-key / dead-device support gaps entirely: there is no bearer key to lose, and devices hang off the account.

## 5. Data model (D1)

New/changed tables. `processed_events` (webhook dedupe) is unchanged from v1.

```sql
CREATE TABLE users (
  id                  TEXT PRIMARY KEY,        -- our account id; rides into Paddle custom_data
  github_id           INTEGER UNIQUE NOT NULL, -- stable GitHub numeric id (not username)
  email               TEXT,                    -- primary verified email from GitHub
  name                TEXT,
  username            TEXT,                    -- GitHub login/handle (mutable — display only)
  avatar_url          TEXT,
  paddle_customer_id  TEXT,                    -- set by webhook on first subscription
  marketing_consent   INTEGER NOT NULL DEFAULT 0, -- 0/1, unticked opt-in (GDPR)
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE subscriptions (
  paddle_subscription_id TEXT PRIMARY KEY,
  user_id                TEXT NOT NULL REFERENCES users(id),
  status                 TEXT NOT NULL,        -- active | past_due | canceled | paused
  plan                   TEXT NOT NULL,        -- monthly | yearly
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);

CREATE TABLE devices (                          -- was `activations`, now keyed to the account
  user_id      TEXT NOT NULL REFERENCES users(id),
  device_id    TEXT NOT NULL,
  activated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id)
);

CREATE TABLE settings_backups (                 -- the free carrot: settings sync/restore
  user_id     TEXT PRIMARY KEY REFERENCES users(id),
  blob        TEXT NOT NULL,                    -- JSON settings snapshot
  updated_at  INTEGER NOT NULL
);

-- processed_events: unchanged (event-id dedupe for webhook replay protection)
```

### 5.1 What GitHub gives us (captured with consent)
Verified **email**, **name**, **username/handle**, **avatar**, stable numeric **github_id**. These populate `users`. The numeric `github_id` — not the username — is the join key, because usernames are mutable.

### 5.2 Consent & compliance (required, non-negotiable)
- `marketing_consent` is an **unticked opt-in**; marketing email requires this explicit separate consent (GDPR / CAN-SPAM).
- Must ship: a **privacy policy**, a **delete-account** path (removes `users` + cascades), and an **unsubscribe** mechanism.
- Storing identity for *service operation* (entitlement, support) is lawful basis "contract"; using it for *marketing* needs the separate consent flag above.

## 6. Stack & endpoints

**One Next.js app on Cloudflare Workers**, binding the **same D1 database**. The v1 Worker's portable modules (Ed25519 sign/verify, encoding, Paddle signature verify, event parse, dedupe repository) move over near-verbatim as framework-agnostic lib code; the handler layer is re-homed as Next.js route handlers (it is changing for accounts regardless).

| Route | Purpose |
|---|---|
| Auth.js GitHub routes | Web dashboard OAuth login + session cookies |
| `POST /auth/github` | Extension: verify GitHub token → upsert user → return account-scoped entitlement token |
| `POST /auth/refresh` | Extension daily re-check (account-scoped successor to `/license/validate`); **authenticated by a silently re-fetched GitHub token** (see §3.1.2); re-verifies the account + subscription status, returns a fresh entitlement token, updates `devices.last_seen_at` |
| `POST /auth/deactivate` | Free a device slot (account-scoped successor to `/license/deactivate`) |
| `POST /webhooks/paddle` | Verify signature, dedupe by event id, link subscription to `custom_data.accountId`, store `paddle_customer_id`, update status |
| Dashboard pages | Account, subscription (via Paddle customer portal), devices, settings backup, delete account |
| `GET/PUT /settings-backup` | The free carrot: push/pull the settings blob |

Device limit (3) enforcement and the entitlement token contract are unchanged from v1; only the `sub` (now `accountId`) and the issuing path differ.

## 7. Sessions & token security

Two distinct auth contexts — deliberately not conflated:

- **Web (browser):** HTTP-only + Secure + SameSite=Lax session cookie (never `localStorage`). CSRF tokens on state-changing actions (Auth.js), SameSite as backstop. "Log out everywhere" invalidates server-side. Short session with silent refresh.
- **Extension:** the Ed25519 entitlement token in SecretStorage; 7-day TTL, 14-day offline grace, daily recheck (local day-boundary, non-blocking — see §3.1.1); a bearer secret, never logged.

**Secrets inventory** (all Worker secrets, none committed):

| Secret | Purpose |
|---|---|
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App (registered on GitHub — a human step) |
| `AUTH_SECRET` | Auth.js session-cookie signing |
| `LICENSE_SIGNING_PRIVATE_KEY` | Ed25519 entitlement token (unchanged from v1) |
| `PADDLE_WEBHOOK_SECRET` | Paddle webhook HMAC (unchanged from v1) |

The throwaway TEST signing key in `server/vitest.config.ts` remains the one allowed committed exception.

## 8. Migration from v1 (keys → accounts)

- The v1 `licenses` / `activations` tables retire in favor of `users` / `subscriptions` / `devices`. Since **nothing is deployed live yet** (no production keys issued), this is a clean cutover, not a data migration.
- The extension's `src/license/` module is refactored: key-entry commands (`enterLicense`, paste-key flow) are replaced by GitHub sign-in; the token cache / offline validation / `isPro()` core is retained.
- Deferred v1 items (email delivery of keys, lost-key recovery, deactivate-all) are **obsoleted** by accounts — there is no key to email or recover, and device management moves to the dashboard.

## 9. Explicitly out of scope (later sub-projects)

- The **web dashboard UI** itself (this spec defines its *auth* and *data*, not its pages/UX) → sub-project #2.
- The **free DIY action-bot** (user's own Telegram bot, long-polling) → sub-project #3.
- The **managed relay** (seller-hosted bot, Durable Object/WebSocket device routing) → sub-project #4.
- Paddle **field paths / signature scheme** must be verified against live Paddle docs before implementation (human step).

## 10. Open items requiring a human step

- Register a **GitHub OAuth App** (get client id/secret; set callback URL for the web flow).
- Verify Paddle `custom_data` propagation to the webhook and confirm the exact webhook field paths against live Paddle docs.
- Provide a **privacy policy** + confirm the **delete-account** and **unsubscribe** copy before launch.
