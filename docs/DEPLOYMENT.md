# Deploying the AI Coding Alerts Licensing Backend to Cloudflare

A complete, step-by-step guide. It assumes **no prior Cloudflare or Paddle experience** — just that you can open a terminal and copy/paste commands.

**Time needed:** ~45–60 minutes the first time.

---

## 0. What you are deploying

```
  Customer pays on Paddle
          │
          │  webhook (signed)
          ▼
  ┌───────────────────────────┐
  │  Cloudflare Worker        │   ← this is what you deploy
  │  + D1 database (SQL)      │
  └───────────────────────────┘
          │  license key + signed token
          ▼
  VS Code extension (checks Pro offline)
```

Three moving parts you will configure:

| Part | What it is | Where it lives |
|---|---|---|
| **Worker** | The API (webhook + activate/validate/deactivate + success page) | Cloudflare |
| **D1** | SQL database storing licenses and activations | Cloudflare |
| **Paddle** | Takes the payment, calls your webhook | paddle.com |

Plus one **Ed25519 keypair**: the Worker signs license tokens with the *private* key; the extension verifies them offline with the *public* key.

> **Golden rule:** the **private** key and the **Paddle webhook secret** are secrets. They go into Cloudflare via `wrangler secret put` and are **never** committed to git. The **public** key is not secret — it gets baked into the published extension.

---

## 1. Prerequisites

### 1.1 Accounts

- [ ] **Cloudflare account** — sign up free at https://dash.cloudflare.com/sign-up
  - The free plan is enough to start. (Workers Paid is only needed later for email sending.)
- [ ] **Paddle account** — sign up at https://www.paddle.com. You will do everything in **Sandbox** first.

### 1.2 Local tools

- [ ] **Node.js 20 or newer.** Check:

```bash
node --version
```

If it prints `v20.x` or higher you're fine. Otherwise install from https://nodejs.org.

### 1.3 Install project dependencies

From the repository root:

```bash
cd server
npm install
```

**Checkpoint —** confirm the backend is healthy before deploying anything:

```bash
npm test
```

Expected: `Test Files 15 passed (15)` and `Tests 63 passed (63)`.

---

## 2. Connect to Cloudflare

All commands in this section run from the **`server/`** directory.

### 2.1 Log in

```bash
npx wrangler login
```

A browser window opens — click **Allow**. If you're on a machine with no browser, use `npx wrangler login --browser false` and open the printed URL manually.

Verify:

```bash
npx wrangler whoami
```

Expected: your email address and account ID.

### 2.2 Create the D1 database

```bash
npx wrangler d1 create ai-coding-alerts
```

Output looks like:

```
✅ Successfully created DB 'ai-coding-alerts'

[[d1_databases]]
binding = "DB"
database_name = "ai-coding-alerts"
database_id = "a1b2c3d4-5678-90ab-cdef-1234567890ab"
```

**Copy the `database_id` value.**

### 2.3 Paste the database ID into config

Open `server/wrangler.toml` and replace the placeholder:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ai-coding-alerts"
database_id = "REPLACE_WITH_D1_DATABASE_ID"   # ← replace this line
```

with your real ID:

```toml
database_id = "a1b2c3d4-5678-90ab-cdef-1234567890ab"
```

> The database ID is **not** a secret — it's fine to commit it.

### 2.4 Create the tables

```bash
npm run db:apply:remote
```

This runs `schema.sql` against the live D1 database and creates three tables: `licenses`, `activations`, `processed_events`.

**Checkpoint —** confirm the tables exist:

```bash
npx wrangler d1 execute ai-coding-alerts --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

You should see `licenses`, `activations`, and `processed_events` listed.

---

## 3. Generate and install the signing keys

### 3.1 Generate the keypair

From `server/`:

```bash
node scripts/gen-keys.mjs
```

Output:

```
PRIVATE (LICENSE_SIGNING_PRIVATE_KEY, base64 pkcs8):
MC4CAQAwBQYDK2VwBCIEIH...

PUBLIC (extension LICENSE_PUBLIC_KEY_B64, base64 raw):
d3JvbmdrZXlleGFtcGxl...
```

**Keep this terminal open** — you need both values in the next steps. Store them somewhere safe (a password manager). If you lose the private key you must generate a new pair *and* republish the extension with the new public key.

### 3.2 Install the private key as a Worker secret

```bash
npx wrangler secret put LICENSE_SIGNING_PRIVATE_KEY
```

It prompts:

```
✔ Enter a secret value: ›
```

Paste the **PRIVATE** value (the long string under `PRIVATE (...)`) and press Enter.

