# Licensing Backend + Extension Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the licensing system that gates every paid feature of the AI Coding Alerts VS Code extension — a Cloudflare Worker (Paddle webhook → license keys → offline-verifiable signed tokens) and the extension's `src/license/` consumer module.

**Architecture:** A Cloudflare Worker turns a Paddle subscription into a license key (D1-persisted), and issues short-lived Ed25519-signed JWTs the extension verifies **offline** with a baked-in public key. The extension activates a key once online, caches the token in `SecretStorage`, exposes a synchronous `isPro()`, and re-checks periodically with a 14-day offline grace window. Both sides follow the repo's existing dependency-injection style (pure modules + injected impure edges) so everything is unit-testable without a network or a VS Code host.

**Tech Stack:** Cloudflare Workers + D1, Wrangler, `@cloudflare/vitest-pool-workers` (Miniflare) for backend tests; TypeScript; Web Crypto (`crypto.subtle`, Ed25519 + HMAC) on both sides; Paddle Billing (sandbox first); VS Code `SecretStorage` + `globalState`; `node --import tsx --test` (`node:test` + `node:assert/strict`) for extension tests.

## Global Constraints

- **Existing free features must not change or become gated.** No edits to the alert pipeline (`alert/`, `detection/`, `ingress/`, `reactors/`, `health/`, `history/`, `stats/`, `views/`, `setup/`) beyond adding two new command registrations in `src/extension.ts`. (§5, §8)
- **Never commit secret values.** `PADDLE_WEBHOOK_SECRET` and `LICENSE_SIGNING_PRIVATE_KEY` are Worker secrets (`.dev.vars` is gitignored). License keys and tokens are bearer secrets — never log their values. (§4.6)
- **Backend = `server/` package** (`ai-coding-alerts-server`), deployed independently of the extension. Tests: `npm test` = `vitest run`. Type ES modules, `moduleResolution: Bundler`, `types: ["@cloudflare/workers-types"]`. (server/package.json, server/tsconfig.json)
- **Extension pure modules must not `import "vscode"`.** Impure edges (network `fetch`, `SecretStorage`) are injected via narrow interfaces, mirroring `TelegramNotifier(settings, send, muted)`. Tests use fakes + an injected clock. (§7)
- **Token contract (the seam between the two packages):** Ed25519 (`alg: "EdDSA"`) JWT, payload `{ sub: sha256hex(licenseKey), deviceId, status, plan, iat, exp }`, all times in **seconds**, `exp = iat + 7 days`. (§4.4)
- **Timing values (verbatim):** token TTL **7 days**; offline grace **14 days** (measured from the token's `iat` = last successful server contact); re-check cadence **~3 days**; device limit **3** (flat, resolved via one `resolvePlanDeviceLimit` function). (§10)
- **Placeholders, changeable at deploy:** backend base URL `https://aicodingalert.com`; email `From` `licenses@aicodingalert.com`. (§10)
- **Paddle payload field paths** (event types, `data.items[].price.billing_cycle.interval`, signature header format) must be **verified against live Paddle Billing docs** during implementation (use context7 / web search). The code below targets the documented Paddle Billing shape; adjust field paths if the live docs differ. (§4.5, §11)

---

## File Structure

**Backend (`server/`):**
- `server/vitest.config.ts` — *create* — Miniflare pool config (D1 binding, `PADDLE_WEBHOOK_SECRET` test binding).
- `server/test/helpers.ts` — *create* — D1 schema apply + Ed25519 test-keypair helpers.
- `server/schema.sql` — *modify* — add `paddle_transaction_id` column (for the success-page lookup).
- `server/src/lib/encoding.ts` — *create* — base64url + hex + `sha256Hex` (pure).
- `server/src/lib/jwt.ts` — *create* — `importSigningKey`, `signLicenseToken` (Ed25519 JWT).
- `server/src/paddle/signature.ts` — *create* — `verifyPaddleSignature` (HMAC-SHA256).
- `server/src/paddle/event.ts` — *create* — `parsePaddleEvent` + `resolvePlanDeviceLimit`.
- `server/src/license/keygen.ts` — *create* — `generateLicenseKey`.
- `server/src/license/deliver.ts` — *create* — `KeyDeliverer` seam: `noopDeliverer`, `CloudflareEmailDeliverer`.
- `server/src/license/repository.ts` — *create* — all D1 access functions.
- `server/src/handlers/webhook.ts` — *create* — `handlePaddleWebhook`.
- `server/src/handlers/activate.ts` — *create* — `handleActivate`.
- `server/src/handlers/validate.ts` — *create* — `handleValidate`.
- `server/src/handlers/deactivate.ts` — *create* — `handleDeactivate`.
- `server/src/handlers/successPage.ts` — *create* — `handleSuccessPage` (HTML).
- `server/src/index.ts` — *modify* — build `Deps` from `Env`, dispatch to handlers.
- `server/scripts/gen-keys.mjs` — *create* — one-off Ed25519 keypair generator (prints base64 PKCS8 + raw public).

**Extension (`src/license/`):**
- `src/license/encoding.ts` — *create* — base64url decode + `sha256Hex` (pure, `node:crypto`).
- `src/license/deviceId.ts` — *create* — `getOrCreateDeviceId` (injected key-value store).
- `src/license/token.ts` — *create* — `importPublicKey`, `decodeToken`, `verifyToken` (pure).
- `src/license/state.ts` — *create* — `evaluateLicense` state machine (pure).
- `src/license/api.ts` — *create* — `activate`/`validate`/`deactivate` (injected `fetch`).
- `src/license/constants.ts` — *create* — base URL, public key, checkout URL, timing constants.
- `src/license/LicenseService.ts` — *create* — orchestration over `SecretStore` + api + clock.
- `src/license/requirePro.ts` — *create* — `requirePro(service, feature, showUpsell)`.
- `src/extension.ts` — *modify* — register `enterLicense` + `manageLicense` commands; startup revalidate.
- `package.json` — *modify* — add the two commands to `contributes.commands`.

**Test files** mirror the above under `server/test/**` and `test/license/**`.

---

# Phase A — Backend (`server/`)

### Task 1: Test harness + schema

**Files:**
- Modify: `server/schema.sql`
- Create: `server/vitest.config.ts`
- Create: `server/test/helpers.ts`
- Create: `server/test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `applySchema(db: D1Database): Promise<void>`, `makeTestKeypair(): Promise<{ privateKey: CryptoKey; publicKeyB64: string; privatePkcs8B64: string }>` from `test/helpers.ts`.

- [ ] **Step 1: Add the transaction-id column to the schema**

The success page (`GET /license?txn=`) maps a Paddle checkout transaction id to its license key, so persist it. Edit `server/schema.sql` — add the column after `email` and an index:

```sql
CREATE TABLE IF NOT EXISTS licenses (
  license_key            TEXT PRIMARY KEY,
  paddle_subscription_id TEXT UNIQUE,
  paddle_customer_id     TEXT,
  paddle_transaction_id  TEXT,
  email                  TEXT,
  status                 TEXT NOT NULL,          -- active | past_due | canceled
  plan                   TEXT,                   -- monthly | yearly
  device_limit           INTEGER NOT NULL DEFAULT 3,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_licenses_txn ON licenses(paddle_transaction_id);

CREATE TABLE IF NOT EXISTS activations (
  license_key  TEXT NOT NULL REFERENCES licenses(license_key),
  device_id    TEXT NOT NULL,
  activated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (license_key, device_id)
);
```

- [ ] **Step 2: Write the Vitest Workers-pool config**

Create `server/vitest.config.ts`:

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        miniflare: {
          compatibilityDate: "2025-01-01",
          d1Databases: ["DB"],
          bindings: { PADDLE_WEBHOOK_SECRET: "whsec_test" }
        }
      }
    }
  }
});
```

- [ ] **Step 3: Write the test helpers**

Create `server/test/helpers.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const schemaPath = fileURLToPath(new URL("../schema.sql", import.meta.url));

/** Apply schema.sql to a fresh Miniflare D1 instance (per test file). */
export async function applySchema(db: D1Database): Promise<void> {
  const sql = readFileSync(schemaPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

/** A throwaway Ed25519 keypair for signing/verifying tokens in tests. */
export async function makeTestKeypair(): Promise<{
  privateKey: CryptoKey;
  publicKeyB64: string;
  privatePkcs8B64: string;
}> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify"
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return {
    privateKey: pair.privateKey,
    publicKeyB64: btoa(String.fromCharCode(...raw)),
    privatePkcs8B64: btoa(String.fromCharCode(...pkcs8))
  };
}
```

- [ ] **Step 4: Write the smoke test**

Create `server/test/smoke.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { applySchema } from "./helpers";

describe("test harness", () => {
  beforeAll(async () => {
    await applySchema(env.DB as D1Database);
  });

  it("has a working D1 binding with the licenses table", async () => {
    const row = await (env.DB as D1Database)
      .prepare("SELECT count(*) AS n FROM licenses")
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("can generate an Ed25519 keypair in the worker runtime", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify"
    ])) as CryptoKeyPair;
    expect(pair.privateKey.type).toBe("private");
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm install && npm test`
Expected: PASS (2 tests). If `cloudflare:test` types error under `typecheck`, add `"@cloudflare/vitest-pool-workers"` is already a dep — no code change needed for the test run.

- [ ] **Step 6: Commit**

```bash
git add server/schema.sql server/vitest.config.ts server/test/helpers.ts server/test/smoke.test.ts
git commit -m "test(server): add Miniflare test harness + txn column"
```

---

### Task 2: Encoding helpers (base64url, hex, sha256)

**Files:**
- Create: `server/src/lib/encoding.ts`
- Test: `server/test/lib/encoding.test.ts`

**Interfaces:**
- Produces: `base64urlEncode(bytes: Uint8Array): string`, `base64urlEncodeString(s: string): string`, `bytesToHex(bytes: Uint8Array): string`, `sha256Hex(input: string): Promise<string>`.

- [ ] **Step 1: Write the failing test**

Create `server/test/lib/encoding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { base64urlEncode, base64urlEncodeString, bytesToHex, sha256Hex } from "../../src/lib/encoding";

describe("encoding", () => {
  it("base64url has no +, /, or = padding", () => {
    const out = base64urlEncode(new Uint8Array([251, 255, 191]));
    expect(out).not.toMatch(/[+/=]/);
  });

  it("base64urlEncodeString round-trips ASCII to url-safe base64", () => {
    expect(base64urlEncodeString("ab")).toBe("YWI");
  });

  it("bytesToHex zero-pads each byte", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 255]))).toBe("000fff");
  });

  it("sha256Hex matches the known digest of 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- encoding`
Expected: FAIL — cannot find module `../../src/lib/encoding`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/encoding.ts`:

```ts
export function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64urlEncodeString(s: string): string {
  return base64urlEncode(new TextEncoder().encode(s));
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- encoding`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/encoding.ts server/test/lib/encoding.test.ts
git commit -m "feat(server): add base64url/hex/sha256 encoding helpers"
```

---

### Task 3: Ed25519 JWT signing

**Files:**
- Create: `server/src/lib/jwt.ts`
- Test: `server/test/lib/jwt.test.ts`

**Interfaces:**
- Consumes: `base64urlEncodeString` from `lib/encoding`.
- Produces:
  - `importSigningKey(pkcs8Base64: string): Promise<CryptoKey>`
  - `TokenPayload = { sub: string; deviceId: string; status: string; plan: string | null; iat: number; exp: number }`
  - `signLicenseToken(payload: TokenPayload, key: CryptoKey): Promise<string>`

- [ ] **Step 1: Write the failing test**

Create `server/test/lib/jwt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { importSigningKey, signLicenseToken, type TokenPayload } from "../../src/lib/jwt";
import { makeTestKeypair } from "../helpers";

const payload: TokenPayload = {
  sub: "hashedkey",
  deviceId: "dev-1",
  status: "active",
  plan: "monthly",
  iat: 1_700_000_000,
  exp: 1_700_604_800
};

describe("signLicenseToken", () => {
  it("produces a 3-part EdDSA JWT that verifies against the public key", async () => {
    const kp = await makeTestKeypair();
    const key = await importSigningKey(kp.privatePkcs8B64);
    const token = await signLicenseToken(payload, key);

    const parts = token.split(".");
    expect(parts).toHaveLength(3);

    const header = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
    expect(header).toEqual({ alg: "EdDSA", typ: "JWT" });

    // Verify with the raw public key.
    const rawPub = Uint8Array.from(atob(kp.publicKeyB64), (c) => c.charCodeAt(0));
    const pubKey = await crypto.subtle.importKey("raw", rawPub, { name: "Ed25519" }, false, ["verify"]);
    const sig = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    expect(await crypto.subtle.verify({ name: "Ed25519" }, pubKey, sig, signingInput)).toBe(true);
  });

  it("embeds the payload claims", async () => {
    const kp = await makeTestKeypair();
    const key = await importSigningKey(kp.privatePkcs8B64);
    const token = await signLicenseToken(payload, key);
    const body = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    expect(body).toEqual(payload);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- jwt`
Expected: FAIL — cannot find module `../../src/lib/jwt`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/jwt.ts`:

```ts
import { base64urlEncode, base64urlEncodeString } from "./encoding";

export interface TokenPayload {
  sub: string;
  deviceId: string;
  status: string;
  plan: string | null;
  iat: number;
  exp: number;
}

const HEADER = base64urlEncodeString(JSON.stringify({ alg: "EdDSA", typ: "JWT" }));

export async function importSigningKey(pkcs8Base64: string): Promise<CryptoKey> {
  const pkcs8 = Uint8Array.from(atob(pkcs8Base64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
}

export async function signLicenseToken(payload: TokenPayload, key: CryptoKey): Promise<string> {
  const body = base64urlEncodeString(JSON.stringify(payload));
  const signingInput = `${HEADER}.${body}`;
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64urlEncode(new Uint8Array(sig))}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- jwt`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/jwt.ts server/test/lib/jwt.test.ts
git commit -m "feat(server): sign Ed25519 license tokens"
```

---

### Task 4: Paddle webhook signature verification

**Files:**
- Create: `server/src/paddle/signature.ts`
- Test: `server/test/paddle/signature.test.ts`

**Interfaces:**
- Produces: `verifyPaddleSignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean>`.

> Paddle Billing sends `Paddle-Signature: ts=<unix>;h1=<hex>` where `h1 = HMAC_SHA256(secret, "<ts>:<rawBody>")`. **Verify this exact scheme against https://developer.paddle.com/webhooks/signature-verification during implementation.**

- [ ] **Step 1: Write the failing test**

Create `server/test/paddle/signature.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { verifyPaddleSignature } from "../../src/paddle/signature";

const secret = "whsec_test";
const body = '{"event_type":"subscription.created"}';

async function sign(ts: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${rawBody}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifyPaddleSignature", () => {
  it("accepts a correctly computed signature", async () => {
    const h1 = await sign("1700000000", body);
    expect(await verifyPaddleSignature(body, `ts=1700000000;h1=${h1}`, secret)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const h1 = await sign("1700000000", body);
    expect(await verifyPaddleSignature(body + "x", `ts=1700000000;h1=${h1}`, secret)).toBe(false);
  });

  it("rejects a malformed header", async () => {
    expect(await verifyPaddleSignature(body, "garbage", secret)).toBe(false);
  });

  it("rejects the wrong secret", async () => {
    const h1 = await sign("1700000000", body);
    expect(await verifyPaddleSignature(body, `ts=1700000000;h1=${h1}`, "wrong")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- signature`
Expected: FAIL — cannot find module `../../src/paddle/signature`.

- [ ] **Step 3: Write the implementation**

Create `server/src/paddle/signature.ts`:

```ts
import { bytesToHex } from "../lib/encoding";

/** Parse "ts=...;h1=..." into its parts. */
function parseHeader(header: string): { ts: string; h1: string } | null {
  const parts: Record<string, string> = {};
  for (const segment of header.split(";")) {
    const [k, v] = segment.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  return parts.ts && parts.h1 ? { ts: parts.ts, h1: parts.h1 } : null;
}

/** Constant-time compare of two equal-length hex strings. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  const parsed = parseHeader(signatureHeader);
  if (!parsed) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parsed.ts}:${rawBody}`));
  return timingSafeEqual(bytesToHex(new Uint8Array(mac)), parsed.h1.toLowerCase());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- signature`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/paddle/signature.ts server/test/paddle/signature.test.ts
git commit -m "feat(server): verify Paddle webhook HMAC signatures"
```

---

### Task 5: Paddle event parsing + device-limit resolver

**Files:**
- Create: `server/src/paddle/event.ts`
- Test: `server/test/paddle/event.test.ts`

**Interfaces:**
- Produces:
  - `PaddleEvent = { kind: "created" | "activated" | "updated" | "canceled" | "past_due" | "transaction" | "ignored"; subscriptionId: string | null; customerId: string | null; transactionId: string | null; email: string | null; plan: "monthly" | "yearly" | null; status: "active" | "past_due" | "canceled" | null }`
  - `parsePaddleEvent(body: unknown): PaddleEvent`
  - `resolvePlanDeviceLimit(plan: "monthly" | "yearly" | null): number`

> **Verify field paths against live Paddle Billing docs.** This targets: `event_type`, `data.id` (subscription id, or transaction id on `transaction.*`), `data.customer_id`, `data.subscription_id` (on transaction events), `data.status`, `data.items[0].price.billing_cycle.interval` (`"month"`/`"year"`).

- [ ] **Step 1: Write the failing test**

Create `server/test/paddle/event.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parsePaddleEvent, resolvePlanDeviceLimit } from "../../src/paddle/event";

const created = {
  event_type: "subscription.created",
  data: {
    id: "sub_123",
    customer_id: "ctm_1",
    status: "active",
    items: [{ price: { billing_cycle: { interval: "month" } } }]
  }
};

describe("parsePaddleEvent", () => {
  it("maps subscription.created to a created event with plan+status", () => {
    const e = parsePaddleEvent(created);
    expect(e.kind).toBe("created");
    expect(e.subscriptionId).toBe("sub_123");
    expect(e.customerId).toBe("ctm_1");
    expect(e.plan).toBe("monthly");
    expect(e.status).toBe("active");
  });

  it("maps a yearly interval to the yearly plan", () => {
    const e = parsePaddleEvent({
      ...created,
      data: { ...created.data, items: [{ price: { billing_cycle: { interval: "year" } } }] }
    });
    expect(e.plan).toBe("yearly");
  });

  it("maps subscription.canceled to canceled status", () => {
    const e = parsePaddleEvent({ event_type: "subscription.canceled", data: { id: "sub_9", status: "canceled" } });
    expect(e.kind).toBe("canceled");
    expect(e.status).toBe("canceled");
  });

  it("maps subscription.past_due", () => {
    const e = parsePaddleEvent({ event_type: "subscription.past_due", data: { id: "sub_9", status: "past_due" } });
    expect(e.kind).toBe("past_due");
    expect(e.status).toBe("past_due");
  });

  it("extracts the transaction id and subscription id from transaction.completed", () => {
    const e = parsePaddleEvent({
      event_type: "transaction.completed",
      data: { id: "txn_77", subscription_id: "sub_123" }
    });
    expect(e.kind).toBe("transaction");
    expect(e.transactionId).toBe("txn_77");
    expect(e.subscriptionId).toBe("sub_123");
  });

  it("returns 'ignored' for unrelated events", () => {
    expect(parsePaddleEvent({ event_type: "report.created", data: {} }).kind).toBe("ignored");
  });

  it("returns 'ignored' for non-object input", () => {
    expect(parsePaddleEvent(null).kind).toBe("ignored");
  });
});

describe("resolvePlanDeviceLimit", () => {
  it("is a flat 3 for every current plan (add-on-ready)", () => {
    expect(resolvePlanDeviceLimit("monthly")).toBe(3);
    expect(resolvePlanDeviceLimit("yearly")).toBe(3);
    expect(resolvePlanDeviceLimit(null)).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- event`
Expected: FAIL — cannot find module `../../src/paddle/event`.

- [ ] **Step 3: Write the implementation**

Create `server/src/paddle/event.ts`:

```ts
export interface PaddleEvent {
  kind: "created" | "activated" | "updated" | "canceled" | "past_due" | "transaction" | "ignored";
  subscriptionId: string | null;
  customerId: string | null;
  transactionId: string | null;
  email: string | null;
  plan: "monthly" | "yearly" | null;
  status: "active" | "past_due" | "canceled" | null;
}

const KIND_BY_EVENT: Record<string, PaddleEvent["kind"]> = {
  "subscription.created": "created",
  "subscription.activated": "activated",
  "subscription.updated": "updated",
  "subscription.canceled": "canceled",
  "subscription.past_due": "past_due",
  "transaction.completed": "transaction"
};

function mapStatus(raw: unknown): PaddleEvent["status"] {
  if (raw === "active" || raw === "past_due" || raw === "canceled") return raw;
  return null;
}

function mapPlan(interval: unknown): PaddleEvent["plan"] {
  if (interval === "month") return "monthly";
  if (interval === "year") return "yearly";
  return null;
}

export function parsePaddleEvent(body: unknown): PaddleEvent {
  const empty: PaddleEvent = {
    kind: "ignored",
    subscriptionId: null,
    customerId: null,
    transactionId: null,
    email: null,
    plan: null,
    status: null
  };
  if (typeof body !== "object" || body === null) return empty;

  const b = body as { event_type?: unknown; data?: Record<string, unknown> };
  const kind = KIND_BY_EVENT[String(b.event_type)] ?? "ignored";
  if (kind === "ignored") return empty;

  const data = (b.data ?? {}) as Record<string, unknown>;

  if (kind === "transaction") {
    return {
      ...empty,
      kind,
      transactionId: (data.id as string) ?? null,
      subscriptionId: (data.subscription_id as string) ?? null
    };
  }

  const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
  const interval = (
    items[0]?.price as { billing_cycle?: { interval?: unknown } } | undefined
  )?.billing_cycle?.interval;

  return {
    kind,
    subscriptionId: (data.id as string) ?? null,
    customerId: (data.customer_id as string) ?? null,
    transactionId: null,
    email: (data.email as string) ?? null,
    plan: mapPlan(interval),
    status: mapStatus(data.status) ?? (kind === "created" || kind === "activated" ? "active" : null)
  };
}

/**
 * The single source of truth for how many devices a plan allows.
 * Flat 3 in v1; tiered/add-on plans become a change here + its test only —
 * no schema or activation change (spec §10, "add-on-ready").
 */
export function resolvePlanDeviceLimit(_plan: "monthly" | "yearly" | null): number {
  return 3;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- event`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/paddle/event.ts server/test/paddle/event.test.ts
git commit -m "feat(server): parse Paddle events + resolve plan device limit"
```

---

### Task 6: License key generation + KeyDeliverer seam

**Files:**
- Create: `server/src/license/keygen.ts`
- Create: `server/src/license/deliver.ts`
- Test: `server/test/license/keygen.test.ts`
- Test: `server/test/license/deliver.test.ts`

**Interfaces:**
- Produces:
  - `generateLicenseKey(): string` — format `ACA-XXXXX-XXXXX-XXXXX-XXXXX` (Crockford base32, 20 chars of entropy).
  - `KeyDeliverer = (email: string, licenseKey: string) => Promise<void>`
  - `noopDeliverer: KeyDeliverer`
  - `EmailSender = (message: { from: string; to: string; subject: string; text: string }) => Promise<void>`
  - `CloudflareEmailDeliverer(send: EmailSender, from: string): KeyDeliverer`

- [ ] **Step 1: Write the failing tests**

Create `server/test/license/keygen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateLicenseKey } from "../../src/license/keygen";

describe("generateLicenseKey", () => {
  it("matches the ACA-XXXXX-XXXXX-XXXXX-XXXXX shape", () => {
    expect(generateLicenseKey()).toMatch(/^ACA(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
  });

  it("is unguessable — 1000 keys are all unique", () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateLicenseKey()));
    expect(keys.size).toBe(1000);
  });
});
```

Create `server/test/license/deliver.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { noopDeliverer, CloudflareEmailDeliverer, type EmailSender } from "../../src/license/deliver";

describe("noopDeliverer", () => {
  it("resolves without doing anything", async () => {
    await expect(noopDeliverer("a@b.com", "ACA-1")).resolves.toBeUndefined();
  });
});

describe("CloudflareEmailDeliverer", () => {
  it("sends an email containing the license key to the buyer", async () => {
    const sent: Array<{ from: string; to: string; subject: string; text: string }> = [];
    const send: EmailSender = async (m) => { sent.push(m); };
    const deliver = CloudflareEmailDeliverer(send, "licenses@aicodingalert.com");

    await deliver("buyer@example.com", "ACA-ABCDE-FGHIJ-KLMNP-QRSTU");

    expect(sent).toHaveLength(1);
    expect(sent[0].from).toBe("licenses@aicodingalert.com");
    expect(sent[0].to).toBe("buyer@example.com");
    expect(sent[0].text).toContain("ACA-ABCDE-FGHIJ-KLMNP-QRSTU");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npm test -- keygen deliver`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Write the implementations**

Create `server/src/license/keygen.ts`:

```ts
// Crockford base32 alphabet (no I, L, O, U — avoids ambiguity).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateLicenseKey(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % 32]);
  const groups = [chars.slice(0, 5), chars.slice(5, 10), chars.slice(10, 15), chars.slice(15, 20)];
  return "ACA-" + groups.map((g) => g.join("")).join("-");
}
```

Create `server/src/license/deliver.ts`:

```ts
/** Injectable email delivery seam — mirrors the extension's TelegramSender pattern. */
export type KeyDeliverer = (email: string, licenseKey: string) => Promise<void>;

/** v1 default: the success page is the delivery channel, so email is a no-op. */
export const noopDeliverer: KeyDeliverer = async () => {};

export type EmailSender = (message: {
  from: string;
  to: string;
  subject: string;
  text: string;
}) => Promise<void>;

/**
 * Built + tested now, wired later. Enable by swapping the default deliverer once a
 * verified sending domain + `send_email` binding exist (spec §4.7). Not wired in v1.
 */
export function CloudflareEmailDeliverer(send: EmailSender, from: string): KeyDeliverer {
  return async (email, licenseKey) => {
    await send({
      from,
      to: email,
      subject: "Your AI Coding Alerts Pro license key",
      text:
        `Thanks for upgrading to AI Coding Alerts Pro!\n\n` +
        `Your license key:\n\n    ${licenseKey}\n\n` +
        `In VS Code, run "AI Coding Alerts: Enter Pro License" and paste this key.`
    });
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npm test -- keygen deliver`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/license/keygen.ts server/src/license/deliver.ts server/test/license/keygen.test.ts server/test/license/deliver.test.ts
git commit -m "feat(server): license key generation + KeyDeliverer seam"
```

---

### Task 7: D1 repository

**Files:**
- Create: `server/src/license/repository.ts`
- Test: `server/test/license/repository.test.ts`

**Interfaces:**
- Consumes: schema tables from Task 1.
- Produces (all take `db: D1Database` first):
  - `LicenseRow` (mirrors the `licenses` columns).
  - `getLicenseByKey(db, key): Promise<LicenseRow | null>`
  - `getLicenseBySubscription(db, subId): Promise<LicenseRow | null>`
  - `getLicenseByTransaction(db, txn): Promise<LicenseRow | null>`
  - `insertLicense(db, row: LicenseRow): Promise<void>`
  - `updateLicenseStatus(db, subId, status, now): Promise<void>`
  - `setLicenseTransaction(db, subId, txn, now): Promise<void>`
  - `countActivations(db, key): Promise<number>`
  - `getActivation(db, key, deviceId): Promise<boolean>`
  - `upsertActivation(db, key, deviceId, now): Promise<void>`
  - `deleteActivation(db, key, deviceId): Promise<void>`
  - `touchLastSeen(db, key, deviceId, now): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `server/test/license/repository.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema } from "../helpers";
import * as repo from "../../src/license/repository";

const db = () => env.DB as D1Database;

function sampleRow(overrides: Partial<repo.LicenseRow> = {}): repo.LicenseRow {
  return {
    license_key: "ACA-KEY1",
    paddle_subscription_id: "sub_1",
    paddle_customer_id: "ctm_1",
    paddle_transaction_id: null,
    email: "a@b.com",
    status: "active",
    plan: "monthly",
    device_limit: 3,
    created_at: 1000,
    updated_at: 1000,
    ...overrides
  };
}

describe("repository", () => {
  beforeEach(async () => {
    await applySchema(db());
    await db().prepare("DELETE FROM activations").run();
    await db().prepare("DELETE FROM licenses").run();
  });

  it("inserts and reads a license by key, subscription, and transaction", async () => {
    await repo.insertLicense(db(), sampleRow({ paddle_transaction_id: "txn_1" }));
    expect((await repo.getLicenseByKey(db(), "ACA-KEY1"))?.email).toBe("a@b.com");
    expect((await repo.getLicenseBySubscription(db(), "sub_1"))?.license_key).toBe("ACA-KEY1");
    expect((await repo.getLicenseByTransaction(db(), "txn_1"))?.license_key).toBe("ACA-KEY1");
    expect(await repo.getLicenseByKey(db(), "nope")).toBeNull();
  });

  it("updates status by subscription id", async () => {
    await repo.insertLicense(db(), sampleRow());
    await repo.updateLicenseStatus(db(), "sub_1", "canceled", 2000);
    const row = await repo.getLicenseByKey(db(), "ACA-KEY1");
    expect(row?.status).toBe("canceled");
    expect(row?.updated_at).toBe(2000);
  });

  it("sets the transaction id by subscription id", async () => {
    await repo.insertLicense(db(), sampleRow());
    await repo.setLicenseTransaction(db(), "sub_1", "txn_9", 3000);
    expect((await repo.getLicenseByTransaction(db(), "txn_9"))?.license_key).toBe("ACA-KEY1");
  });

  it("counts, upserts (idempotent), and deletes activations", async () => {
    await repo.insertLicense(db(), sampleRow());
    expect(await repo.countActivations(db(), "ACA-KEY1")).toBe(0);

    await repo.upsertActivation(db(), "ACA-KEY1", "dev-1", 1000);
    await repo.upsertActivation(db(), "ACA-KEY1", "dev-1", 1500); // same device, no new row
    expect(await repo.countActivations(db(), "ACA-KEY1")).toBe(1);
    expect(await repo.getActivation(db(), "ACA-KEY1", "dev-1")).toBe(true);

    await repo.upsertActivation(db(), "ACA-KEY1", "dev-2", 1000);
    expect(await repo.countActivations(db(), "ACA-KEY1")).toBe(2);

    await repo.deleteActivation(db(), "ACA-KEY1", "dev-1");
    expect(await repo.countActivations(db(), "ACA-KEY1")).toBe(1);
    expect(await repo.getActivation(db(), "ACA-KEY1", "dev-1")).toBe(false);
  });

  it("touchLastSeen updates the timestamp", async () => {
    await repo.insertLicense(db(), sampleRow());
    await repo.upsertActivation(db(), "ACA-KEY1", "dev-1", 1000);
    await repo.touchLastSeen(db(), "ACA-KEY1", "dev-1", 5000);
    const row = await db()
      .prepare("SELECT last_seen_at FROM activations WHERE license_key=? AND device_id=?")
      .bind("ACA-KEY1", "dev-1")
      .first<{ last_seen_at: number }>();
    expect(row?.last_seen_at).toBe(5000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- repository`
Expected: FAIL — cannot find module `../../src/license/repository`.

- [ ] **Step 3: Write the implementation**

Create `server/src/license/repository.ts`:

```ts
export interface LicenseRow {
  license_key: string;
  paddle_subscription_id: string | null;
  paddle_customer_id: string | null;
  paddle_transaction_id: string | null;
  email: string | null;
  status: string;
  plan: string | null;
  device_limit: number;
  created_at: number;
  updated_at: number;
}

export async function getLicenseByKey(db: D1Database, key: string): Promise<LicenseRow | null> {
  return db.prepare("SELECT * FROM licenses WHERE license_key = ?").bind(key).first<LicenseRow>();
}

export async function getLicenseBySubscription(db: D1Database, subId: string): Promise<LicenseRow | null> {
  return db.prepare("SELECT * FROM licenses WHERE paddle_subscription_id = ?").bind(subId).first<LicenseRow>();
}

export async function getLicenseByTransaction(db: D1Database, txn: string): Promise<LicenseRow | null> {
  return db.prepare("SELECT * FROM licenses WHERE paddle_transaction_id = ?").bind(txn).first<LicenseRow>();
}

export async function insertLicense(db: D1Database, row: LicenseRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO licenses
       (license_key, paddle_subscription_id, paddle_customer_id, paddle_transaction_id,
        email, status, plan, device_limit, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.license_key,
      row.paddle_subscription_id,
      row.paddle_customer_id,
      row.paddle_transaction_id,
      row.email,
      row.status,
      row.plan,
      row.device_limit,
      row.created_at,
      row.updated_at
    )
    .run();
}

export async function updateLicenseStatus(
  db: D1Database,
  subId: string,
  status: string,
  now: number
): Promise<void> {
  await db
    .prepare("UPDATE licenses SET status = ?, updated_at = ? WHERE paddle_subscription_id = ?")
    .bind(status, now, subId)
    .run();
}

export async function setLicenseTransaction(
  db: D1Database,
  subId: string,
  txn: string,
  now: number
): Promise<void> {
  await db
    .prepare("UPDATE licenses SET paddle_transaction_id = ?, updated_at = ? WHERE paddle_subscription_id = ?")
    .bind(txn, now, subId)
    .run();
}

export async function countActivations(db: D1Database, key: string): Promise<number> {
  const row = await db
    .prepare("SELECT count(*) AS n FROM activations WHERE license_key = ?")
    .bind(key)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getActivation(db: D1Database, key: string, deviceId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS x FROM activations WHERE license_key = ? AND device_id = ?")
    .bind(key, deviceId)
    .first<{ x: number }>();
  return row !== null;
}

export async function upsertActivation(
  db: D1Database,
  key: string,
  deviceId: string,
  now: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO activations (license_key, device_id, activated_at, last_seen_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (license_key, device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`
    )
    .bind(key, deviceId, now, now)
    .run();
}

export async function deleteActivation(db: D1Database, key: string, deviceId: string): Promise<void> {
  await db
    .prepare("DELETE FROM activations WHERE license_key = ? AND device_id = ?")
    .bind(key, deviceId)
    .run();
}

export async function touchLastSeen(
  db: D1Database,
  key: string,
  deviceId: string,
  now: number
): Promise<void> {
  await db
    .prepare("UPDATE activations SET last_seen_at = ? WHERE license_key = ? AND device_id = ?")
    .bind(now, key, deviceId)
    .run();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- repository`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/license/repository.ts server/test/license/repository.test.ts
git commit -m "feat(server): D1 repository for licenses + activations"
```

---

### Task 8: Webhook handler

**Files:**
- Create: `server/src/handlers/webhook.ts`
- Test: `server/test/handlers/webhook.test.ts`

**Interfaces:**
- Consumes: `verifyPaddleSignature`, `parsePaddleEvent`, `resolvePlanDeviceLimit`, `generateLicenseKey`, `KeyDeliverer`, repository fns.
- Produces:
  - `WebhookDeps = { db: D1Database; webhookSecret: string; deliver: KeyDeliverer; now: () => number; newKey: () => string }`
  - `handlePaddleWebhook(request: Request, deps: WebhookDeps): Promise<Response>`

- [ ] **Step 1: Write the failing test**

Create `server/test/handlers/webhook.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema } from "../helpers";
import { handlePaddleWebhook, type WebhookDeps } from "../../src/handlers/webhook";
import * as repo from "../../src/license/repository";

const db = () => env.DB as D1Database;
const SECRET = "whsec_test";

async function signedRequest(bodyObj: unknown): Promise<Request> {
  const body = JSON.stringify(bodyObj);
  const ts = "1700000000";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${body}`));
  const h1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("https://x/webhooks/paddle", {
    method: "POST",
    headers: { "Paddle-Signature": `ts=${ts};h1=${h1}` },
    body
  });
}

function deps(over: Partial<WebhookDeps> = {}): WebhookDeps {
  const delivered: Array<{ email: string; key: string }> = [];
  const d: WebhookDeps = {
    db: db(),
    webhookSecret: SECRET,
    deliver: async (email, key) => { delivered.push({ email, key }); },
    now: () => 1000,
    newKey: () => "ACA-NEWKEY",
    ...over
  };
  (d as WebhookDeps & { _delivered: typeof delivered })._delivered = delivered;
  return d;
}

describe("handlePaddleWebhook", () => {
  beforeEach(async () => {
    await applySchema(db());
    await db().prepare("DELETE FROM activations").run();
    await db().prepare("DELETE FROM licenses").run();
  });

  it("rejects an invalid signature with 401", async () => {
    const req = new Request("https://x/webhooks/paddle", {
      method: "POST",
      headers: { "Paddle-Signature": "ts=1;h1=bad" },
      body: "{}"
    });
    const res = await handlePaddleWebhook(req, deps());
    expect(res.status).toBe(401);
  });

  it("on subscription.created mints a key, stores an active license, and delivers", async () => {
    const d = deps();
    const req = await signedRequest({
      event_type: "subscription.created",
      data: { id: "sub_1", customer_id: "ctm_1", email: "b@c.com", status: "active", items: [{ price: { billing_cycle: { interval: "month" } } }] }
    });
    const res = await handlePaddleWebhook(req, d);
    expect(res.status).toBe(200);

    const row = await repo.getLicenseByKey(db(), "ACA-NEWKEY");
    expect(row?.status).toBe("active");
    expect(row?.plan).toBe("monthly");
    expect(row?.device_limit).toBe(3);
    expect((d as unknown as { _delivered: Array<{ email: string; key: string }> })._delivered).toEqual([
      { email: "b@c.com", key: "ACA-NEWKEY" }
    ]);
  });

  it("is idempotent — a duplicate subscription.created does not create a second license", async () => {
    const req1 = await signedRequest({ event_type: "subscription.created", data: { id: "sub_1", customer_id: "c", status: "active", items: [{ price: { billing_cycle: { interval: "month" } } }] } });
    await handlePaddleWebhook(req1, deps());
    const req2 = await signedRequest({ event_type: "subscription.created", data: { id: "sub_1", customer_id: "c", status: "active", items: [{ price: { billing_cycle: { interval: "month" } } }] } });
    const res2 = await handlePaddleWebhook(req2, deps({ newKey: () => "ACA-SECOND" }));
    expect(res2.status).toBe(200);
    const count = await db().prepare("SELECT count(*) AS n FROM licenses WHERE paddle_subscription_id='sub_1'").first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("on subscription.canceled flips the stored status", async () => {
    await handlePaddleWebhook(await signedRequest({ event_type: "subscription.created", data: { id: "sub_1", customer_id: "c", status: "active", items: [{ price: { billing_cycle: { interval: "month" } } }] } }), deps());
    const res = await handlePaddleWebhook(await signedRequest({ event_type: "subscription.canceled", data: { id: "sub_1", status: "canceled" } }), deps());
    expect(res.status).toBe(200);
    expect((await repo.getLicenseByKey(db(), "ACA-NEWKEY"))?.status).toBe("canceled");
  });

  it("on transaction.completed links the transaction id for the success page", async () => {
    await handlePaddleWebhook(await signedRequest({ event_type: "subscription.created", data: { id: "sub_1", customer_id: "c", status: "active", items: [{ price: { billing_cycle: { interval: "month" } } }] } }), deps());
    await handlePaddleWebhook(await signedRequest({ event_type: "transaction.completed", data: { id: "txn_1", subscription_id: "sub_1" } }), deps());
    expect((await repo.getLicenseByTransaction(db(), "txn_1"))?.license_key).toBe("ACA-NEWKEY");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- webhook`
Expected: FAIL — cannot find module `../../src/handlers/webhook`.

- [ ] **Step 3: Write the implementation**

Create `server/src/handlers/webhook.ts`:

```ts
import { verifyPaddleSignature } from "../paddle/signature";
import { parsePaddleEvent } from "../paddle/event";
import { resolvePlanDeviceLimit } from "../paddle/event";
import type { KeyDeliverer } from "../license/deliver";
import * as repo from "../license/repository";

export interface WebhookDeps {
  db: D1Database;
  webhookSecret: string;
  deliver: KeyDeliverer;
  now: () => number;
  newKey: () => string;
}

export async function handlePaddleWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  const rawBody = await request.text();
  const header = request.headers.get("Paddle-Signature") ?? "";
  if (!(await verifyPaddleSignature(rawBody, header, deps.webhookSecret))) {
    return Response.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const event = parsePaddleEvent(parsed);
  const now = deps.now();

  switch (event.kind) {
    case "created":
    case "activated": {
      if (!event.subscriptionId) break;
      const existing = await repo.getLicenseBySubscription(deps.db, event.subscriptionId);
      if (existing) {
        // Already provisioned — just ensure status is current (idempotent).
        await repo.updateLicenseStatus(deps.db, event.subscriptionId, event.status ?? "active", now);
        break;
      }
      const key = deps.newKey();
      await repo.insertLicense(deps.db, {
        license_key: key,
        paddle_subscription_id: event.subscriptionId,
        paddle_customer_id: event.customerId,
        paddle_transaction_id: event.transactionId,
        email: event.email,
        status: event.status ?? "active",
        plan: event.plan,
        device_limit: resolvePlanDeviceLimit(event.plan),
        created_at: now,
        updated_at: now
      });
      if (event.email) {
        await deps.deliver(event.email, key);
      }
      break;
    }
    case "updated":
    case "canceled":
    case "past_due": {
      if (event.subscriptionId && event.status) {
        await repo.updateLicenseStatus(deps.db, event.subscriptionId, event.status, now);
      }
      break;
    }
    case "transaction": {
      if (event.subscriptionId && event.transactionId) {
        await repo.setLicenseTransaction(deps.db, event.subscriptionId, event.transactionId, now);
      }
      break;
    }
    case "ignored":
      break;
  }

  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- webhook`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/handlers/webhook.ts server/test/handlers/webhook.test.ts
git commit -m "feat(server): Paddle webhook handler (provision + status + txn link)"
```

---

### Task 9: Activate handler

**Files:**
- Create: `server/src/handlers/activate.ts`
- Test: `server/test/handlers/activate.test.ts`

**Interfaces:**
- Consumes: repository fns, `signLicenseToken`, `sha256Hex`.
- Produces:
  - `LicenseDeps = { db: D1Database; signingKey: CryptoKey; now: () => number }`
  - `handleActivate(request: Request, deps: LicenseDeps): Promise<Response>`
  - Success body: `{ ok: true, token, status, plan, deviceLimit }`. Errors: 400 `bad_request`, 404 `not_found`, 403 `inactive`, 409 `device_limit`.

- [ ] **Step 1: Write the failing test**

Create `server/test/handlers/activate.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema, makeTestKeypair } from "../helpers";
import { handleActivate, type LicenseDeps } from "../../src/handlers/activate";
import * as repo from "../../src/license/repository";

const db = () => env.DB as D1Database;

async function deps(): Promise<LicenseDeps> {
  const kp = await makeTestKeypair();
  const { importSigningKey } = await import("../../src/lib/jwt");
  return { db: db(), signingKey: await importSigningKey(kp.privatePkcs8B64), now: () => 1_700_000 };
}

function req(body: unknown): Request {
  return new Request("https://x/license/activate", { method: "POST", body: JSON.stringify(body) });
}

async function seed(status = "active", device_limit = 3): Promise<void> {
  await repo.insertLicense(db(), {
    license_key: "ACA-K", paddle_subscription_id: "s", paddle_customer_id: "c",
    paddle_transaction_id: null, email: "e@x.com", status, plan: "monthly",
    device_limit, created_at: 1, updated_at: 1
  });
}

describe("handleActivate", () => {
  beforeEach(async () => {
    await applySchema(db());
    await db().prepare("DELETE FROM activations").run();
    await db().prepare("DELETE FROM licenses").run();
  });

  it("400 when licenseKey or deviceId is missing", async () => {
    expect((await handleActivate(req({ licenseKey: "ACA-K" }), await deps())).status).toBe(400);
  });

  it("404 for an unknown key", async () => {
    expect((await handleActivate(req({ licenseKey: "nope", deviceId: "d1" }), await deps())).status).toBe(404);
  });

  it("403 for an inactive subscription", async () => {
    await seed("canceled");
    expect((await handleActivate(req({ licenseKey: "ACA-K", deviceId: "d1" }), await deps())).status).toBe(403);
  });

  it("activates a device and returns a token with active status", async () => {
    await seed();
    const res = await handleActivate(req({ licenseKey: "ACA-K", deviceId: "d1" }), await deps());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; token: string; status: string; deviceLimit: number };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("active");
    expect(body.deviceLimit).toBe(3);
    expect(body.token.split(".")).toHaveLength(3);
    expect(await repo.getActivation(db(), "ACA-K", "d1")).toBe(true);
  });

  it("re-activating the same device is idempotent (still 200, count stays 1)", async () => {
    await seed();
    await handleActivate(req({ licenseKey: "ACA-K", deviceId: "d1" }), await deps());
    const res = await handleActivate(req({ licenseKey: "ACA-K", deviceId: "d1" }), await deps());
    expect(res.status).toBe(200);
    expect(await repo.countActivations(db(), "ACA-K")).toBe(1);
  });

  it("409 when a new device exceeds the limit", async () => {
    await seed("active", 1);
    await handleActivate(req({ licenseKey: "ACA-K", deviceId: "d1" }), await deps());
    const res = await handleActivate(req({ licenseKey: "ACA-K", deviceId: "d2" }), await deps());
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- activate`
Expected: FAIL — cannot find module `../../src/handlers/activate`.

- [ ] **Step 3: Write the implementation**

Create `server/src/handlers/activate.ts`:

```ts
import { signLicenseToken } from "../lib/jwt";
import { sha256Hex } from "../lib/encoding";
import * as repo from "../license/repository";

export interface LicenseDeps {
  db: D1Database;
  signingKey: CryptoKey;
  now: () => number;
}

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function handleActivate(request: Request, deps: LicenseDeps): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { licenseKey?: string; deviceId?: string } | null;
  if (!body?.licenseKey || !body?.deviceId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const license = await repo.getLicenseByKey(deps.db, body.licenseKey);
  if (!license) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  if (license.status !== "active") {
    return Response.json({ ok: false, error: "inactive", status: license.status }, { status: 403 });
  }

  const already = await repo.getActivation(deps.db, body.licenseKey, body.deviceId);
  if (!already) {
    const count = await repo.countActivations(deps.db, body.licenseKey);
    if (count >= license.device_limit) {
      return Response.json({ ok: false, error: "device_limit", deviceLimit: license.device_limit }, { status: 409 });
    }
  }

  const nowMs = deps.now();
  await repo.upsertActivation(deps.db, body.licenseKey, body.deviceId, nowMs);

  const iat = Math.floor(nowMs / 1000);
  const token = await signLicenseToken(
    {
      sub: await sha256Hex(body.licenseKey),
      deviceId: body.deviceId,
      status: license.status,
      plan: license.plan,
      iat,
      exp: iat + TOKEN_TTL_SECONDS
    },
    deps.signingKey
  );

  return Response.json({ ok: true, token, status: license.status, plan: license.plan, deviceLimit: license.device_limit });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- activate`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/handlers/activate.ts server/test/handlers/activate.test.ts
git commit -m "feat(server): activate handler (device-limit + signed token)"
```

---

### Task 10: Validate handler

**Files:**
- Create: `server/src/handlers/validate.ts`
- Test: `server/test/handlers/validate.test.ts`

**Interfaces:**
- Consumes: `LicenseDeps` (Task 9), repository fns, `signLicenseToken`, `sha256Hex`.
- Produces: `handleValidate(request: Request, deps: LicenseDeps): Promise<Response>`. Refreshes the token for an already-activated device, updates `last_seen_at`. 404 unknown key; 403 inactive; 409 `not_activated` (device was deactivated/removed → client should downgrade).

- [ ] **Step 1: Write the failing test**

Create `server/test/handlers/validate.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema, makeTestKeypair } from "../helpers";
import { handleValidate } from "../../src/handlers/validate";
import { handleActivate, type LicenseDeps } from "../../src/handlers/activate";
import * as repo from "../../src/license/repository";

const db = () => env.DB as D1Database;

async function deps(now = 2_000_000): Promise<LicenseDeps> {
  const kp = await makeTestKeypair();
  const { importSigningKey } = await import("../../src/lib/jwt");
  return { db: db(), signingKey: await importSigningKey(kp.privatePkcs8B64), now: () => now };
}
const rq = (b: unknown, p: string) => new Request(`https://x/license/${p}`, { method: "POST", body: JSON.stringify(b) });

async function seed(status = "active"): Promise<void> {
  await repo.insertLicense(db(), {
    license_key: "ACA-K", paddle_subscription_id: "s", paddle_customer_id: "c",
    paddle_transaction_id: null, email: "e@x.com", status, plan: "monthly",
    device_limit: 3, created_at: 1, updated_at: 1
  });
}

describe("handleValidate", () => {
  beforeEach(async () => {
    await applySchema(db());
    await db().prepare("DELETE FROM activations").run();
    await db().prepare("DELETE FROM licenses").run();
  });

  it("returns a fresh token and updates last_seen for an activated device", async () => {
    await seed();
    await handleActivate(rq({ licenseKey: "ACA-K", deviceId: "d1" }, "activate"), await deps(1_000_000));
    const res = await handleValidate(rq({ licenseKey: "ACA-K", deviceId: "d1" }, "validate"), await deps(9_000_000));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; token: string };
    expect(body.ok).toBe(true);
    expect(body.token.split(".")).toHaveLength(3);
    const seen = await db().prepare("SELECT last_seen_at FROM activations WHERE license_key='ACA-K' AND device_id='d1'").first<{ last_seen_at: number }>();
    expect(seen?.last_seen_at).toBe(9_000_000);
  });

  it("409 not_activated when the device is not (or no longer) activated", async () => {
    await seed();
    const res = await handleValidate(rq({ licenseKey: "ACA-K", deviceId: "ghost" }, "validate"), await deps());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("not_activated");
  });

  it("403 inactive when the subscription was canceled", async () => {
    await seed();
    await handleActivate(rq({ licenseKey: "ACA-K", deviceId: "d1" }, "activate"), await deps());
    await repo.updateLicenseStatus(db(), "s", "canceled", 5);
    const res = await handleValidate(rq({ licenseKey: "ACA-K", deviceId: "d1" }, "validate"), await deps());
    expect(res.status).toBe(403);
  });

  it("404 for an unknown key", async () => {
    const res = await handleValidate(rq({ licenseKey: "nope", deviceId: "d1" }, "validate"), await deps());
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- validate`
Expected: FAIL — cannot find module `../../src/handlers/validate`.

- [ ] **Step 3: Write the implementation**

Create `server/src/handlers/validate.ts`:

```ts
import { signLicenseToken } from "../lib/jwt";
import { sha256Hex } from "../lib/encoding";
import * as repo from "../license/repository";
import type { LicenseDeps } from "./activate";

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function handleValidate(request: Request, deps: LicenseDeps): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { licenseKey?: string; deviceId?: string } | null;
  if (!body?.licenseKey || !body?.deviceId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const license = await repo.getLicenseByKey(deps.db, body.licenseKey);
  if (!license) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  if (license.status !== "active") {
    return Response.json({ ok: false, error: "inactive", status: license.status }, { status: 403 });
  }

  const activated = await repo.getActivation(deps.db, body.licenseKey, body.deviceId);
  if (!activated) {
    return Response.json({ ok: false, error: "not_activated" }, { status: 409 });
  }

  const nowMs = deps.now();
  await repo.touchLastSeen(deps.db, body.licenseKey, body.deviceId, nowMs);

  const iat = Math.floor(nowMs / 1000);
  const token = await signLicenseToken(
    {
      sub: await sha256Hex(body.licenseKey),
      deviceId: body.deviceId,
      status: license.status,
      plan: license.plan,
      iat,
      exp: iat + TOKEN_TTL_SECONDS
    },
    deps.signingKey
  );

  return Response.json({ ok: true, token, status: license.status, plan: license.plan, deviceLimit: license.device_limit });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- validate`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/handlers/validate.ts server/test/handlers/validate.test.ts
git commit -m "feat(server): validate handler (re-check + token refresh)"
```

---

### Task 11: Deactivate handler

**Files:**
- Create: `server/src/handlers/deactivate.ts`
- Test: `server/test/handlers/deactivate.test.ts`

**Interfaces:**
- Consumes: `LicenseDeps`, `repo.deleteActivation`.
- Produces: `handleDeactivate(request: Request, deps: LicenseDeps): Promise<Response>`. Frees a device slot; idempotent (deactivating an absent device still returns 200).

- [ ] **Step 1: Write the failing test**

Create `server/test/handlers/deactivate.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema, makeTestKeypair } from "../helpers";
import { handleDeactivate } from "../../src/handlers/deactivate";
import { handleActivate, type LicenseDeps } from "../../src/handlers/activate";
import * as repo from "../../src/license/repository";

const db = () => env.DB as D1Database;
async function deps(): Promise<LicenseDeps> {
  const kp = await makeTestKeypair();
  const { importSigningKey } = await import("../../src/lib/jwt");
  return { db: db(), signingKey: await importSigningKey(kp.privatePkcs8B64), now: () => 1000 };
}
const rq = (b: unknown, p: string) => new Request(`https://x/license/${p}`, { method: "POST", body: JSON.stringify(b) });

describe("handleDeactivate", () => {
  beforeEach(async () => {
    await applySchema(db());
    await db().prepare("DELETE FROM activations").run();
    await db().prepare("DELETE FROM licenses").run();
    await repo.insertLicense(db(), {
      license_key: "ACA-K", paddle_subscription_id: "s", paddle_customer_id: "c",
      paddle_transaction_id: null, email: "e@x.com", status: "active", plan: "monthly",
      device_limit: 3, created_at: 1, updated_at: 1
    });
  });

  it("frees a device slot", async () => {
    await handleActivate(rq({ licenseKey: "ACA-K", deviceId: "d1" }, "activate"), await deps());
    expect(await repo.countActivations(db(), "ACA-K")).toBe(1);
    const res = await handleDeactivate(rq({ licenseKey: "ACA-K", deviceId: "d1" }, "deactivate"), await deps());
    expect(res.status).toBe(200);
    expect(await repo.countActivations(db(), "ACA-K")).toBe(0);
  });

  it("is idempotent for an unknown device", async () => {
    const res = await handleDeactivate(rq({ licenseKey: "ACA-K", deviceId: "ghost" }, "deactivate"), await deps());
    expect(res.status).toBe(200);
  });

  it("400 when fields are missing", async () => {
    const res = await handleDeactivate(rq({ licenseKey: "ACA-K" }, "deactivate"), await deps());
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- deactivate`
Expected: FAIL — cannot find module `../../src/handlers/deactivate`.

- [ ] **Step 3: Write the implementation**

Create `server/src/handlers/deactivate.ts`:

```ts
import * as repo from "../license/repository";
import type { LicenseDeps } from "./activate";

export async function handleDeactivate(request: Request, deps: LicenseDeps): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { licenseKey?: string; deviceId?: string } | null;
  if (!body?.licenseKey || !body?.deviceId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  await repo.deleteActivation(deps.db, body.licenseKey, body.deviceId);
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- deactivate`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/handlers/deactivate.ts server/test/handlers/deactivate.test.ts
git commit -m "feat(server): deactivate handler (free a device slot)"
```

---

### Task 12: Success page (`GET /license?txn=`)

**Files:**
- Create: `server/src/handlers/successPage.ts`
- Test: `server/test/handlers/successPage.test.ts`

**Interfaces:**
- Consumes: `repo.getLicenseByTransaction`.
- Produces: `handleSuccessPage(url: URL, db: D1Database): Promise<Response>` — returns `text/html`. Shows the key when found; a "being generated, this page auto-refreshes" message (HTTP 200, with a `<meta http-equiv="refresh">`) while the webhook is still in flight. Never leaks another buyer's key (lookup is by the opaque txn id only). 400 when `txn` is absent.

- [ ] **Step 1: Write the failing test**

Create `server/test/handlers/successPage.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema } from "../helpers";
import { handleSuccessPage } from "../../src/handlers/successPage";
import * as repo from "../../src/license/repository";

const db = () => env.DB as D1Database;

describe("handleSuccessPage", () => {
  beforeEach(async () => {
    await applySchema(db());
    await db().prepare("DELETE FROM licenses").run();
  });

  it("400 when txn is missing", async () => {
    const res = await handleSuccessPage(new URL("https://x/license"), db());
    expect(res.status).toBe(400);
  });

  it("shows the license key for a known transaction", async () => {
    await repo.insertLicense(db(), {
      license_key: "ACA-SHOWN", paddle_subscription_id: "s", paddle_customer_id: "c",
      paddle_transaction_id: "txn_1", email: "e@x.com", status: "active", plan: "monthly",
      device_limit: 3, created_at: 1, updated_at: 1
    });
    const res = await handleSuccessPage(new URL("https://x/license?txn=txn_1"), db());
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("ACA-SHOWN");
  });

  it("shows an auto-refreshing pending page when the webhook has not arrived yet", async () => {
    const res = await handleSuccessPage(new URL("https://x/license?txn=unknown"), db());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("http-equiv=\"refresh\"");
    expect(html).not.toContain("ACA-");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- successPage`
Expected: FAIL — cannot find module `../../src/handlers/successPage`.

- [ ] **Step 3: Write the implementation**

Create `server/src/handlers/successPage.ts`:

```ts
import * as repo from "../license/repository";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function page(inner: string, autoRefresh: boolean): Response {
  const refresh = autoRefresh ? '<meta http-equiv="refresh" content="4">' : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${refresh}
<title>AI Coding Alerts — Pro License</title>
<style>body{font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#1f2430}
.key{font-family:ui-monospace,monospace;font-size:1.25rem;background:#f2f3f7;border:1px solid #d9dce4;border-radius:.5rem;padding:1rem;text-align:center;letter-spacing:.05em}
h1{font-size:1.4rem}.muted{color:#6b7280}</style></head><body>${inner}</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function handleSuccessPage(url: URL, db: D1Database): Promise<Response> {
  const txn = url.searchParams.get("txn");
  if (!txn) {
    return page(`<h1>Missing transaction</h1><p class="muted">No transaction id in the link.</p>`, false);
    // status stays 200 for a friendly page? -> we want 400; override below.
  }
  const license = await repo.getLicenseByTransaction(db, txn);
  if (!license) {
    return page(
      `<h1>Your license is being generated…</h1>
       <p class="muted">This can take a few seconds after payment. This page refreshes automatically.</p>`,
      true
    );
  }
  return page(
    `<h1>You're Pro! 🎉</h1>
     <p>Your AI Coding Alerts license key:</p>
     <div class="key">${escapeHtml(license.license_key)}</div>
     <p class="muted">In VS Code, run <strong>“AI Coding Alerts: Enter Pro License”</strong> and paste this key. Keep it safe — treat it like a password.</p>`,
    false
  );
}
```

Then fix the missing-txn branch to return a real 400 (replace that branch body):

```ts
  if (!txn) {
    const res = page(`<h1>Missing transaction</h1><p class="muted">No transaction id in the link.</p>`, false);
    return new Response(res.body, { status: 400, headers: res.headers });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- successPage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/handlers/successPage.ts server/test/handlers/successPage.test.ts
git commit -m "feat(server): post-checkout success page (txn -> key)"
```

---

### Task 13: Router wiring + key-gen script

**Files:**
- Modify: `server/src/index.ts`
- Create: `server/scripts/gen-keys.mjs`
- Test: `server/test/index.test.ts`

**Interfaces:**
- Consumes: all handlers; `Env` (add `LICENSE_SIGNING_PRIVATE_KEY`), `importSigningKey`, `generateLicenseKey`, `noopDeliverer`.
- Produces: the composed `fetch` export dispatching every route.

- [ ] **Step 1: Write the failing test**

Create `server/test/index.test.ts` (routes through `SELF.fetch` end-to-end; the signing secret is supplied via a per-test env binding — see Step 3 note):

```ts
import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("router", () => {
  it("404s an unknown route", async () => {
    const res = await SELF.fetch("https://x/nope");
    expect(res.status).toBe(404);
  });

  it("rejects an unsigned Paddle webhook with 401", async () => {
    const res = await SELF.fetch("https://x/webhooks/paddle", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });

  it("400s activate with no body fields", async () => {
    const res = await SELF.fetch("https://x/license/activate", { method: "POST", body: "{}" });
    expect(res.status).toBe(400);
  });

  it("serves the success page as HTML", async () => {
    const res = await SELF.fetch("https://x/license?txn=whatever");
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
```

> The `activate` 400 test needs `LICENSE_SIGNING_PRIVATE_KEY` present so `fetch` can build deps without throwing. Add a throwaway key to `server/vitest.config.ts` `miniflare.bindings` (generate once via the Step 4 script and paste the base64 PKCS8 — it is a **test-only** key, safe to commit in the test config):
> ```ts
> bindings: { PADDLE_WEBHOOK_SECRET: "whsec_test", LICENSE_SIGNING_PRIVATE_KEY: "<paste base64 pkcs8 from gen-keys>" }
> ```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- index`
Expected: FAIL — routes still return the scaffold's 501 `not_implemented` (or 404), not the wired responses.

- [ ] **Step 3: Wire the router**

Replace `server/src/index.ts` with:

```ts
/**
 * AI Coding Alerts — licensing backend (Cloudflare Worker).
 * Design: ../docs/superpowers/specs/2026-07-22-licensing-backend-design.md
 */
import { importSigningKey } from "./lib/jwt";
import { generateLicenseKey } from "./license/keygen";
import { noopDeliverer } from "./license/deliver";
import { handlePaddleWebhook } from "./handlers/webhook";
import { handleActivate, type LicenseDeps } from "./handlers/activate";
import { handleValidate } from "./handlers/validate";
import { handleDeactivate } from "./handlers/deactivate";
import { handleSuccessPage } from "./handlers/successPage";

export interface Env {
  DB: D1Database;
  PADDLE_WEBHOOK_SECRET: string;
  LICENSE_SIGNING_PRIVATE_KEY: string;
}

// Ed25519 key import is cheap but do it once per isolate.
let signingKeyPromise: Promise<CryptoKey> | null = null;
function getSigningKey(env: Env): Promise<CryptoKey> {
  if (!signingKeyPromise) signingKeyPromise = importSigningKey(env.LICENSE_SIGNING_PRIVATE_KEY);
  return signingKeyPromise;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    if (route === "POST /webhooks/paddle") {
      return handlePaddleWebhook(request, {
        db: env.DB,
        webhookSecret: env.PADDLE_WEBHOOK_SECRET,
        deliver: noopDeliverer, // v1: success page delivers; swap to CloudflareEmailDeliverer when a domain exists
        now: () => Date.now(),
        newKey: generateLicenseKey
      });
    }

    if (route === "GET /license") {
      return handleSuccessPage(url, env.DB);
    }

    const licenseDeps: LicenseDeps = { db: env.DB, signingKey: await getSigningKey(env), now: () => Date.now() };
    if (route === "POST /license/activate") return handleActivate(request, licenseDeps);
    if (route === "POST /license/validate") return handleValidate(request, licenseDeps);
    if (route === "POST /license/deactivate") return handleDeactivate(request, licenseDeps);

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Write the key-generation script**

Create `server/scripts/gen-keys.mjs`:

```js
// Generate an Ed25519 keypair for license-token signing.
//   node scripts/gen-keys.mjs
// Private (PKCS8 base64) -> Worker secret LICENSE_SIGNING_PRIVATE_KEY.
// Public  (raw base64)   -> extension constant LICENSE_PUBLIC_KEY_B64.
const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const b64 = (u8) => Buffer.from(u8).toString("base64");
console.log("PRIVATE (LICENSE_SIGNING_PRIVATE_KEY, base64 pkcs8):\n" + b64(pkcs8) + "\n");
console.log("PUBLIC (extension LICENSE_PUBLIC_KEY_B64, base64 raw):\n" + b64(raw) + "\n");
```

Update the `.dev.vars.example` note and add the key to the vitest config as described in Step 1. Run the script once to produce the test key:

Run: `cd server && node scripts/gen-keys.mjs`
Paste the printed PKCS8 base64 into `server/vitest.config.ts` `miniflare.bindings.LICENSE_SIGNING_PRIVATE_KEY`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm test`
Expected: PASS (all backend suites, including `index`).

- [ ] **Step 6: Typecheck + commit**

Run: `cd server && npm run typecheck`
Expected: no errors.

```bash
git add server/src/index.ts server/scripts/gen-keys.mjs server/vitest.config.ts server/.dev.vars.example
git commit -m "feat(server): wire router + Ed25519 key-gen script"
```

---

# Phase B — Extension (`src/license/`)

### Task 14: Device id

**Files:**
- Create: `src/license/deviceId.ts`
- Test: `test/license/deviceId.test.ts`

**Interfaces:**
- Produces:
  - `KeyValueStore = { get<T>(key: string): T | undefined; update(key: string, value: unknown): Thenable<void> }` (a subset of `vscode.Memento` — so `context.globalState` satisfies it).
  - `getOrCreateDeviceId(store: KeyValueStore): string`

- [ ] **Step 1: Write the failing test**

Create `test/license/deviceId.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getOrCreateDeviceId, type KeyValueStore } from "../../src/license/deviceId";

function fakeStore(initial: Record<string, unknown> = {}): KeyValueStore & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    get<T>(key: string): T | undefined { return data[key] as T | undefined; },
    update(key: string, value: unknown): Promise<void> { data[key] = value; return Promise.resolve(); }
  };
}

test("generates and persists a device id on first call", () => {
  const store = fakeStore();
  const id = getOrCreateDeviceId(store);
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(store.data["aiCodingAlerts.deviceId"], id);
});

test("returns the same id on subsequent calls", () => {
  const store = fakeStore({ "aiCodingAlerts.deviceId": "fixed-id" });
  assert.equal(getOrCreateDeviceId(store), "fixed-id");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/license/deviceId.test.ts` (from repo root)
Expected: FAIL — cannot find module `../../src/license/deviceId`.

> Note: the repo's `test` script globs `"test/**/*.test.ts"`. To run a single file, use: `node --import tsx --test test/license/deviceId.test.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/license/deviceId.ts`:

```ts
import { randomUUID } from "node:crypto";

const DEVICE_ID_KEY = "aiCodingAlerts.deviceId";

/** Minimal slice of vscode.Memento — lets pure code avoid importing "vscode". */
export interface KeyValueStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export function getOrCreateDeviceId(store: KeyValueStore): string {
  const existing = store.get<string>(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = randomUUID();
  void store.update(DEVICE_ID_KEY, id);
  return id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/license/deviceId.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/license/deviceId.ts test/license/deviceId.test.ts
git commit -m "feat(license): device id generation + persistence"
```

---

### Task 15: Token verification (extension side)

**Files:**
- Create: `src/license/encoding.ts`
- Create: `src/license/token.ts`
- Test: `test/license/token.test.ts`

**Interfaces:**
- Produces:
  - `src/license/encoding.ts`: `base64urlDecodeToBytes(s: string): Uint8Array`, `base64urlDecodeToString(s: string): string`, `sha256Hex(input: string): Promise<string>`.
  - `src/license/token.ts`:
    - `TokenPayload = { sub: string; deviceId: string; status: string; plan: string | null; iat: number; exp: number }`
    - `decodeToken(token: string): TokenPayload | null` (parses, no signature check)
    - `importPublicKey(rawBase64: string): Promise<CryptoKey>`
    - `verifyToken(token: string, key: CryptoKey): Promise<TokenPayload | null>` (returns payload iff signature valid)

- [ ] **Step 1: Write the failing test**

Create `test/license/token.test.ts` (signs with a throwaway keypair via Node's Web Crypto, then verifies):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { decodeToken, importPublicKey, verifyToken } from "../../src/license/token";

const subtle = webcrypto.subtle;
const b64url = (u8: Uint8Array) =>
  Buffer.from(u8).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

async function makeToken(payload: object): Promise<{ token: string; publicB64: string }> {
  const pair = (await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const header = b64url(Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const input = `${header}.${body}`;
  const sig = new Uint8Array(await subtle.sign({ name: "Ed25519" }, pair.privateKey, Buffer.from(input)));
  const raw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  return { token: `${input}.${b64url(sig)}`, publicB64: Buffer.from(raw).toString("base64") };
}

const payload = { sub: "h", deviceId: "d", status: "active", plan: "monthly", iat: 100, exp: 200 };

test("decodeToken parses claims without verifying", () => {
  assert.equal(decodeToken("aaa.bbb")?.sub, undefined); // malformed base64 body -> null
  assert.equal(decodeToken("not-a-token"), null);
});

test("verifyToken returns the payload for a valid signature", async () => {
  const { token, publicB64 } = await makeToken(payload);
  const key = await importPublicKey(publicB64);
  const result = await verifyToken(token, key);
  assert.deepEqual(result, payload);
});

test("verifyToken returns null for a tampered payload", async () => {
  const { token, publicB64 } = await makeToken(payload);
  const key = await importPublicKey(publicB64);
  const [h, , s] = token.split(".");
  const forgedBody = Buffer.from(JSON.stringify({ ...payload, status: "hacked" }))
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  assert.equal(await verifyToken(`${h}.${forgedBody}.${s}`, key), null);
});

test("verifyToken returns null for a token signed by a different key", async () => {
  const { token } = await makeToken(payload);
  const other = await makeToken(payload);
  const key = await importPublicKey(other.publicB64);
  assert.equal(await verifyToken(token, key), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test test/license/token.test.ts`
Expected: FAIL — cannot find module `../../src/license/token`.

- [ ] **Step 3: Write the implementations**

Create `src/license/encoding.ts`:

```ts
import { webcrypto } from "node:crypto";

function toStandardBase64(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return s.replace(/-/g, "+").replace(/_/g, "/") + pad;
}

export function base64urlDecodeToBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(toStandardBase64(s), "base64"));
}

export function base64urlDecodeToString(s: string): string {
  return Buffer.from(toStandardBase64(s), "base64").toString("utf8");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

Create `src/license/token.ts`:

```ts
import { webcrypto } from "node:crypto";
import { base64urlDecodeToBytes, base64urlDecodeToString } from "./encoding";

export interface TokenPayload {
  sub: string;
  deviceId: string;
  status: string;
  plan: string | null;
  iat: number;
  exp: number;
}

export function decodeToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64urlDecodeToString(parts[1])) as TokenPayload;
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;
    return payload;
  } catch {
    return null;
  }
}

export function importPublicKey(rawBase64: string): Promise<CryptoKey> {
  const raw = new Uint8Array(Buffer.from(rawBase64, "base64"));
  return webcrypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]) as Promise<CryptoKey>;
}

export async function verifyToken(token: string, key: CryptoKey): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = decodeToken(token);
  if (!payload) return null;
  try {
    const ok = await webcrypto.subtle.verify(
      { name: "Ed25519" },
      key,
      base64urlDecodeToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    return ok ? payload : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/license/token.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/license/encoding.ts src/license/token.ts test/license/token.test.ts
git commit -m "feat(license): offline Ed25519 token verification"
```

---

### Task 16: License state machine

**Files:**
- Create: `src/license/state.ts`
- Test: `test/license/state.test.ts`

**Interfaces:**
- Consumes: `TokenPayload` from `./token`.
- Produces:
  - `LicenseMode = "active" | "grace" | "expired" | "inactive" | "none"`
  - `LicenseState = { pro: boolean; mode: LicenseMode; shouldRevalidate: boolean }`
  - `evaluateLicense(payload: TokenPayload | null, nowMs: number): LicenseState`
  - Constants (exported): `TOKEN_TTL_MS`, `GRACE_MS`, `RECHECK_MS`.

**Rules** (times from `payload.iat`, in seconds → compare against `nowMs`):
- `payload === null` → `{ pro: false, mode: "none", shouldRevalidate: false }`.
- `status !== "active"` → `{ pro: false, mode: "inactive", shouldRevalidate: true }`.
- `now < iat + GRACE` and `now <= exp` → `mode: "active"`, `pro: true`.
- `now < iat + GRACE` and `now > exp` → `mode: "grace"`, `pro: true` (token past its 7-day TTL but within the 14-day offline window).
- `now >= iat + GRACE` → `mode: "expired"`, `pro: false`.
- `shouldRevalidate` = `now >= iat + RECHECK` (i.e. ~3 days since last server contact), whenever a payload exists.

- [ ] **Step 1: Write the failing test**

Create `test/license/state.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateLicense, TOKEN_TTL_MS, GRACE_MS, RECHECK_MS } from "../../src/license/state";
import type { TokenPayload } from "../../src/license/token";

const iatSec = 1_000_000;
const iatMs = iatSec * 1000;
const base: TokenPayload = { sub: "h", deviceId: "d", status: "active", plan: "monthly", iat: iatSec, exp: iatSec + TOKEN_TTL_MS / 1000 };

test("no token -> not pro, mode none", () => {
  assert.deepEqual(evaluateLicense(null, iatMs), { pro: false, mode: "none", shouldRevalidate: false });
});

test("fresh active token -> pro, mode active", () => {
  const s = evaluateLicense(base, iatMs + 1000);
  assert.equal(s.pro, true);
  assert.equal(s.mode, "active");
});

test("past TTL but inside grace -> pro, mode grace", () => {
  const s = evaluateLicense(base, iatMs + TOKEN_TTL_MS + 60_000);
  assert.equal(s.pro, true);
  assert.equal(s.mode, "grace");
});

test("past grace -> not pro, mode expired", () => {
  const s = evaluateLicense(base, iatMs + GRACE_MS + 1000);
  assert.equal(s.pro, false);
  assert.equal(s.mode, "expired");
});

test("inactive status -> not pro, mode inactive, wants revalidation", () => {
  const s = evaluateLicense({ ...base, status: "canceled" }, iatMs + 1000);
  assert.deepEqual(s, { pro: false, mode: "inactive", shouldRevalidate: true });
});

test("shouldRevalidate flips on after the recheck cadence", () => {
  assert.equal(evaluateLicense(base, iatMs + RECHECK_MS - 1000).shouldRevalidate, false);
  assert.equal(evaluateLicense(base, iatMs + RECHECK_MS + 1000).shouldRevalidate, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test test/license/state.test.ts`
Expected: FAIL — cannot find module `../../src/license/state`.

- [ ] **Step 3: Write the implementation**

Create `src/license/state.ts`:

```ts
import type { TokenPayload } from "./token";

export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7-day token TTL
export const GRACE_MS = 14 * 24 * 60 * 60 * 1000; // 14-day offline grace (from iat)
export const RECHECK_MS = 3 * 24 * 60 * 60 * 1000; // ~3-day re-check cadence

export type LicenseMode = "active" | "grace" | "expired" | "inactive" | "none";

export interface LicenseState {
  pro: boolean;
  mode: LicenseMode;
  shouldRevalidate: boolean;
}

export function evaluateLicense(payload: TokenPayload | null, nowMs: number): LicenseState {
  if (!payload) return { pro: false, mode: "none", shouldRevalidate: false };

  const iatMs = payload.iat * 1000;
  const expMs = payload.exp * 1000;
  const shouldRevalidate = nowMs >= iatMs + RECHECK_MS;

  if (payload.status !== "active") {
    return { pro: false, mode: "inactive", shouldRevalidate: true };
  }
  if (nowMs >= iatMs + GRACE_MS) {
    return { pro: false, mode: "expired", shouldRevalidate };
  }
  if (nowMs > expMs) {
    return { pro: true, mode: "grace", shouldRevalidate };
  }
  return { pro: true, mode: "active", shouldRevalidate };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/license/state.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/license/state.ts test/license/state.test.ts
git commit -m "feat(license): active/grace/expired/inactive state machine"
```

---

### Task 17: License API edge (network)

**Files:**
- Create: `src/license/api.ts`
- Test: `test/license/api.test.ts`

**Interfaces:**
- Produces:
  - `FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; json(): Promise<unknown> }>`
  - `ActivateResult = { ok: true; token: string; status: string; plan: string | null; deviceLimit: number } | { ok: false; code: "not_found" | "device_limit" | "inactive" | "not_activated" | "network" | "server"; message: string }`
  - `activateLicense(baseUrl, licenseKey, deviceId, fetchImpl): Promise<ActivateResult>`
  - `validateLicense(baseUrl, licenseKey, deviceId, fetchImpl): Promise<ActivateResult>`
  - `deactivateLicense(baseUrl, licenseKey, deviceId, fetchImpl): Promise<{ ok: boolean }>`

- [ ] **Step 1: Write the failing test**

Create `test/license/api.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { activateLicense, validateLicense, type FetchLike } from "../../src/license/api";

function fakeFetch(status: number, body: unknown, spy?: (u: string, i: unknown) => void): FetchLike {
  return async (url, init) => {
    spy?.(url, init);
    return { status, json: async () => body };
  };
}

test("activate posts to /license/activate with the key + device", async () => {
  let seen: { url: string; init: unknown } | null = null;
  const fetchImpl = fakeFetch(200, { ok: true, token: "t", status: "active", plan: "monthly", deviceLimit: 3 }, (url, init) => { seen = { url, init }; });
  const res = await activateLicense("https://api", "ACA-K", "d1", fetchImpl);
  assert.equal(seen!.url, "https://api/license/activate");
  assert.deepEqual(JSON.parse((seen!.init as { body: string }).body), { licenseKey: "ACA-K", deviceId: "d1" });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.token, "t");
});

test("activate maps 404 to not_found", async () => {
  const res = await activateLicense("https://api", "x", "d1", fakeFetch(404, { ok: false, error: "not_found" }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "not_found");
});

test("activate maps 409 to device_limit", async () => {
  const res = await activateLicense("https://api", "x", "d1", fakeFetch(409, { ok: false, error: "device_limit" }));
  if (!res.ok) assert.equal(res.code, "device_limit");
});

test("activate maps 403 to inactive", async () => {
  const res = await activateLicense("https://api", "x", "d1", fakeFetch(403, { ok: false, error: "inactive" }));
  if (!res.ok) assert.equal(res.code, "inactive");
});

test("a thrown fetch maps to a network error", async () => {
  const fetchImpl: FetchLike = async () => { throw new Error("offline"); };
  const res = await activateLicense("https://api", "x", "d1", fetchImpl);
  if (!res.ok) assert.equal(res.code, "network");
});

test("validate maps 409 not_activated", async () => {
  const res = await validateLicense("https://api", "x", "d1", fakeFetch(409, { ok: false, error: "not_activated" }));
  if (!res.ok) assert.equal(res.code, "not_activated");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test test/license/api.test.ts`
Expected: FAIL — cannot find module `../../src/license/api`.

- [ ] **Step 3: Write the implementation**

Create `src/license/api.ts`:

```ts
export interface FetchLike {
  (url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<{
    status: number;
    json(): Promise<unknown>;
  }>;
}

export type ActivateResult =
  | { ok: true; token: string; status: string; plan: string | null; deviceLimit: number }
  | {
      ok: false;
      code: "not_found" | "device_limit" | "inactive" | "not_activated" | "network" | "server";
      message: string;
    };

const CODE_BY_STATUS: Record<number, ActivateResult extends { ok: false } ? never : never> = {} as never;

function mapError(status: number, error: unknown): ActivateResult {
  const known: Record<string, ActivateResult & { ok: false }> = {
    not_found: { ok: false, code: "not_found", message: "License key not found." },
    device_limit: { ok: false, code: "device_limit", message: "Device limit reached. Deactivate another device first." },
    inactive: { ok: false, code: "inactive", message: "This subscription is not active." },
    not_activated: { ok: false, code: "not_activated", message: "This device is not activated." }
  };
  if (typeof error === "string" && known[error]) return known[error];
  return { ok: false, code: "server", message: `Server error (${status}).` };
}

async function call(url: string, licenseKey: string, deviceId: string, fetchImpl: FetchLike): Promise<ActivateResult> {
  let res: { status: number; json(): Promise<unknown> };
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey, deviceId })
    });
  } catch {
    return { ok: false, code: "network", message: "Couldn't reach the license server. Check your connection." };
  }
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean; error?: string; token?: string; status?: string; plan?: string | null; deviceLimit?: number;
  };
  if (res.status === 200 && body.ok && body.token) {
    return { ok: true, token: body.token, status: body.status ?? "active", plan: body.plan ?? null, deviceLimit: body.deviceLimit ?? 3 };
  }
  return mapError(res.status, body.error);
}

export function activateLicense(baseUrl: string, licenseKey: string, deviceId: string, fetchImpl: FetchLike): Promise<ActivateResult> {
  return call(`${baseUrl}/license/activate`, licenseKey, deviceId, fetchImpl);
}

export function validateLicense(baseUrl: string, licenseKey: string, deviceId: string, fetchImpl: FetchLike): Promise<ActivateResult> {
  return call(`${baseUrl}/license/validate`, licenseKey, deviceId, fetchImpl);
}

export async function deactivateLicense(baseUrl: string, licenseKey: string, deviceId: string, fetchImpl: FetchLike): Promise<{ ok: boolean }> {
  try {
    const res = await fetchImpl(`${baseUrl}/license/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey, deviceId })
    });
    return { ok: res.status === 200 };
  } catch {
    return { ok: false };
  }
}
```

Remove the unused `CODE_BY_STATUS` placeholder line before running (it exists only to show the mapping is table-driven — delete it):

```ts
// delete this line:
const CODE_BY_STATUS: Record<number, ActivateResult extends { ok: false } ? never : never> = {} as never;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/license/api.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/license/api.ts test/license/api.test.ts
git commit -m "feat(license): network edge for activate/validate/deactivate"
```

---

### Task 18: LicenseService + constants + requirePro

**Files:**
- Create: `src/license/constants.ts`
- Create: `src/license/LicenseService.ts`
- Create: `src/license/requirePro.ts`
- Test: `test/license/licenseService.test.ts`

**Interfaces:**
- Consumes: `getOrCreateDeviceId`, `importPublicKey`/`verifyToken`, `evaluateLicense`, `activateLicense`/`validateLicense`/`deactivateLicense`.
- Produces:
  - `constants.ts`: `LICENSE_BASE_URL`, `LICENSE_PUBLIC_KEY_B64`, `PADDLE_CHECKOUT_URL`.
  - `SecretStore = { get(key: string): Thenable<string | undefined>; store(key: string, value: string): Thenable<void>; delete(key: string): Thenable<void> }` (matches `vscode.SecretStorage`).
  - `LicenseServiceDeps = { secrets: SecretStore; deviceId: string; baseUrl: string; publicKeyB64: string; fetchImpl: FetchLike; now: () => number }`
  - `class LicenseService` with: `init(): Promise<void>`, `isPro(): boolean`, `state(): LicenseState`, `enterLicense(key: string): Promise<ActivateResult>`, `revalidateIfDue(): Promise<void>`, `revalidateNow(): Promise<ActivateResult>`, `deactivateThisDevice(): Promise<boolean>`, `removeLicense(): Promise<void>`, `hasKey(): boolean`.
  - `requirePro.ts`: `requirePro(service: { isPro(): boolean }, feature: string, showUpsell: (feature: string) => void): boolean`.

- [ ] **Step 1: Write the failing test**

Create `test/license/licenseService.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { LicenseService, type SecretStore } from "../../src/license/LicenseService";
import { requirePro } from "../../src/license/requirePro";
import type { FetchLike } from "../../src/license/api";

const subtle = webcrypto.subtle;
const b64url = (u8: Uint8Array) => Buffer.from(u8).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

// Build a signing keypair + a token minting helper the fake server will use.
async function keypair() {
  const pair = (await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  return { pair, publicB64: Buffer.from(raw).toString("base64") };
}
async function mint(pair: CryptoKeyPair, iatSec: number, status = "active"): Promise<string> {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })));
  const body = b64url(Buffer.from(JSON.stringify({ sub: "h", deviceId: "dev", status, plan: "monthly", iat: iatSec, exp: iatSec + 7 * 24 * 3600 })));
  const input = `${header}.${body}`;
  const sig = new Uint8Array(await subtle.sign({ name: "Ed25519" }, pair.privateKey, Buffer.from(input)));
  return `${input}.${b64url(sig)}`;
}

function memStore(): SecretStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    get: (k) => Promise.resolve(data[k]),
    store: (k, v) => { data[k] = v; return Promise.resolve(); },
    delete: (k) => { delete data[k]; return Promise.resolve(); }
  };
}

function service(over: Partial<ConstructorParameters<typeof LicenseService>[0]>, publicB64: string, fetchImpl: FetchLike, now: () => number) {
  return new LicenseService({
    secrets: memStore(),
    deviceId: "dev",
    baseUrl: "https://api",
    publicKeyB64: publicB64,
    fetchImpl,
    now,
    ...over
  });
}

test("isPro is false before any license is entered", async () => {
  const { publicB64 } = await keypair();
  const svc = service({}, publicB64, async () => ({ status: 500, json: async () => ({}) }), () => 1_000_000_000_000);
  await svc.init();
  assert.equal(svc.isPro(), false);
  assert.equal(svc.hasKey(), false);
});

test("enterLicense stores key+token and flips isPro on", async () => {
  const { pair, publicB64 } = await keypair();
  const nowSec = 1_700_000_000;
  const token = await mint(pair, nowSec);
  const fetchImpl: FetchLike = async () => ({ status: 200, json: async () => ({ ok: true, token, status: "active", plan: "monthly", deviceLimit: 3 }) });
  const svc = service({}, publicB64, fetchImpl, () => nowSec * 1000 + 1000);
  await svc.init();

  const res = await svc.enterLicense("ACA-K");
  assert.equal(res.ok, true);
  assert.equal(svc.isPro(), true);
  assert.equal(svc.hasKey(), true);
});

test("a token signed by a different key is rejected (isPro stays false)", async () => {
  const good = await keypair();
  const evil = await keypair();
  const nowSec = 1_700_000_000;
  const token = await mint(evil.pair, nowSec); // signed by the wrong key
  const fetchImpl: FetchLike = async () => ({ status: 200, json: async () => ({ ok: true, token, status: "active", plan: "monthly", deviceLimit: 3 }) });
  const svc = service({}, good.publicB64, fetchImpl, () => nowSec * 1000 + 1000);
  await svc.init();
  await svc.enterLicense("ACA-K");
  assert.equal(svc.isPro(), false);
});

test("removeLicense clears everything", async () => {
  const { pair, publicB64 } = await keypair();
  const nowSec = 1_700_000_000;
  const token = await mint(pair, nowSec);
  const fetchImpl: FetchLike = async () => ({ status: 200, json: async () => ({ ok: true, token, status: "active", plan: "monthly", deviceLimit: 3 }) });
  const svc = service({}, publicB64, fetchImpl, () => nowSec * 1000 + 1000);
  await svc.init();
  await svc.enterLicense("ACA-K");
  await svc.removeLicense();
  assert.equal(svc.isPro(), false);
  assert.equal(svc.hasKey(), false);
});

test("revalidateNow downgrades when the server reports the subscription inactive", async () => {
  const { pair, publicB64 } = await keypair();
  const nowSec = 1_700_000_000;
  const active = await mint(pair, nowSec, "active");
  let call = 0;
  const fetchImpl: FetchLike = async () => {
    call += 1;
    if (call === 1) return { status: 200, json: async () => ({ ok: true, token: active, status: "active", plan: "monthly", deviceLimit: 3 }) };
    return { status: 403, json: async () => ({ ok: false, error: "inactive" }) };
  };
  const svc = service({}, publicB64, fetchImpl, () => nowSec * 1000 + 1000);
  await svc.init();
  await svc.enterLicense("ACA-K");
  assert.equal(svc.isPro(), true);
  await svc.revalidateNow();
  assert.equal(svc.isPro(), false); // inactive result clears the cached token
});

test("requirePro calls the upsell and returns false when not pro", () => {
  const upsold: string[] = [];
  const ok = requirePro({ isPro: () => false }, "remoteActions", (f) => upsold.push(f));
  assert.equal(ok, false);
  assert.deepEqual(upsold, ["remoteActions"]);
});

test("requirePro returns true and does not upsell when pro", () => {
  const upsold: string[] = [];
  const ok = requirePro({ isPro: () => true }, "remoteActions", (f) => upsold.push(f));
  assert.equal(ok, true);
  assert.deepEqual(upsold, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test test/license/licenseService.test.ts`
Expected: FAIL — cannot find module `../../src/license/LicenseService`.

- [ ] **Step 3: Write the implementations**

Create `src/license/constants.ts`:

```ts
// Changeable at deployment (spec §10). LICENSE_PUBLIC_KEY_B64 is the base64 raw Ed25519
// public key printed by server/scripts/gen-keys.mjs — paste the PUBLIC value here.
export const LICENSE_BASE_URL = "https://aicodingalert.com";
export const LICENSE_PUBLIC_KEY_B64 = "REPLACE_WITH_ED25519_PUBLIC_KEY_BASE64";
export const PADDLE_CHECKOUT_URL = "https://aicodingalert.com/#pricing";
```

Create `src/license/LicenseService.ts`:

```ts
import { importPublicKey, verifyToken, type TokenPayload } from "./token";
import { evaluateLicense, type LicenseState } from "./state";
import { activateLicense, validateLicense, deactivateLicense, type ActivateResult, type FetchLike } from "./api";

/** Matches vscode.SecretStorage (get/store/delete). */
export interface SecretStore {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

export interface LicenseServiceDeps {
  secrets: SecretStore;
  deviceId: string;
  baseUrl: string;
  publicKeyB64: string;
  fetchImpl: FetchLike;
  now: () => number;
}

const KEY_SECRET = "aiCodingAlerts.licenseKey";
const TOKEN_SECRET = "aiCodingAlerts.licenseToken";

export class LicenseService {
  private publicKey: CryptoKey | null = null;
  private licenseKey: string | null = null;
  private verifiedPayload: TokenPayload | null = null; // only ever set when signature verified

  constructor(private readonly deps: LicenseServiceDeps) {}

  /** Load cached key+token and verify the token's signature once (async). */
  async init(): Promise<void> {
    this.publicKey = await importPublicKey(this.deps.publicKeyB64);
    this.licenseKey = (await this.deps.secrets.get(KEY_SECRET)) ?? null;
    const token = await this.deps.secrets.get(TOKEN_SECRET);
    this.verifiedPayload = token && this.publicKey ? await verifyToken(token, this.publicKey) : null;
  }

  hasKey(): boolean {
    return this.licenseKey !== null;
  }

  state(): LicenseState {
    return evaluateLicense(this.verifiedPayload, this.deps.now());
  }

  isPro(): boolean {
    return this.state().pro;
  }

  async enterLicense(key: string): Promise<ActivateResult> {
    const trimmed = key.trim();
    const result = await activateLicense(this.deps.baseUrl, trimmed, this.deps.deviceId, this.deps.fetchImpl);
    if (result.ok) {
      await this.storeSession(trimmed, result.token);
    }
    return result;
  }

  /** Re-check only when the cadence says so (startup + periodic). */
  async revalidateIfDue(): Promise<void> {
    if (this.licenseKey && this.state().shouldRevalidate) {
      await this.revalidateNow();
    }
  }

  async revalidateNow(): Promise<ActivateResult> {
    if (!this.licenseKey) return { ok: false, code: "not_found", message: "No license on this device." };
    const result = await validateLicense(this.deps.baseUrl, this.licenseKey, this.deps.deviceId, this.deps.fetchImpl);
    if (result.ok) {
      await this.storeSession(this.licenseKey, result.token);
    } else if (result.code === "inactive" || result.code === "not_found" || result.code === "not_activated") {
      // Definitive negative from the server -> stop honoring the cached token.
      this.verifiedPayload = null;
      await this.deps.secrets.delete(TOKEN_SECRET);
    }
    // network/server errors: keep the cached token (grace window applies).
    return result;
  }

  async deactivateThisDevice(): Promise<boolean> {
    if (!this.licenseKey) return true;
    const res = await deactivateLicense(this.deps.baseUrl, this.licenseKey, this.deps.deviceId, this.deps.fetchImpl);
    if (res.ok) await this.removeLicense();
    return res.ok;
  }

  async removeLicense(): Promise<void> {
    this.licenseKey = null;
    this.verifiedPayload = null;
    await this.deps.secrets.delete(KEY_SECRET);
    await this.deps.secrets.delete(TOKEN_SECRET);
  }

  private async storeSession(key: string, token: string): Promise<void> {
    this.licenseKey = key;
    this.verifiedPayload = this.publicKey ? await verifyToken(token, this.publicKey) : null;
    await this.deps.secrets.store(KEY_SECRET, key);
    await this.deps.secrets.store(TOKEN_SECRET, token);
  }
}
```

Create `src/license/requirePro.ts`:

```ts
/**
 * Gate for future premium features. If not Pro, trigger the upsell and return false.
 * Existing free features MUST NOT call this (spec §5).
 */
export function requirePro(
  service: { isPro(): boolean },
  feature: string,
  showUpsell: (feature: string) => void
): boolean {
  if (service.isPro()) return true;
  showUpsell(feature);
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/license/licenseService.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the whole extension suite + commit**

Run: `npm test`
Expected: PASS (all existing + new license tests; no free-feature test regressions).

```bash
git add src/license/constants.ts src/license/LicenseService.ts src/license/requirePro.ts test/license/licenseService.test.ts
git commit -m "feat(license): LicenseService orchestration + requirePro gate"
```

---

### Task 19: Wire into the extension host

**Files:**
- Modify: `src/extension.ts`
- Modify: `package.json` (add two commands)
- Create: `src/license/wire.ts` (the impure edge: builds `LicenseService` from `vscode` context + real `fetch`)

**Interfaces:**
- Consumes: everything in `src/license/`.
- Produces: `createLicenseService(context: vscode.ExtensionContext): LicenseService`, `registerLicenseCommands(context, service): void` (returns nothing; pushes disposables).

> This is the only task that touches `src/extension.ts`. It adds license wiring **alongside** the existing pipeline — no existing line is removed or changed except adding registrations to the `context.subscriptions.push(...)` call. Verify free features still work in the Extension Development Host.

- [ ] **Step 1: Add the commands to `package.json`**

In `package.json`, add to `contributes.commands` (after the existing `toggleMute` entry):

```json
      { "command": "aiCodingAlerts.enterLicense", "title": "AI Coding Alerts: Enter Pro License" },
      { "command": "aiCodingAlerts.manageLicense", "title": "AI Coding Alerts: Manage License" }
```

- [ ] **Step 2: Create the impure wiring edge**

Create `src/license/wire.ts`:

```ts
import * as vscode from "vscode";
import { LicenseService } from "./LicenseService";
import { getOrCreateDeviceId } from "./deviceId";
import { requirePro } from "./requirePro";
import { LICENSE_BASE_URL, LICENSE_PUBLIC_KEY_B64, PADDLE_CHECKOUT_URL } from "./constants";
import { RECHECK_MS } from "./state";
import type { FetchLike } from "./api";

/** Real network edge: adapt global fetch to FetchLike. */
const realFetch: FetchLike = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, json: () => res.json() };
};

export function createLicenseService(context: vscode.ExtensionContext): LicenseService {
  const deviceId = getOrCreateDeviceId(context.globalState);
  return new LicenseService({
    secrets: context.secrets,
    deviceId,
    baseUrl: LICENSE_BASE_URL,
    publicKeyB64: LICENSE_PUBLIC_KEY_B64,
    fetchImpl: realFetch,
    now: () => Date.now()
  });
}

function showUpsell(feature: string): void {
  void vscode.window
    .showInformationMessage(`“${feature}” is an AI Coding Alerts Pro feature.`, "Upgrade")
    .then((choice) => {
      if (choice === "Upgrade") void vscode.env.openExternal(vscode.Uri.parse(PADDLE_CHECKOUT_URL));
    });
}

export { requirePro, showUpsell };

export function registerLicenseCommands(context: vscode.ExtensionContext, service: LicenseService): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("aiCodingAlerts.enterLicense", async () => {
      const key = await vscode.window.showInputBox({
        prompt: "Paste your AI Coding Alerts Pro license key",
        placeHolder: "ACA-XXXXX-XXXXX-XXXXX-XXXXX",
        ignoreFocusOut: true
      });
      if (!key) return;
      const result = await service.enterLicense(key);
      if (result.ok) {
        void vscode.window.showInformationMessage("AI Coding Alerts Pro is now active on this device. Thank you!");
      } else {
        void vscode.window.showErrorMessage(`Activation failed: ${result.message}`);
      }
    }),
    vscode.commands.registerCommand("aiCodingAlerts.manageLicense", async () => {
      if (!service.hasKey()) {
        const choice = await vscode.window.showInformationMessage("No Pro license on this device.", "Enter License", "Get Pro");
        if (choice === "Enter License") void vscode.commands.executeCommand("aiCodingAlerts.enterLicense");
        else if (choice === "Get Pro") void vscode.env.openExternal(vscode.Uri.parse(PADDLE_CHECKOUT_URL));
        return;
      }
      const st = service.state();
      const label = st.pro ? (st.mode === "grace" ? "Active (offline grace)" : "Active") : "Inactive";
      const choice = await vscode.window.showInformationMessage(
        `AI Coding Alerts Pro — ${label}.`,
        "Re-check now",
        "Deactivate this device",
        "Remove license"
      );
      if (choice === "Re-check now") {
        const r = await service.revalidateNow();
        void vscode.window.showInformationMessage(r.ok ? "License re-checked." : `Re-check: ${r.message}`);
      } else if (choice === "Deactivate this device") {
        const ok = await service.deactivateThisDevice();
        void vscode.window.showInformationMessage(ok ? "This device was deactivated." : "Couldn't reach the server to deactivate.");
      } else if (choice === "Remove license") {
        await service.removeLicense();
        void vscode.window.showInformationMessage("License removed from this device.");
      }
    })
  );
}
```

- [ ] **Step 3: Wire into `activate()`**

In `src/extension.ts`, add imports near the top (after the existing imports):

```ts
import { createLicenseService, registerLicenseCommands } from "./license/wire";
```

Then, inside `activate(context)`, after the `muteStatus.show();` line and before the big `context.subscriptions.push(` call, add:

```ts
  const license = createLicenseService(context);
  void license.init().then(() => license.revalidateIfDue());
  registerLicenseCommands(context, license);
  const licenseRecheck = setInterval(() => void license.revalidateIfDue(), 6 * 60 * 60 * 1000);
```

And add this disposable to the existing `context.subscriptions.push(...)` list (append as a new argument alongside the existing `{ dispose: () => void server.stop() }`):

```ts
    { dispose: () => clearInterval(licenseRecheck) },
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: esbuild succeeds, no TypeScript errors.

Run: `npm test`
Expected: PASS — all existing free-feature tests plus the license suite. Confirms nothing in the alert pipeline regressed.

- [ ] **Step 5: Manual verification in the Extension Development Host**

- Press F5 to launch the Extension Development Host.
- Confirm **free features still work**: send a test alert (`AI Coding Alerts: Send Test Alert`), open History and Dashboard, toggle mute. All must behave exactly as before.
- Run `AI Coding Alerts: Manage License` → expect "No Pro license on this device."
- Run `AI Coding Alerts: Enter Pro License` with a bad key → expect a clear "License key not found" style error (against a deployed sandbox Worker) or a network error (if no Worker deployed yet).

- [ ] **Step 6: Commit**

```bash
git add src/extension.ts src/license/wire.ts package.json
git commit -m "feat(license): wire Pro license commands into the extension host"
```

---

## Post-implementation (human, outside code)

These are §9 prerequisites + deployment, done once the code is green:

1. **Generate the real keypair:** `cd server && node scripts/gen-keys.mjs`. Put PRIVATE into the Worker (`wrangler secret put LICENSE_SIGNING_PRIVATE_KEY`); put PUBLIC into `src/license/constants.ts` `LICENSE_PUBLIC_KEY_B64`.
2. **Create the D1 database:** `wrangler d1 create ai-coding-alerts` → paste the id into `server/wrangler.toml` → `npm run db:apply:remote`.
3. **Paddle (sandbox):** create product + monthly ($3.89) / yearly ($36) prices; set the webhook to `POST https://<worker-host>/webhooks/paddle`; `wrangler secret put PADDLE_WEBHOOK_SECRET`.
4. **Deploy:** `cd server && npm run deploy`. If not using a custom domain yet, set `LICENSE_BASE_URL` to the `workers.dev` URL and the Paddle checkout success URL to `https://<worker-host>/license?txn={transaction_id}` (confirm Paddle's success-URL token syntax).
5. **End-to-end sandbox test:** run a sandbox checkout → success page shows the key → paste into the extension → `isPro()` true → cancel the sub in Paddle → next re-check downgrades after grace.
6. **Email (later):** register/verify a domain on Cloudflare, add the `send_email` binding, swap `noopDeliverer` → `CloudflareEmailDeliverer` in `server/src/index.ts`.

---

## Self-Review

**Spec coverage:**
- §4.1 endpoints — webhook (T8), success page (T12), activate (T9), validate (T10), deactivate (T11), router (T13). ✓
- §4.2 schema (+ txn column) — T1. ✓
- §4.3 key generation — T6. ✓
- §4.4 signed token (Ed25519, hashed sub, 7d exp) — T3 (sign), T15 (verify). ✓
- §4.5 webhook events (created/activated/updated/canceled/past_due + transaction.completed) — T5, T8. ✓
- §4.6 secrets — T13 (Env + key import), post-impl steps. ✓
- §4.7 KeyDeliverer seam (noop default + CloudflareEmailDeliverer tested, unwired) — T6, wired-as-noop in T13. ✓
- §5 extension module (deviceId, SecretStorage, isPro, activation, re-check + grace, commands, requirePro, baked constants) — T14–T19. ✓
- §6 error handling (offline/bad key/device limit/canceled/backend down) — T17 (code mapping), T18 (grace vs definitive downgrade), T19 (UX). ✓
- §7 testing (both stacks, injected clock + fake network, no vscode in pure modules) — throughout. ✓
- §8 out of scope — respected (email no-op, no accounts/trials/refund UI). ✓
- §10 locked values (price/limit/TTL/grace/host/From) — encoded as constants + post-impl steps; device limit via `resolvePlanDeviceLimit`. ✓
- **Free features untouched** — only T19 touches `src/extension.ts`, additively; verified in T19 Step 5. ✓

**Placeholder scan:** No "TODO/TBD/handle edge cases" — every step has concrete code + commands. Two intentional REPLACE_ values (`LICENSE_PUBLIC_KEY_B64`, test signing key in vitest config) are documented and filled by the gen-keys script. ✓

**Type consistency:** `TokenPayload` fields identical across server `lib/jwt.ts` and extension `token.ts`; `LicenseDeps` shared by activate/validate/deactivate; `FetchLike`/`ActivateResult` shared across api + LicenseService; `SecretStore`/`KeyValueStore` are subsets of the real `vscode.SecretStorage`/`Memento`; `resolvePlanDeviceLimit` name consistent (T5, T8). ✓

**Note for the executor:** Paddle event field paths (§4.5) and the signature scheme (§4.4) are coded against the documented Paddle Billing shape but **must be verified against live docs** — Task 4 and Task 5 call this out explicitly.
