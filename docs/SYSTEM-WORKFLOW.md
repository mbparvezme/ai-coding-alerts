# AI Coding Alerts — System Workflow (backend / how the system works)

> How the **accounts + licensing system** works server-side: identity, entitlement, payments, and
> the offline token. This is the *system* view — the VS Code extension is just one client of these
> APIs. (Extension-internal behavior lives elsewhere.)

---

## 1. The three moving parts

```
   GitHub (identity)        Paddle (money)          Cloudflare (our backend)
        │                        │                    ┌──────────────────────┐
        │  verifies who you are  │  tells us who paid │   web/ Worker + D1    │
        └───────────►────────────┴─────────►──────────┤  - GitHub OAuth login │
                                                       │  - /api/auth/*        │
                                                       │  - /api/webhooks/paddle
                                                       │  - Ed25519 signer     │
                                                       └──────────┬───────────┘
                                                                  │ signed token
                                                                  ▼
                                                         any client (extension,
                                                         dashboard) verifies offline
```

- **GitHub is the identity provider.** We never store passwords. A user *is* their GitHub numeric id (`github_id` — stable, never the mutable username).
- **Paddle is the source of truth for payment.** We never process cards. Paddle tells us, via signed webhooks, who has an active subscription.
- **Our Cloudflare Worker (`web/`) is the broker.** It joins identity + payment into an **account**, and mints a short-lived, cryptographically signed **entitlement token** that any client can verify *offline*.

The database (D1) has five tables: `users`, `subscriptions`, `devices`, `settings_backups`, `processed_events`.

---

## 2. The account is the join key

Everything hangs off `users.id` (our own opaque account id):

- `users.github_id` links the account to a **GitHub identity** (set at first sign-in).
- `users.id` is what we push into **Paddle checkout `custom_data.accountId`**, so when money arrives we know whose account it belongs to.
- `subscriptions.user_id`, `devices.user_id`, `settings_backups.user_id` all reference `users.id`.

So the account id is the hub that ties *"who you are on GitHub"* to *"what you paid for on Paddle"* to *"which machines you activated."*

---

## 3. Identity: how we know who you are

We verify GitHub in **two independent ways**, depending on the client:

### 3a. Web dashboard → Auth.js OAuth (`/api/auth/[...nextauth]`)
Standard GitHub OAuth redirect flow (`web/src/auth.ts`):
1. User clicks "Sign in with GitHub" → redirect to GitHub → callback to `/api/auth/callback/github`.
2. Auth.js `jwt` callback calls `upsertOnSignIn(profile)` → creates/updates the `users` row → stamps `accountId` into the session JWT.
3. Session is a **stateless JWT** (`session: { strategy: "jwt" }`), signed with `AUTH_SECRET`. No server session table.

### 3b. Extension / API clients → GitHub token verification
API clients (the extension) send a **GitHub access token** (VS Code supplies it natively). The server verifies it by calling GitHub *as the user* (`web/src/server/account/github.ts`):
1. `GET https://api.github.com/user` with `Authorization: Bearer <token>`.
2. If GitHub returns 200 → we trust the `id`/`login`/`name`/`email`. If email is private, we fall back to `GET /user/emails` for the primary verified address.
3. **Any non-200 from GitHub → `null` → the handler returns `401 github_auth`.** This matters (see §7): it means `github_auth` is *not* proof the account is gone — GitHub could just be having a bad moment.

> The join key is always the numeric `github_id`, never the username (usernames change).

---

## 4. Entitlement: how we know what you paid for

`resolveEntitlement(subscription)` (`web/src/server/account/entitlement.ts`) is the whole rule:

- Active subscription row → `{ status: "active", plan }`
- Anything else (no row, canceled, past_due, paused) → `{ status: "inactive" }`

That's it. The extension's own `state.ts` turns `status: "active"` into "Pro". Free users are simply signed-in accounts with no active subscription — they still get an account (and settings backup), just `status: inactive`.

---

## 5. The entitlement token (the heart of the system)

Instead of the extension phoning home on every check, the server mints a **self-contained, signed token** the client verifies **offline** with a baked-in public key.

**Minting** (`web/src/server/account/mintToken.ts`), signed with the Ed25519 **private** key (`LICENSE_SIGNING_PRIVATE_KEY`):

```
{ sub: <accountId>, deviceId, status, plan, iat, exp }      exp = iat + 7 days
```

**Verifying:** the client holds only the **public** key (`LICENSE_PUBLIC_KEY_B64`). It checks the signature and `exp` locally — no network needed.

**Lifetimes (the offline story):**
- **7-day TTL** — a fresh token is valid for a week.
- **14-day offline grace** — even expired, a client keeps honoring the last token for up to 14 days offline, so a laptop off the grid over a holiday doesn't lose Pro.
- **Daily recheck** — clients silently call `/api/auth/refresh` once per local calendar day to get a fresh token and pick up subscription changes. Non-blocking; failures fall back to the grace window.

This design means: **the backend can be briefly down, or the user offline, without breaking Pro** — and revocation still happens within days via the daily refresh + short TTL.

---

## 6. The API surface (what each endpoint does)

All under `web/src/app/api/**` — thin adapters over framework-agnostic `(request, deps)` handlers in `web/src/server/**`.

