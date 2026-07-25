# License Key Workflows

How a customer gets, keeps, moves, and recovers their AI Coding Alerts Pro license — and what you (the seller) do when they get stuck.

This reflects **what the code actually does today** (v1). Where a scenario is **not** yet self-service, it says so plainly and shows the manual fix, plus what to build to close the gap.

---

## The model in one paragraph

There are **no user accounts and no login**. A purchase produces a **license key** (`ACA-XXXXX-XXXXX-XXXXX-XXXXX`) — a bearer secret, like a password. Whoever holds the key can activate Pro, on up to **3 devices**. The key lives in **your D1 database**, not in Paddle. Paddle knows the *customer and subscription*; it does **not** know the license key. This matters for recovery: a customer who loses the key can't get it back from Paddle — only from you.

```
Purchase (Paddle) ──webhook──▶ Worker mints key ──▶ stored in D1
                                       │
                                       ▼
                          Buyer sees key on success page
                                       │
                        paste into VS Code: "Enter Pro License"
                                       │
                                       ▼
                    activate  ─▶ device slot used (max 3)
```

---

## Scenario A — First purchase: getting the key ✅ works today

1. Customer clicks **Upgrade** (Paddle checkout) and pays.
2. Paddle calls your webhook → the Worker **generates a license key**, stores an `active` license row in D1.
3. Paddle redirects the buyer to your **success page** (`/license?txn=...`), which shows:
   > **You're Pro! 🎉** — `ACA-A1B2C-3D4E5-F6G7H-8J9K0`
4. Customer copies the key.

