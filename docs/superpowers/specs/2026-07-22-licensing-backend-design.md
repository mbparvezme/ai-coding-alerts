# AI Coding Alerts — Licensing Backend Design

**Date:** 2026-07-22
**Status:** Approved design (brainstormed). Ready for implementation planning.
**Scope:** The licensing system — the gate every paid feature sits behind. This is the FIRST premium sub-project. It is infrastructure, not user-facing features.

---

## 1. Background

**AI Coding Alerts** is a published-ready VS Code extension (v0.7.0, publisher `mbparvezme`, repo root `D:\ai-coding-alerts`) that alerts a developer (sound + OS notification + window focus + Telegram push) when Claude Code needs their attention.

The **free tier is complete** (all local features + mobile push via the user's own Telegram bot). We now want a **paid (Pro) tier**. Everything paid must sit behind a license check — this document designs that licensing system.

Premium features that will *later* consume this system (not built here): remote actions (approve/deny from Telegram), managed common bot, metered push, cloud sync, richer dashboard, CSV/JSON export.

## 2. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Billing model | **Subscription** (monthly/yearly) | Premium features include backend services with recurring cost |
| Payments provider | **Paddle** | Merchant of Record (handles global VAT); **supports Bangladesh sellers via bank/wire payout**. Lemon Squeezy was rejected: PayPal can't receive in Bangladesh and BD isn't on its bank-payout list. |
| License validation | **Hybrid** — activate online once, cache a signed token offline, re-check periodically | Best UX for an editor; handles cancellation/refund on next check |
| Trial | **None** — the generous free tier is the trial | Keeps licensing to a simple active/inactive state; no trial-abuse tracking |
| Backend stack | **Cloudflare Workers + D1** | Serverless, cheap, global, SQL; extends cleanly to the later push relay / cloud sync |
| Enforcement | **Soft gate** (client checks a signed token) for now | A determined user can patch it out; acceptable at launch. Hard-gated features come later via server-side relay. |

## 3. Architecture

```
                          ┌─────────────────────────────┐
   Paddle checkout ──────▶│  Cloudflare Worker + D1     │
   (subscription)         │                             │
        │  webhook        │  POST /webhooks/paddle      │──┐ generate license key,
        └────────────────▶│  GET  /license?txn=…        │  │ upsert license row
                          │  POST /license/activate     │  │
   VS Code extension ────▶│  POST /license/validate     │  ▼
   (LicenseService)       │  POST /license/deactivate   │  D1: licenses, activations
                          └─────────────────────────────┘
```

- The **Worker** turns a Paddle subscription into a license, and issues short-lived **signed tokens** the extension can verify offline.
- The **extension** activates a key once, caches the token in `SecretStorage`, exposes `isPro()`, and re-checks periodically.

## 4. Backend (Cloudflare Workers + D1)

### 4.1 Endpoints

| Method / path | Purpose |
|---|---|
| `POST /webhooks/paddle` | Verify Paddle signature. On `subscription.created`/`activated` → generate a **license key**, insert `licenses` row (status `active`). On `subscription.updated`/`canceled`/`past_due` → update status. |
| `GET /license?txn=<paddle_txn_id>` | Post-checkout success page. Looks up the generated key for that transaction and displays it to the buyer. (No email service in v1.) |
| `POST /license/activate` | Body `{ licenseKey, deviceId }`. Check key exists + status `active` + activation count < `device_limit`. Upsert activation. Return a **signed license token** (TTL 7 days). Errors: 404 key not found, 409 device limit reached, 403 subscription inactive. |
| `POST /license/validate` | Body `{ licenseKey, deviceId }`. The periodic re-check. Return a fresh signed token + current status. Updates `last_seen_at`. |
| `POST /license/deactivate` | Body `{ licenseKey, deviceId }`. Remove the activation to free a slot. |

### 4.2 D1 schema

```sql
CREATE TABLE licenses (
  license_key            TEXT PRIMARY KEY,
  paddle_subscription_id TEXT UNIQUE,
  paddle_customer_id     TEXT,
  email                  TEXT,
  status                 TEXT NOT NULL,          -- active | past_due | canceled
  plan                   TEXT,                   -- monthly | yearly
  device_limit           INTEGER NOT NULL DEFAULT 3,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

CREATE TABLE activations (
  license_key  TEXT NOT NULL REFERENCES licenses(license_key),
  device_id    TEXT NOT NULL,
  activated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (license_key, device_id)
);
```

### 4.3 License key generation
Random, unguessable (e.g. `crypto.randomUUID()` twice, or a 32+ char base32 string). Store as-is; treat as a bearer secret.

### 4.4 Signed token (offline-verifiable)
- The Worker signs a small JWT with an **Ed25519 (or RS256) private key** (a Worker secret).
- Payload: `{ sub: <hashed licenseKey>, deviceId, status: "active", plan, iat, exp }` (exp = now + 7 days).
- The extension verifies the signature with the **public key baked into the extension** — so verification is offline and users can't forge a token.
- Use Web Crypto (`crypto.subtle`, which supports Ed25519 in Workers) on the server; a small JWT/JOSE lib or Web Crypto on the client.

### 4.5 Paddle webhook events to handle
`subscription.created`, `subscription.activated`, `subscription.updated`, `subscription.canceled`, `subscription.past_due` (names per current Paddle Billing — verify against live docs). Map each to a `licenses.status`.

### 4.6 Secrets (Worker)
- `PADDLE_WEBHOOK_SECRET` — to verify webhook signatures.
- `LICENSE_SIGNING_PRIVATE_KEY` — to sign tokens.
- (D1 binding configured in `wrangler.toml`.)

## 5. Extension side (`src/license/`)

Consumer of the backend. Kept separate from the alert pipeline.

- **`deviceId`** — random UUID generated once, stored in `globalState` (not secret).
- **Storage** — license key + latest signed token in VS Code **`SecretStorage`**.
- **`LicenseService.isPro(): boolean`** — synchronous; verifies the cached token's signature (public key) + not expired + status `active`.
- **Activation** — command `AI Coding Alerts: Enter Pro License` → prompt for key → `POST /license/activate` → store token + key.
- **Re-check** — on startup and every ~3 days → `POST /license/validate` → refresh token. Grace: token TTL 7 days; if the server is unreachable, keep honoring the cached token up to **14 days** before downgrading (don't punish offline/travelling users). A canceled subscription flips to inactive at the next successful re-check.
- **Commands** — `Enter Pro License`, `Manage License` (show status, deactivate this device, remove key).
- **`requirePro(feature): boolean`** — future premium features call this; if not Pro, show an upsell message with an Upgrade link (Paddle checkout URL).
- **Constants baked in** — backend base URL, token verification public key.

**Existing free features must not change or become gated.**

## 6. Error handling

| Situation | Behaviour |
|---|---|
| Offline at activation | Can't activate (needs one online activation). Clear message. |
| Offline during re-check | Honor cached token within the 14-day grace window. |
| Bad/typo key | Server 404 → "License key not found." |
| Device limit reached | Server 409 → offer to deactivate another device. |
| Subscription canceled | Next successful re-check flips `isPro()` to false after grace. |
| Backend down | Same as offline; grace applies. |

## 7. Testing

- **Extension (node --import tsx --test, existing DI pattern):** token verification, the active/expired/grace/inactive state machine, deviceId generation — with injected clock + fake network. No `vscode` import in pure modules.
- **Backend (Vitest + Miniflare / `@cloudflare/vitest-pool-workers`):** webhook signature verification, key generation, activate/validate/deactivate, device-limit enforcement, D1 interactions.
- **Manual/integration:** Paddle **sandbox** checkout → webhook → key shown → activate in a real extension host.

## 8. Out of scope (YAGNI for this sub-project)

- Email delivery of keys (success page shows it; add email later).
- Trials, accounts/login (key-based only).
- Refund UI (Paddle handles it).
- The premium features themselves — they only consume `isPro()`/`requirePro()`.
- The push relay / cloud sync (separate later sub-projects on the same Worker).

## 9. Prerequisites the human must do (outside code)

1. **Paddle seller account**, approved for Bangladesh, with a **product + monthly/yearly prices** created (start in **sandbox**).
2. **Cloudflare account** (Workers + D1 enabled).
3. Decide the **price points** (monthly / yearly) and the **device limit** (default 3).
4. Generate the **Ed25519 keypair** (private → Worker secret, public → extension constant).

## 10. Open decisions to confirm before/at planning

- Monthly & yearly **price** amounts.
- **Device limit** (default 3 — confirm).
- Token **TTL** (7 days) and **grace window** (14 days) — confirm.
- Whether to add **email delivery** of the key in v1 (default: no, success page only).
- Final **endpoint host/domain** for the Worker.

## 11. Resources (verify against live docs — versions move)

**Cloudflare**
- Workers: https://developers.cloudflare.com/workers/
- D1: https://developers.cloudflare.com/d1/
- Wrangler CLI: https://developers.cloudflare.com/workers/wrangler/
- Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Vitest testing: https://developers.cloudflare.com/workers/testing/vitest-integration/
- Web Crypto (Ed25519 in Workers): https://developers.cloudflare.com/workers/runtime-apis/web-crypto/

**Paddle (Billing)**
- Developer docs: https://developer.paddle.com/
- Subscriptions: https://developer.paddle.com/build/subscriptions/overview
- Webhooks + signature verification: https://developer.paddle.com/webhooks/signature-verification
- Sandbox: https://developer.paddle.com/api-reference/about/sandbox

**VS Code**
- SecretStorage API: https://code.visualstudio.com/api/references/vscode-api (search "SecretStorage")
- Publishing: https://code.visualstudio.com/api/working-with-extensions/publishing-extension

**In-repo skills to use in the new conversation:** `cloudflare`, `wrangler`, `workers-best-practices`, `durable-objects` (for the later relay), plus `context7` / web search for current Paddle docs.

## 12. Suggested workflow for the new conversation

1. Open the new conversation **in the `D:\ai-coding-alerts` repo** and point it at this spec file.
2. Confirm the **open decisions** in §10 (prices, device limit).
3. Set up the human prerequisites (§9) in **sandbox** first.
4. Use `superpowers:writing-plans` to turn this spec into a step-by-step implementation plan (backend first: schema → webhook → activate/validate → tokens; then the extension `src/license/` module).
5. Build backend and extension pieces test-first, matching the repo's existing DI + node-test conventions.
6. End-to-end test against Paddle **sandbox** before touching live.

The backend and the extension module are independently buildable — the contract between them is the four endpoints in §4.1 and the token format in §4.4.
```