> Nothing is echoed as you paste — that's normal.

### 3.3 Save the public key for later

You'll paste the **PUBLIC** value into the extension in **Step 6**. Keep it handy.

---

## 4. Set up Paddle (Sandbox first)

> **Always start in Sandbox.** You can take fake payments with test cards and nothing touches real money.

### 4.1 Switch to Sandbox

Log in at https://sandbox-vendors.paddle.com (the sandbox dashboard is a *separate* URL from the live one).

### 4.2 Create the product and prices

1. Go to **Catalog → Products → + New Product**.
2. Name: `AI Coding Alerts Pro`. Save.
3. Inside the product, **+ New Price**:
   - **Monthly:** amount `3.89`, currency USD, billing period **Monthly**, type **Recurring**.
   - **Yearly:** amount `36.00`, currency USD, billing period **Yearly**, type **Recurring**.
4. Note both **Price IDs** (`pri_...`) — you need them on your pricing page/checkout link.

### 4.3 Create the webhook destination

You need your Worker URL first, so this is a two-pass process. Do a **first deploy** now:

```bash
cd server
npm run deploy
```

Output ends with something like:

```
Uploaded ai-coding-alerts (1.23 sec)
Published ai-coding-alerts (0.45 sec)
  https://ai-coding-alerts.<your-subdomain>.workers.dev
```

**Copy that URL** — call it `<WORKER_URL>` from here on.

Now in the Paddle sandbox dashboard:

1. **Developer Tools → Notifications → + New Destination**.
2. **Description:** `AI Coding Alerts licensing`
3. **URL:** `<WORKER_URL>/webhooks/paddle`
   e.g. `https://ai-coding-alerts.jane.workers.dev/webhooks/paddle`
4. **Events** — subscribe to exactly these:
   - `subscription.created`
   - `subscription.activated`
   - `subscription.updated`
   - `subscription.canceled`
   - `subscription.past_due`
   - `transaction.completed`
5. Save. Paddle shows a **secret key** starting with `pdl_ntfset_...`. **Copy it.**

### 4.4 Install the webhook secret

Back in your terminal, from `server/`:

```bash
npx wrangler secret put PADDLE_WEBHOOK_SECRET
```

Paste the `pdl_ntfset_...` value.

### 4.5 Set the checkout success URL

In Paddle: **Checkout → Checkout Settings → Default success URL**, set it to:

```
<WORKER_URL>/license
```

> ⚠️ **Read Step 4.6 before testing** — there's a parameter-name detail that will otherwise show a "Missing transaction" page.

### 4.6 ⚠️ IMPORTANT — the `txn` parameter

The success page looks up the buyer's key using a query parameter named **`txn`**:

```
<WORKER_URL>/license?txn=txn_abc123
```