**Their delivery channel in v1 is the success page.** Tell them, on that page and in your docs, to **save the key** (it's shown once at checkout).

> **Backup copies they already have:** Paddle emails every buyer a **payment receipt**. That receipt does *not* contain your license key (Paddle never sees it), but it proves they're a customer and carries their email — which is what your support recovery (Scenario E) keys off.

---

## Scenario B — Activating on the first device ✅ works today

1. In VS Code: Command Palette → **`AI Coding Alerts: Enter Pro License`**.
2. Paste the key. The extension calls `POST /license/activate` with the key + a **device ID** (a random id generated once per machine, stored locally).
3. Server records the activation, returns a **signed token** (valid 7 days, honored offline up to 14). Extension shows: *"AI Coding Alerts Pro is now active on this device."*

From then on, `isPro()` is checked **offline** against the cached token; it re-checks with the server about every 3 days.

---

## Scenario C — Adding another device (2nd, 3rd) ✅ works today

Same key, new machine:

1. On the new machine: **`Enter Pro License`** → paste the **same key**.
2. It activates — as long as fewer than **3** devices are currently active.

**What "the difference" is between devices:** the *key* is identical everywhere; the *device ID* is unique per machine. The server counts distinct device IDs against the limit of 3. Re-activating the **same** device is free (idempotent — it doesn't consume a new slot).

**If they're already at 3 devices**, activation fails with:
> Activation failed: Device limit reached. Deactivate another device first.

To free a slot, see Scenario D.

---

## Scenario D — Moving to a new device / freeing a slot

### D1. You still have access to the old device ✅ works today

On the device you're retiring:
1. **`AI Coding Alerts: Manage License`** → **Deactivate this device**.
2. That calls `POST /license/deactivate`, removing the activation and freeing a slot.
3. Now activate on the new machine (Scenario C).

### D2. The old device is gone (wiped, lost, dead laptop) ⚠️ needs you (v1 gap)

There is **no self-service "deactivate a device I can't reach"** and **no "deactivate all"** in v1. If all 3 slots are taken by machines they no longer control, the customer is stuck and must contact you.

**Your manual fix** — free their slots by deleting activations in D1 (see the Support Runbook below):

```bash
cd server
# see their devices
npx wrangler d1 execute ai-coding-alerts --remote \
  --command "SELECT device_id, last_seen_at FROM activations WHERE license_key='ACA-...'"
# free ALL slots (they re-activate the ones they still use)
npx wrangler d1 execute ai-coding-alerts --remote \
  --command "DELETE FROM activations WHERE license_key='ACA-...'"
```

> **Recommended build to make this self-service:** add a **"Deactivate all other devices"** action to the Manage License command (a `POST /license/deactivate-all` that clears every activation except the caller's). See "Closing the gaps."

---

## Scenario E — Lost or forgot the key ⚠️ needs you (v1 gap)

This is the big one, and it's the direct trade-off of the **no-account** design.

**What the customer can try themselves first:**
- **Browser history / bookmark** — the success page URL (`/license?txn=...`) still shows their key if they kept the link. Worth suggesting.
- **Paddle receipt** — confirms they're a customer and gives their email, but does **not** contain the key.

**What does NOT work in v1:**
- ❌ No email-the-key-again button (email delivery is built but wired to a no-op until you have a sending domain — see `docs/DEPLOYMENT.md` §10).
- ❌ No "enter your email to recover your key" endpoint.
- ❌ Paddle can't show it — the key isn't in Paddle.

**So today, lost-key recovery = they contact you, and you look it up.** Verify they own the email (they'll be writing from it / can quote the Paddle receipt), then:

```bash
cd server
npx wrangler d1 execute ai-coding-alerts --remote \
  --command "SELECT license_key, status, plan FROM licenses WHERE email='buyer@example.com'"
```

Send them the key. Done.

> ⚠️ **Security note:** the key is a bearer secret. Only ever return it to the **verified email on file** — never to whoever types an email. That's exactly why the recommended self-service recovery (below) *emails* the key rather than displaying it.

> **Note on `email`:** the webhook only stores an email if Paddle's payload includes one. Paddle's `subscription.created` often carries `customer_id` rather than an inline email, so `licenses.email` may be `NULL`. If your lookups come back empty, resolve it via the customer id instead:
> ```bash
> npx wrangler d1 execute ai-coding-alerts --remote \
>   --command "SELECT license_key, status FROM licenses WHERE paddle_customer_id='ctm_...'"
> ```
> (Get the `ctm_...` from the customer in the Paddle dashboard by their email.) **Closing this — storing the email reliably — is a prerequisite for automated recovery.**

---

## Scenario F — Subscription changes (renew / cancel / payment fails)

These are automatic; the customer does nothing, and the extension reflects them at the next re-check.

| Event in Paddle | Webhook effect | What the customer sees |
|---|---|---|
| Renewal succeeds | stays `active` | Nothing — Pro continues |
| Payment fails | status → `past_due` | Pro turns **off** at next re-check (they're not `active`) |
| They cancel | status → `canceled` | Pro stays on through the **14-day offline grace** from the last token, then turns off; **Re-check now** turns it off immediately |
| They re-subscribe | new `subscription.created` → new key | They get a **new** key (a new subscription = a new license) |

**"Re-check now"** (Manage License) forces an immediate server check instead of waiting ~3 days — useful to confirm a cancellation or a fixed payment right away.

---

## The differences at a glance

| Situation | Self-service today? | What they do | Key changes? |
|---|---|---|---|
| First purchase | ✅ | Copy key from success page | New key issued |
| Activate a device | ✅ | Enter Pro License | No |
| Add 2nd/3rd device | ✅ | Enter Pro License (same key) | No |
| Swap device (old one in hand) | ✅ | Deactivate this device → activate new | No |
| Swap device (old one gone) | ❌ needs you | Contact support to free slots | No |
| Lost/forgot key | ❌ needs you | Contact support to look it up | No |
| Payment fails / cancels | ✅ automatic | Nothing; Pro lapses after grace | No |
| Re-subscribe after cancel | ✅ | Enter the **new** key | **New key** |

The two ❌ rows are the entire cost of the no-account design — and both are small features away from being self-service.

---

## Support Runbook (you, via Wrangler)

Run from `server/`. These are your everyday support tools.

**Find a customer's key** (by email, or by Paddle customer id):
```bash
npx wrangler d1 execute ai-coding-alerts --remote \
  --command "SELECT license_key, status, plan, email FROM licenses WHERE email='buyer@example.com'"
```

**See their active devices:**
```bash
npx wrangler d1 execute ai-coding-alerts --remote \
  --command "SELECT device_id, activated_at, last_seen_at FROM activations WHERE license_key='ACA-...'"
```

**Free device slots** (they re-activate what they still use):
```bash
npx wrangler d1 execute ai-coding-alerts --remote \
  --command "DELETE FROM activations WHERE license_key='ACA-...'"
```

**Grant a comp / reviewer license** (no Paddle purchase):
```bash
npx wrangler d1 execute ai-coding-alerts --remote \
  --command "INSERT INTO licenses (license_key, status, plan, device_limit, created_at, updated_at) VALUES ('ACA-COMP1-XXXXX-XXXXX-XXXXX', 'active', 'yearly', 3, 0, 0)"
```

**Revoke a license** (abuse/refund):
```bash
npx wrangler d1 execute ai-coding-alerts --remote \
  --command "UPDATE licenses SET status='canceled' WHERE license_key='ACA-...'"
```
They drop to non-Pro at their next re-check (or immediately via Re-check now).

**Raise a customer's device limit** (e.g. a team of 5):
```bash
npx wrangler d1 execute ai-coding-alerts --remote \
  --command "UPDATE licenses SET device_limit=5 WHERE license_key='ACA-...'"
```

---

## Closing the gaps (recommended, not yet built)

Two small additions turn the ❌ rows into ✅ and cut your support load to near zero. Both are backend-only.

### 1. Self-service key recovery — `POST /license/recover`
- Input: `{ email }`.
- The Worker looks up the license by email and **emails the key to that address** (never returns it in the HTTP response — proving inbox control is the identity check).
- **Prerequisites:** (a) enable Cloudflare Email (DEPLOYMENT.md §10), and (b) reliably store the buyer's email — resolve it from Paddle's `customer_id` in the webhook if the payload lacks it.
- Add a small "Lost your key?" page/form that posts to it.

### 2. Self-service slot reset — `POST /license/deactivate-all`
- Input: `{ licenseKey, deviceId }` — clears every activation **except** the caller's, then activates the caller.
- Wire a **"Deactivate all other devices"** entry into the extension's **Manage License** menu.
- Solves the dead-laptop lockout without a support ticket.

Both are a few hours each, test-first, and fit the existing handler + repository pattern. Enabling email (§10) is the shared prerequisite for #1.
