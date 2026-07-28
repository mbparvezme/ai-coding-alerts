# AI Coding Alerts — Accounts Backend Deployment Guide & Checklist

> Covers **sub-project #1 (Accounts & Auth)**: the unified Next.js-on-Cloudflare app in `web/`,
> its D1 database, GitHub OAuth, Ed25519 entitlement tokens, and the Paddle subscription webhook.
> The v1 `server/` Worker is retired — everything below is the `web/` app.
>
> Branch: `feature/accounts` (implemented, reviewed, green; not yet merged/deployed).

---

## 0. What you are deploying

| Piece | Where | Purpose |
|-------|-------|---------|
| `web/` app | Cloudflare **Workers** (via `@opennextjs/cloudflare`) | All backend API + web login |
| D1 database `ai-coding-alerts` | Cloudflare D1 | users / subscriptions / devices / settings_backups / processed_events |
| GitHub OAuth App | github.com | Web dashboard login (Auth.js) |
| Ed25519 keypair | you generate | Signs the offline entitlement token the extension verifies |
| Paddle account + webhook | Paddle (sandbox → live) | Turns payments into subscription rows |
| Extension constants | `src/license/constants.ts` | Point the shipped extension at the deployed API + bake the public key |

**Golden rule:** do the entire flow in **Paddle sandbox** and against a **staging Worker** first. Only
promote to live after a real end-to-end purchase works in sandbox.

---

## 1. Pre-flight checklist (accounts required)

- [ ] Cloudflare account with Workers + D1 enabled, `wrangler` logged in (`wrangler login`)
- [ ] A domain/route for the Worker (the extension is hard-coded to `https://aicodingalert.com/api` — see §7)
- [ ] GitHub account with permission to create an OAuth App
- [ ] Paddle account (start in **sandbox**)
- [ ] Node 18+ locally (for `gen-keys.mjs` and builds)

---

## 2. Provision the D1 database

```bash
cd web
wrangler d1 create ai-coding-alerts
```

- [ ] Copy the printed `database_id` into `web/wrangler.toml` → `[[d1_databases]] database_id` (replace `REPLACE_WITH_D1_ID`)
- [ ] Apply the schema:

```bash
wrangler d1 execute ai-coding-alerts --remote --file=./schema.sql
```

- [ ] Verify the five tables exist:

```bash
wrangler d1 execute ai-coding-alerts --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Expect: `users`, `subscriptions`, `devices`, `settings_backups`, `processed_events`.

---

## 3. Generate the Ed25519 signing keypair

```bash
cd web
node scripts/gen-keys.mjs
```

It prints two values:

- **PRIVATE** (`base64 pkcs8`) → becomes the Worker secret `LICENSE_SIGNING_PRIVATE_KEY`
- **PUBLIC** (`base64 raw`) → becomes the extension constant `LICENSE_PUBLIC_KEY_B64`

- [ ] Store the **private** key somewhere safe (password manager) — you set it as a secret in §5
- [ ] Paste the **public** key into `src/license/constants.ts` → `LICENSE_PUBLIC_KEY_B64` (§7)

> ⚠️ The private key never leaves the server; the public key is safe to ship inside the extension.
> If the private key ever leaks, generate a new pair, re-deploy the secret, and re-publish the
> extension with the new public key — old tokens keep verifying until you rotate.

---

## 4. Create the GitHub OAuth App (web dashboard login)

GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App.

- [ ] **Homepage URL:** `https://aicodingalert.com` (your domain)
- [ ] **Authorization callback URL:** `https://aicodingalert.com/api/auth/callback/github`
- [ ] Generate a client secret
- [ ] Save the **Client ID** → secret `GITHUB_OAUTH_CLIENT_ID`
- [ ] Save the **Client secret** → secret `GITHUB_OAUTH_CLIENT_SECRET`

> Note: the **extension** does NOT use this OAuth App — VS Code supplies the GitHub token natively
> via `getSession('github', ['user:email'])`. This OAuth App is only for the browser dashboard.