| Endpoint | Method | Auth | What it does |
|----------|--------|------|--------------|
| `/api/auth/github` | POST | GitHub token + deviceId | **Sign in / activate a device.** Verify GitHub → upsert user → enforce 3-device limit → mint token. Returns token + status + account. |
| `/api/auth/refresh` | POST | GitHub token + deviceId | **Daily recheck.** Verify GitHub → user must exist (`404 no_account` if deleted) → touch device → re-read subscription → mint a fresh token. |
| `/api/auth/deactivate` | POST | GitHub token + deviceId | Remove this device from the account (frees a device slot). |
| `/api/settings-backup` | GET / PUT | GitHub token (Bearer or body) | **The free carrot.** Store/restore a settings JSON blob (≤64 KB) per account, so free users sync across machines. |
| `/api/webhooks/paddle` | POST | Paddle HMAC signature | Ingest subscription lifecycle events (see §8). |
| `/api/auth/[...nextauth]` | — | Auth.js | Browser OAuth login for the dashboard. |

**Device limit:** 3 active devices per account (`DEVICE_LIMIT` in `authGithub.ts`). A 4th sign-in returns `409 device_limit` until one is deactivated.

---

## 7. Error semantics (why they matter)

The extension treats server responses very differently, so the codes are load-bearing:

| Code / result | Meaning | Client reaction |
|---------------|---------|-----------------|
| `ok: true` + `status` | Definitive current entitlement | Store token, advance the day |
| `no_account` (404) | **Definitive:** account truly gone | Clear the token, sign out |
| `github_auth` (401) | GitHub said non-200 — **could be transient** | **Keep** the cached token (use the 14-day grace), do *not* advance the day, retry next start |
| `network` / `server` (5xx) | We're unreachable | Keep token, retry next start |

The key subtlety: a brief GitHub outage during the once-daily recheck must **not** sign a paying user out. Only `no_account` is treated as final; `github_auth` is treated as transient. (This was a real bug caught in final review and fixed.)

---

## 8. Payments: the Paddle webhook flow

When a user pays (or their subscription changes), Paddle POSTs to `/api/webhooks/paddle`. The handler (`web/src/server/handlers/webhook.ts`) is deliberately defensive:

```
1. Read raw body + `Paddle-Signature` header.
2. Verify HMAC-SHA256 over  `ts:rawBody`  against PADDLE_WEBHOOK_SECRET  (constant-time compare).
       └─ bad signature → 401 bad_signature   (reject forgeries)
3. JSON.parse (guarded) — malformed-but-signed → 200 ignored  (so Paddle stops retrying)
4. parsePaddleEvent — only subscription.* events we care about; else → 200 ignored
5. Dedupe: if event_id already in processed_events → 200 duplicate   (replay-safe)
6. Link: read data.custom_data.accountId → find that user →
       upsert subscriptions row (status, plan) + set paddle_customer_id
7. Record event_id in processed_events → 200 ok
```

**Why each guard exists:**
- **Signature check** — nobody can forge "user X is now Pro."
- **`ts:body` HMAC** — binds the signature to the exact bytes + timestamp Paddle sent.
- **Event-id dedupe** (`processed_events`, check-first / record-last) — Paddle retries deliveries; we must apply each event exactly once.
- **`custom_data.accountId`** — the *only* link from a payment back to our account. If it's missing, the event is ignored (no user to attach it to). **This is why the checkout page must inject `accountId`** — see the deployment guide §8c.
- **Plan mapping** — `billing_cycle.interval` `month`→`monthly`, `year`→`yearly`.
- **Status** — one of `active | past_due | canceled | paused`; only `active` yields Pro.

The webhook only *writes subscription state*. It never mints tokens. Entitlement reaches the client on the **next `/api/auth/refresh`** (within a day), which reads the updated subscription and mints a token reflecting it.

---

## 9. End-to-end: a user's full lifecycle

```
FREE
 1. User signs in (web or extension) with GitHub.
 2. Server verifies GitHub → creates users row → (extension) mints token status=inactive.
 3. User has an account: settings backup works; not Pro.

UPGRADE
 4. User checks out on Paddle; checkout carries custom_data.accountId = users.id.
 5. Paddle → webhook → subscriptions row status=active for that user.
 6. Within 24h the client calls /api/auth/refresh → gets a token with status=active → Pro unlocked.
    (Signature verified offline; valid 7 days, 14-day grace if offline.)

STEADY STATE
 7. Once per local day the client silently refreshes → fresh 7-day token, picks up any change.
 8. Up to 3 devices; a 4th is refused until one deactivates.

DOWNGRADE / CANCEL
 9. User cancels → Paddle webhook sets status=canceled.
10. Next daily refresh mints status=inactive → client drops to free (within a day, bounded by TTL).

ACCOUNT DELETION
11. If the user row is gone, refresh returns no_account → client clears token and signs out.
```

---

## 10. Trust boundaries (one-paragraph summary)

The server **trusts GitHub** for identity (verified per-request by calling GitHub with the user's own token) and **trusts Paddle** for payment (verified per-webhook by HMAC signature). It converts those two trusted facts into one **signed artifact** — the Ed25519 entitlement token — that clients verify **without trusting the network**, using only a baked-in public key. Short TTL + daily refresh keeps revocation timely; the 14-day grace keeps offline users working. The private signing key and all provider secrets live only in Cloudflare Worker secrets; the extension ships only the public key.