Paddle, when it redirects after checkout, appends its own parameter — commonly **`_ptxn`**. **Verify what your Paddle account actually sends** (complete one sandbox checkout in Step 7 and look at the URL in your browser's address bar).

If Paddle sends `_ptxn` (or any other name), make the success page accept both. Edit `server/src/handlers/successPage.ts`, line 19:

```ts
// before
const txn = url.searchParams.get("txn");

// after — accepts either name
const txn = url.searchParams.get("txn") ?? url.searchParams.get("_ptxn");
```

Then redeploy (`npm run deploy`). This is the single most likely thing to trip you up.

---

## 5. Deploy the Worker

```bash
cd server
npm run deploy
```

**Checkpoint —** verify the live Worker responds correctly. Run these three (replace `<WORKER_URL>`):

```bash
curl -i <WORKER_URL>/nope
```
Expected: `HTTP/2 404` and body `Not found`.

```bash
curl -i -X POST <WORKER_URL>/webhooks/paddle -d '{}'
```
Expected: `HTTP/2 401` — the webhook correctly rejects an unsigned request.

```bash
curl -i -X POST <WORKER_URL>/license/activate -H "Content-Type: application/json" -d '{}'
```
Expected: `HTTP/2 400` with `{"ok":false,"error":"bad_request"}` — routing and the signing key both work.

If all three match, your backend is live and correctly wired.

---

## 6. Point the extension at your backend

Open `src/license/constants.ts` in the repository root (**not** in `server/`):

```ts
export const LICENSE_BASE_URL = "https://aicodingalert.com";
export const LICENSE_PUBLIC_KEY_B64 = "REPLACE_WITH_ED25519_PUBLIC_KEY_BASE64";
export const PADDLE_CHECKOUT_URL = "https://aicodingalert.com/#pricing";
```

Change all three:

```ts
// 1. Your Worker URL from Step 4.3 — NO trailing slash
export const LICENSE_BASE_URL = "https://ai-coding-alerts.jane.workers.dev";

// 2. The PUBLIC value printed by gen-keys.mjs in Step 3.1
export const LICENSE_PUBLIC_KEY_B64 = "d3JvbmdrZXlleGFtcGxl...";

// 3. Where "Upgrade" sends users — your Paddle checkout/pricing link
export const PADDLE_CHECKOUT_URL = "https://your-pricing-page.example.com";
```

Rebuild and verify:

```bash
npm run build
npm test
```

Expected: build succeeds, `pass 112`, `fail 0`.

> **Sequencing matters.** `LICENSE_BASE_URL` and the public key are compiled into the published extension. Decide your final backend URL **before** you publish to the Marketplace — changing it later requires publishing a new version. If you plan to use a custom domain (Step 9), set it up *first* and put the custom domain here.

---

## 7. End-to-end test in Sandbox

1. **Start a checkout.** Open your sandbox checkout link/pricing page and buy the monthly plan.
2. **Pay with a test card:**
   - Card: `4242 4242 4242 4242`
   - Expiry: any future date (e.g. `12/30`)
   - CVC: any 3 digits (e.g. `123`)
   - (Confirm the current test cards at https://developer.paddle.com/ — they occasionally change.)
3. **Land on the success page.** You should see **"You're Pro! 🎉"** and a license key like `ACA-A1B2C-3D4E5-F6G7H-8J9K0`.
   - If you instead see *"Your license is being generated…"* — the webhook hasn't arrived yet. The page auto-refreshes every 4 seconds; give it ~10 seconds.
   - If you see *"Missing transaction"* — this is the `txn` vs `_ptxn` issue. Go back to **Step 4.6**.
4. **Confirm the database row:**

```bash
cd server
npx wrangler d1 execute ai-coding-alerts --remote --command "SELECT license_key, status, plan, device_limit FROM licenses"
```

Expected: one row, `status = active`, `plan = monthly`, `device_limit = 3`.

5. **Activate in the extension.** Launch the Extension Development Host (open the repo in VS Code, press **F5**), then:
   - Run **`AI Coding Alerts: Enter Pro License`** from the Command Palette (`Ctrl+Shift+P`).
   - Paste the key. Expect: *"AI Coding Alerts Pro is now active on this device. Thank you!"*
   - Run **`AI Coding Alerts: Manage License`** → should report **Active**.
6. **Confirm the activation was recorded:**

```bash
npx wrangler d1 execute ai-coding-alerts --remote --command "SELECT * FROM activations"
```

Expected: one row with your device ID.

7. **Test cancellation.** In the Paddle sandbox dashboard, cancel the subscription. Then in VS Code run **Manage License → Re-check now**. The status should flip to **Inactive**.

8. **Verify free features are unaffected** — with no license at all, confirm alerts, history, dashboard, and mute still work exactly as before. Nothing in the free tier is gated.

---

## 8. Going live

Once the sandbox flow works end to end:

1. **Recreate the product and prices** in the **live** Paddle dashboard (https://vendors.paddle.com). Sandbox and live are entirely separate — nothing carries over.
2. **Create a live webhook destination** pointing at the same `<WORKER_URL>/webhooks/paddle`, with the same six events.
3. **Replace the webhook secret** with the live one:

```bash
cd server
npx wrangler secret put PADDLE_WEBHOOK_SECRET
```

4. **Set the live success URL** (Step 4.5).
5. **Publish the extension** with the final `constants.ts` values:

```bash
npx vsce publish
```

> You can keep the **same** Worker and D1 database for live — only the Paddle secret and dashboard change. If you prefer full isolation, deploy a second Worker (e.g. `name = "ai-coding-alerts-sandbox"` in a copy of `wrangler.toml`) and keep sandbox traffic separate.

---

## 9. Optional — use a custom domain

Instead of `*.workers.dev`:

1. Add your domain to Cloudflare (**Add a site**), and update your registrar's nameservers to the two Cloudflare gives you. Wait for it to go **Active**.
2. In the dashboard: **Workers & Pages → ai-coding-alerts → Settings → Domains & Routes → Add → Custom Domain**, e.g. `api.yourdomain.com`.
3. Update `LICENSE_BASE_URL` in `src/license/constants.ts` to `https://api.yourdomain.com`, rebuild, and republish the extension.
4. Update the Paddle webhook URL and success URL to the new domain.

**Do this before publishing the extension** if you can — it saves a version bump.

---

## 10. Optional — turn on emailing license keys

Email is deliberately **off** by default: the success page delivers the key, and the code ships with a no-op deliverer so it works with no domain. To enable it later:

1. Register and verify a sending domain in Cloudflare (**Email → Email Sending**). Cloudflare handles SPF/DKIM automatically.
2. Add a `send_email` binding to `server/wrangler.toml`.
3. In `server/src/index.ts`, swap the deliverer:

```ts
// from
deliver: noopDeliverer,
// to
deliver: CloudflareEmailDeliverer(yourSendFn, "licenses@yourdomain.com"),
```

`CloudflareEmailDeliverer` is already written and unit-tested — only the wiring is left. First 3,000 emails/month are free on the Workers Paid plan.

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Success page says **"Missing transaction"** | Paddle sends `_ptxn`, page reads `txn` | Step 4.6 |
| Success page stuck on **"being generated…"** | Webhook didn't arrive or failed | Check `npx wrangler tail`; verify the webhook URL and that the six events are subscribed |
| Webhook returns **401** in Paddle's log | `PADDLE_WEBHOOK_SECRET` wrong or from the other environment (sandbox vs live) | Re-copy the secret from the destination you're actually using and re-run `wrangler secret put` |
| Extension: **"License key not found"** | Typo, or key came from a different environment's database | Verify with the D1 `SELECT` in Step 7.4 |
| Extension: **"Device limit reached"** | Already activated on 3 devices | Manage License → Deactivate this device, on a machine you no longer use |
| Extension never becomes Pro despite a valid key | `LICENSE_PUBLIC_KEY_B64` doesn't match the deployed private key | Re-run `gen-keys.mjs`, set the new private key as a secret, paste the new public key, rebuild |
| `deploy` fails: **"Couldn't find a D1 DB"** | `database_id` still the placeholder | Step 2.3 |
| Everything 500s after deploy | `LICENSE_SIGNING_PRIVATE_KEY` not set or malformed | `npx wrangler secret list` to confirm it exists; re-run `wrangler secret put` |

### Live logs

The single most useful debugging tool — stream your Worker's logs in real time:

```bash
cd server
npx wrangler tail
```

Leave it running while you do a checkout.

### Re-drive a webhook

Paddle's dashboard (**Notifications → your destination → Logs**) lets you inspect each delivery and **replay** it. Replays are safe: the Worker de-duplicates by `event_id`, so a replayed event is acknowledged without being processed twice.

---

## 12. Routine operations

**Redeploy after a code change:**
```bash
cd server && npm run deploy
```

**Inspect data:**
```bash
npx wrangler d1 execute ai-coding-alerts --remote --command "SELECT * FROM licenses ORDER BY created_at DESC LIMIT 10"
```

**List configured secrets** (names only — values are never retrievable):
```bash
npx wrangler secret list
```

**Manually issue a license** (e.g. a refund goodwill case or a reviewer copy):
```bash
npx wrangler d1 execute ai-coding-alerts --remote --command "INSERT INTO licenses (license_key, status, plan, device_limit, created_at, updated_at) VALUES ('ACA-MANUAL-KEY01-ABCDE-FGHIJ', 'active', 'yearly', 3, 0, 0)"
```

**Revoke a license:**
```bash
npx wrangler d1 execute ai-coding-alerts --remote --command "UPDATE licenses SET status='canceled' WHERE license_key='ACA-...'"
```
The user drops to non-Pro at their next re-check (within ~3 days, or immediately via **Manage License → Re-check now**).

**Rotate the signing key** (only if the private key leaks — it invalidates every cached token and requires an extension release):
1. `node scripts/gen-keys.mjs`
2. `npx wrangler secret put LICENSE_SIGNING_PRIVATE_KEY` (new private)
3. Paste the new public key into `src/license/constants.ts`
4. `npm run build` and publish a new extension version

---

## 13. Pre-launch checklist

- [ ] `database_id` set in `wrangler.toml`; schema applied to remote D1
- [ ] `LICENSE_SIGNING_PRIVATE_KEY` and `PADDLE_WEBHOOK_SECRET` set via `wrangler secret put`
- [ ] Worker deployed; the three `curl` checks in Step 5 return 404 / 401 / 400
- [ ] Paddle webhook destination created with all **six** events
- [ ] Success URL set, and the `txn` / `_ptxn` parameter confirmed (Step 4.6)
- [ ] `constants.ts` has the real base URL, public key, and checkout URL
- [ ] Full sandbox run completed: checkout → key shown → activated → cancel flips to inactive
- [ ] Free features verified unchanged with no license present
- [ ] Private key backed up in a password manager
- [ ] No secret values committed to git (`git log -p | grep -i "pdl_ntfset"` returns nothing)