---

## 5. Set Worker secrets

```bash
cd web
wrangler secret put LICENSE_SIGNING_PRIVATE_KEY   # private key from §3
wrangler secret put GITHUB_OAUTH_CLIENT_ID         # from §4
wrangler secret put GITHUB_OAUTH_CLIENT_SECRET     # from §4
wrangler secret put AUTH_SECRET                    # random 32+ byte string, e.g. `openssl rand -base64 32`
wrangler secret put PADDLE_WEBHOOK_SECRET          # from Paddle, §8 (set after creating the webhook)
```

- [ ] `LICENSE_SIGNING_PRIVATE_KEY`
- [ ] `GITHUB_OAUTH_CLIENT_ID`
- [ ] `GITHUB_OAUTH_CLIENT_SECRET`
- [ ] `AUTH_SECRET` (any high-entropy string; used by Auth.js to sign the JWT session)
- [ ] `PADDLE_WEBHOOK_SECRET` (fill in after §8)

> These are read at runtime via `getCloudflareContext().env` (see `web/src/server/lib/env.ts`).
> For local dev, copy `web/.dev.vars.example` → `web/.dev.vars` and fill in the same names.

---

## 6. Build & deploy the Worker

```bash
cd web
npm ci
npm run typecheck          # must be clean
npm test                   # 34 Vitest/Miniflare tests — must be green
npm run build              # @opennextjs/cloudflare build
wrangler deploy            # or: npx opennextjs-cloudflare deploy, per package.json scripts
```

- [ ] Typecheck clean, tests green, build succeeds
- [ ] Worker deployed and reachable at your domain
- [ ] Confirm the route serves: `curl https://aicodingalert.com/api/auth/github` should return `400 {"ok":false,"error":"bad_request"}` (route is alive; it just wants a POST body)

> `trustHost: true` is already set in `web/src/auth.ts` — required because this runs on Workers
> (not Pages/Vercel), where Auth.js would otherwise throw `UntrustedHost` on the OAuth callback.

---

## 7. Point the extension at production & bake the public key

Edit `src/license/constants.ts`:

- [ ] `LICENSE_BASE_URL` — must be `<your-origin>/api` (default `https://aicodingalert.com/api`). The `/api` suffix is **mandatory** — routes live under `/api/*`.
- [ ] `LICENSE_PUBLIC_KEY_B64` — paste the **public** key from §3 (replace `REPLACE_WITH_ED25519_PUBLIC_KEY_BASE64`)
- [ ] `PADDLE_CHECKOUT_URL` — the pricing/checkout page the `upgrade` command opens (default `https://aicodingalert.com/#pricing`)

Then rebuild/republish the extension:

```bash
npm test && npm run build && npx tsc --noEmit   # 117 tests, build, zero tsc errors
npx vsce package                                 # produces the .vsix to publish
```

> The public key baked here must match the private key set in §5. Mismatch = every token fails
> verification and no one is ever "Pro".

---

## 8. Paddle — products, webhook, and the accountId linkage (do in SANDBOX first)

### 8a. Products / prices
- [ ] Create the **Pro** product with a **monthly** and a **yearly** price
- [ ] Note: the backend maps `billing_cycle.interval` → `month`→`monthly`, `year`→`yearly`. Use those intervals.

### 8b. Webhook (notification destination)
- [ ] Add a webhook/notification destination → URL: `https://aicodingalert.com/api/webhooks/paddle`
- [ ] Subscribe to these events: `subscription.created`, `subscription.activated`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`, `subscription.paused`
- [ ] Copy the webhook **secret** → set it as `PADDLE_WEBHOOK_SECRET` (§5)

### 8c. **CRITICAL — accountId must ride into checkout `custom_data`**
The webhook links a subscription to a user **only** via `data.custom_data.accountId` (our `users.id`).
The checkout that creates the subscription **must** pass `custom_data: { accountId: "<users.id>" }`.

- [ ] The dashboard/pricing checkout injects the signed-in user's `accountId` into Paddle checkout `custom_data`
- [ ] **Verify in sandbox:** complete a test purchase, then check the incoming webhook payload contains `data.custom_data.accountId`, and that a row appears in `subscriptions` for that `user_id`

> Without this, payments succeed but **no one becomes Pro** — the webhook silently ignores events with no matching account. (Wiring the checkout page to inject `accountId` is part of sub-project #2, the dashboard. Do not go live until it is verified.)

### 8d. Verify the signature scheme against live Paddle docs
- [ ] Confirm Paddle still signs as `Paddle-Signature: ts=<unix>;h1=<hex HMAC-SHA256 of "ts:rawBody">` (what `web/src/server/paddle/signature.ts` expects). If Paddle's format has changed, update the verifier before going live.

---

## 9. End-to-end verification (sandbox)

- [ ] **Web login:** visit the site, sign in with GitHub → a `users` row is created (`SELECT * FROM users`)
- [ ] **Extension sign-in:** run the extension's sign-in command → `POST /api/auth/github` returns a token; a `devices` row appears; extension reports signed-in (free tier, `status: inactive`)
- [ ] **Device limit:** sign in from a 4th device → expect `409 device_limit` (limit is 3)
- [ ] **Purchase:** buy Pro in sandbox → webhook fires → `subscriptions` row with `status=active`
- [ ] **Entitlement flips:** trigger the extension's recheck (or next-day) → `POST /api/auth/refresh` returns `status: active` → extension shows Pro
- [ ] **Settings backup:** PUT then GET `/api/settings-backup` round-trips a blob
- [ ] **Cancel:** cancel in sandbox → webhook sets `status=canceled` → next refresh drops the user to inactive
- [ ] **Deactivate:** run device-deactivate → `devices` row removed, token cleared

---

## 10. Go live (promote from sandbox)

- [ ] Swap Paddle to **live** mode; recreate products/prices/webhook in live
- [ ] Set the **live** `PADDLE_WEBHOOK_SECRET`
- [ ] Re-confirm the live webhook delivers and `custom_data.accountId` is present
- [ ] Publish the extension `.vsix` (with production `LICENSE_BASE_URL` + real public key)
- [ ] Smoke-test one real purchase with a real card (refund it) before announcing

---

## 11. Secret & config inventory (quick reference)

| Name | Type | Set where | Source |
|------|------|-----------|--------|
| `database_id` | config | `web/wrangler.toml` | §2 `wrangler d1 create` |
| `LICENSE_SIGNING_PRIVATE_KEY` | secret | `wrangler secret put` | §3 gen-keys PRIVATE |
| `AUTH_SECRET` | secret | `wrangler secret put` | random 32B |
| `GITHUB_OAUTH_CLIENT_ID` | secret | `wrangler secret put` | §4 |
| `GITHUB_OAUTH_CLIENT_SECRET` | secret | `wrangler secret put` | §4 |
| `PADDLE_WEBHOOK_SECRET` | secret | `wrangler secret put` | §8b |
| `LICENSE_PUBLIC_KEY_B64` | extension const | `src/license/constants.ts` | §3 gen-keys PUBLIC |
| `LICENSE_BASE_URL` | extension const | `src/license/constants.ts` | `<origin>/api` |

---

## 12. Rollback / safety notes

- **Bad deploy:** `wrangler rollback` (or redeploy the prior build). D1 data is unaffected by Worker redeploys.
- **Schema change:** additive migrations only against live D1; never `DROP` a populated table. Write a new `.sql` migration and apply with `wrangler d1 execute`.
- **Key compromise:** rotate the Ed25519 pair, redeploy `LICENSE_SIGNING_PRIVATE_KEY`, republish the extension with the new public key. Users re-verify on next refresh.
- **Webhook secret leak:** rotate in Paddle, update `PADDLE_WEBHOOK_SECRET`.
- **Never** commit real secret values. The only committed secret is the throwaway TEST signing key in the Vitest config (test-only).
