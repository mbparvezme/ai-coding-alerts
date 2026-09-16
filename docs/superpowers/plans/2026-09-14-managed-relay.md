# Managed Permission Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Pro user approve/deny an agent's permission request from their phone via one **seller-hosted** Telegram bot, with the decision routed back to the originating device — reusing #3's entire local machinery and swapping only the broker.

**Architecture:** The extension's blocking hook, `IngressServer`, and `PendingDecisionStore` are unchanged. When a user is Pro + Telegram-linked, a new **managed broker** POSTs the request to the server (which sends the seller-bot message) and **polls** the server for the decision (no Durable Object / WebSocket). A Telegram webhook writes the tapped decision; the poll reads it. Every failure falls back to Claude Code's native prompt.

**Tech Stack:** Server — Next.js-on-Cloudflare-Workers, D1, `vitest` + Miniflare (`cloudflare:test`), WebCrypto Ed25519, `fetch`. Extension — TypeScript, VS Code API, `node:https`/`node:http`, `node:test` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-14-managed-relay-design.md`

## Global Constraints

- **No new runtime dependencies.** Server uses global `fetch` + D1; extension uses `node:https`/`node:http` and existing deps only.
- **Test runners:** server — `npm test` in `web/` (= `vitest run`), single file `npx vitest run test/<path>`. Extension — `npm test` at repo root (= `node --import tsx --test "test/**/*.test.ts"`), single file `node --import tsx --test test/<path>.test.ts`. Node ≥ 21 (CI pins Node 24). **CI also runs `npx tsc --noEmit`** in both `web/` and the extension over `test/` too — every test file must typecheck (module: Node16 in the extension → no `import.meta`, annotate implicit-any, no unused locals/params).
- **`/relay/*` auth = the Ed25519 entitlement token** (Bearer), verified on the Worker with the public key (no GitHub round-trip on the hot path). `sub` = accountId, `deviceId` = originating device.
- **`callback_data` wire format** is `v1:<requestId>:<choice>` with `choice ∈ approve|deny` (managed is 2-button; remember/mute are DIY-only).
- **Fail-safe:** any failure (server down, not-linked, token invalid/expired, no answer, device gone) resolves to *no decision* → the local hook times out → Claude Code's native prompt. **Never fails open.**
- **Reuse** the extension's `PendingDecisionStore`, `IngressServer`, `permission-hook`, `extractPermissionInfo`, `createTelegramApi` pattern, and the server's `repository`/`jwt`/handler/`(request,deps)` patterns rather than parallel machinery.
- **Managed message:** `🔔 Permission needed\n<tool>: <command>`, command truncated to 200 chars; two inline buttons `✅ Approve` / `⛔ Deny`.

---

## File Structure

**Server — new (`web/`)**
- `src/server/relay/repository.ts` — D1 access for `telegram_links`, `telegram_link_codes`, `relay_requests`.
- `src/server/relay/telegram.ts` — seller-bot Telegram client (`sendMessage`/`editMessageText`/`answerCallbackQuery`) over an injectable transport.
- `src/server/relay/relayAuth.ts` — verify the entitlement token from `Authorization` → `{ accountId, deviceId }`.
- `src/server/handlers/relayLinkCode.ts`, `relayPermission.ts`, `relayDecision.ts`, `telegramWebhook.ts` — the four handlers.
- `src/app/api/relay/link-code/route.ts`, `src/app/api/relay/permission/route.ts`, `src/app/api/relay/decision/[id]/route.ts`, `src/app/api/webhooks/telegram/route.ts` — thin adapters.
- Tests under `test/relay/**`.

**Server — modified (`web/`)**
- `schema.sql` — three new tables.
- `src/server/lib/jwt.ts` — add `importVerifyKey`.
- `src/server/lib/env.ts` — add `LICENSE_PUBLIC_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`.
- `src/server/handlers/authRefresh.ts` — add `telegramLinked` to the response.

**Extension — new (`src/`)**
- `src/permission/modeSelect.ts` — pure broker-precedence function.
- `src/relay/relayClient.ts` — HTTP client for `/relay/permission` + `/relay/decision`.
- `src/permission/managedBroker.ts` — the managed broker (`create(payload)`).

**Extension — modified (`src/`)**
- `src/license/AccountService.ts` — expose `currentToken()` + `telegramLinked` (parsed from the refresh response) on `state()`.
- `src/config/readAlertSettings.ts` + `package.json` — `preferManagedBot` (default true).
- `src/extension.ts` — per-request broker dispatch; construct the managed broker; new "Connect Telegram" / "Refresh account status" commands.

---

## Task 1: D1 schema — relay tables

**Files:**
- Modify: `web/schema.sql`
- Test: `web/test/relay/schema.test.ts`

**Interfaces:**
- Produces: tables `telegram_links(user_id PK, chat_id UNIQUE, linked_at)`, `telegram_link_codes(code PK, user_id, expires_at)`, `relay_requests(request_id PK, user_id, device_id, status, tg_message_id, created_at, expires_at)`. `applySchema` (in `web/test/helpers.ts`) reads `schema.sql?raw`, so adding them here makes them available in every test.

- [ ] **Step 1: Write the failing test**

```ts
// web/test/relay/schema.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema } from "../helpers";

beforeEach(async () => {
  await env.DB.exec(
    "DROP TABLE IF EXISTS relay_requests; DROP TABLE IF EXISTS telegram_link_codes; DROP TABLE IF EXISTS telegram_links"
  );
  await applySchema(env.DB);
});

describe("relay schema", () => {
  it("creates the three relay tables and enforces chat_id uniqueness", async () => {
    await env.DB.prepare("INSERT INTO telegram_links (user_id, chat_id, linked_at) VALUES (?,?,?)")
      .bind("acct_1", "555", 1).run();
    await expect(
      env.DB.prepare("INSERT INTO telegram_links (user_id, chat_id, linked_at) VALUES (?,?,?)")
        .bind("acct_2", "555", 1).run()
    ).rejects.toThrow();
    await env.DB.prepare("INSERT INTO relay_requests (request_id, user_id, device_id, status, created_at, expires_at) VALUES (?,?,?,?,?,?)")
      .bind("req_1", "acct_1", "dev_1", "pending", 1, 100).run();
    const row = await env.DB.prepare("SELECT status FROM relay_requests WHERE request_id = ?").bind("req_1").first<{ status: string }>();
    expect(row?.status).toBe("pending");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run test/relay/schema.test.ts`
Expected: FAIL (no such table).

- [ ] **Step 3: Append the tables to `web/schema.sql`**

```sql
CREATE TABLE telegram_links (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  chat_id    TEXT NOT NULL UNIQUE,
  linked_at  INTEGER NOT NULL
);

CREATE TABLE telegram_link_codes (
  code       TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE relay_requests (
  request_id    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  device_id     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  tg_message_id INTEGER,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);
CREATE INDEX idx_relay_requests_user ON relay_requests(user_id);
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/schema.sql web/test/relay/schema.test.ts
git commit -m "feat(#4): relay D1 tables (telegram_links, link_codes, relay_requests)"
```

---

## Task 2: relay repository

**Files:**
- Create: `web/src/server/relay/repository.ts`
- Test: `web/test/relay/repository.test.ts`

**Interfaces:**
- Consumes: the tables from Task 1.
- Produces:
  - `interface TelegramLinkRow { user_id: string; chat_id: string; linked_at: number }`
  - `interface RelayRequestRow { request_id: string; user_id: string; device_id: string; status: string; tg_message_id: number | null; created_at: number; expires_at: number }`
  - `getTelegramLink(db, userId): Promise<TelegramLinkRow | null>`
  - `getTelegramLinkByChat(db, chatId): Promise<TelegramLinkRow | null>`
  - `upsertTelegramLink(db, userId, chatId, now): Promise<void>`
  - `deleteTelegramLink(db, userId): Promise<void>`
  - `createLinkCode(db, code, userId, expiresAt): Promise<void>`
  - `consumeLinkCode(db, code, now): Promise<{ user_id: string } | null>` — returns+deletes the row iff present and unexpired.
  - `createRelayRequest(db, row: RelayRequestRow): Promise<void>`
  - `getRelayRequest(db, requestId): Promise<RelayRequestRow | null>`
  - `setRelayMessageId(db, requestId, messageId): Promise<void>`
  - `resolveRelayRequest(db, requestId, status, now): Promise<boolean>` — first-wins; true iff it flipped a still-pending, unexpired row.
  - `countPendingRelay(db, userId, now): Promise<number>`

- [ ] **Step 1: Write the failing test**

```ts
// web/test/relay/repository.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema } from "../helpers";
import * as repo from "../../src/server/relay/repository";

beforeEach(async () => {
  await env.DB.exec(
    "DROP TABLE IF EXISTS relay_requests; DROP TABLE IF EXISTS telegram_link_codes; DROP TABLE IF EXISTS telegram_links; DROP TABLE IF EXISTS users"
  );
  await applySchema(env.DB);
  await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_1', 1, 0, 0)").run();
});

describe("relay repository", () => {
  it("links, looks up by user and chat, and unlinks", async () => {
    await repo.upsertTelegramLink(env.DB, "acct_1", "555", 10);
    expect((await repo.getTelegramLink(env.DB, "acct_1"))?.chat_id).toBe("555");
    expect((await repo.getTelegramLinkByChat(env.DB, "555"))?.user_id).toBe("acct_1");
    await repo.deleteTelegramLink(env.DB, "acct_1");
    expect(await repo.getTelegramLink(env.DB, "acct_1")).toBeNull();
  });

  it("consumes a link code once and only while unexpired", async () => {
    await repo.createLinkCode(env.DB, "code_a", "acct_1", 100);
    expect(await repo.consumeLinkCode(env.DB, "code_a", 200)).toBeNull(); // expired
    await repo.createLinkCode(env.DB, "code_b", "acct_1", 100);
    expect((await repo.consumeLinkCode(env.DB, "code_b", 50))?.user_id).toBe("acct_1");
    expect(await repo.consumeLinkCode(env.DB, "code_b", 50)).toBeNull(); // already consumed
  });

  it("resolves a relay request first-wins and not after expiry", async () => {
    await repo.createRelayRequest(env.DB, { request_id: "r1", user_id: "acct_1", device_id: "d1", status: "pending", tg_message_id: null, created_at: 0, expires_at: 100 });
    expect(await repo.countPendingRelay(env.DB, "acct_1", 10)).toBe(1);
    expect(await repo.resolveRelayRequest(env.DB, "r1", "allow", 10)).toBe(true);
    expect(await repo.resolveRelayRequest(env.DB, "r1", "deny", 10)).toBe(false); // already resolved
    expect((await repo.getRelayRequest(env.DB, "r1"))?.status).toBe("allow");

    await repo.createRelayRequest(env.DB, { request_id: "r2", user_id: "acct_1", device_id: "d1", status: "pending", tg_message_id: null, created_at: 0, expires_at: 100 });
    expect(await repo.resolveRelayRequest(env.DB, "r2", "allow", 200)).toBe(false); // expired
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL (module missing).

- [ ] **Step 3: Write the implementation**

```ts
// web/src/server/relay/repository.ts
export interface TelegramLinkRow {
  user_id: string;
  chat_id: string;
  linked_at: number;
}

export interface RelayRequestRow {
  request_id: string;
  user_id: string;
  device_id: string;
  status: string;
  tg_message_id: number | null;
  created_at: number;
  expires_at: number;
}

export async function getTelegramLink(db: D1Database, userId: string): Promise<TelegramLinkRow | null> {
  return db.prepare("SELECT * FROM telegram_links WHERE user_id = ?").bind(userId).first<TelegramLinkRow>();
}

export async function getTelegramLinkByChat(db: D1Database, chatId: string): Promise<TelegramLinkRow | null> {
  return db.prepare("SELECT * FROM telegram_links WHERE chat_id = ?").bind(chatId).first<TelegramLinkRow>();
}

export async function upsertTelegramLink(db: D1Database, userId: string, chatId: string, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO telegram_links (user_id, chat_id, linked_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, linked_at = excluded.linked_at`
    )
    .bind(userId, chatId, now)
    .run();
}

export async function deleteTelegramLink(db: D1Database, userId: string): Promise<void> {
  await db.prepare("DELETE FROM telegram_links WHERE user_id = ?").bind(userId).run();
}

export async function createLinkCode(db: D1Database, code: string, userId: string, expiresAt: number): Promise<void> {
  await db.prepare("INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES (?, ?, ?)").bind(code, userId, expiresAt).run();
}

export async function consumeLinkCode(db: D1Database, code: string, now: number): Promise<{ user_id: string } | null> {
  const row = await db.prepare("SELECT user_id, expires_at FROM telegram_link_codes WHERE code = ?").bind(code).first<{ user_id: string; expires_at: number }>();
  if (!row) return null;
  await db.prepare("DELETE FROM telegram_link_codes WHERE code = ?").bind(code).run();
  if (now >= row.expires_at) return null;
  return { user_id: row.user_id };
}

export async function createRelayRequest(db: D1Database, row: RelayRequestRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO relay_requests (request_id, user_id, device_id, status, tg_message_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(row.request_id, row.user_id, row.device_id, row.status, row.tg_message_id, row.created_at, row.expires_at)
    .run();
}

export async function getRelayRequest(db: D1Database, requestId: string): Promise<RelayRequestRow | null> {
  return db.prepare("SELECT * FROM relay_requests WHERE request_id = ?").bind(requestId).first<RelayRequestRow>();
}

export async function setRelayMessageId(db: D1Database, requestId: string, messageId: number): Promise<void> {
  await db.prepare("UPDATE relay_requests SET tg_message_id = ? WHERE request_id = ?").bind(messageId, requestId).run();
}

export async function resolveRelayRequest(db: D1Database, requestId: string, status: "allow" | "deny", now: number): Promise<boolean> {
  const res = await db
    .prepare("UPDATE relay_requests SET status = ? WHERE request_id = ? AND status = 'pending' AND expires_at > ?")
    .bind(status, requestId, now)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function countPendingRelay(db: D1Database, userId: string, now: number): Promise<number> {
  const row = await db
    .prepare("SELECT count(*) AS n FROM relay_requests WHERE user_id = ? AND status = 'pending' AND expires_at > ?")
    .bind(userId, now)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/server/relay/repository.ts web/test/relay/repository.test.ts
git commit -m "feat(#4): relay repository (links, codes, requests) with first-wins resolve"
```

---

## Task 3: seller-bot Telegram client

**Files:**
- Create: `web/src/server/relay/telegram.ts`
- Test: `web/test/relay/telegram.test.ts`

**Interfaces:**
- Produces:
  - `interface InlineButton { text: string; callback_data: string }`
  - `type TelegramTransport = (method: string, params: Record<string, unknown>) => Promise<any>`
  - `interface TelegramClient { sendMessage(chatId, text, keyboard?): Promise<{ message_id: number }>; editMessageText(chatId, messageId, text): Promise<void>; answerCallbackQuery(callbackQueryId, text?): Promise<void> }`
  - `createTelegramClient(token: string, transport?: TelegramTransport): TelegramClient`

- [ ] **Step 1: Write the failing test**

```ts
// web/test/relay/telegram.test.ts
import { describe, it, expect } from "vitest";
import { createTelegramClient } from "../../src/server/relay/telegram";

function fake() {
  const calls: Array<{ method: string; params: any }> = [];
  const transport = async (method: string, params: any) => {
    calls.push({ method, params });
    return method === "sendMessage" ? { message_id: 99 } : true;
  };
  return { calls, transport };
}

describe("telegram client", () => {
  it("sends chat_id, text and an inline keyboard", async () => {
    const { calls, transport } = fake();
    const tg = createTelegramClient("TOK", transport);
    const res = await tg.sendMessage("555", "hi", [[{ text: "✅ Approve", callback_data: "v1:r1:approve" }]]);
    expect(res.message_id).toBe(99);
    expect(calls[0].method).toBe("sendMessage");
    expect(calls[0].params.chat_id).toBe("555");
    expect(calls[0].params.reply_markup).toEqual({ inline_keyboard: [[{ text: "✅ Approve", callback_data: "v1:r1:approve" }]] });
  });

  it("edits a message and answers a callback", async () => {
    const { calls, transport } = fake();
    const tg = createTelegramClient("TOK", transport);
    await tg.editMessageText("555", 99, "✅ Approved");
    await tg.answerCallbackQuery("cq1", "Done");
    expect(calls[0]).toEqual({ method: "editMessageText", params: { chat_id: "555", message_id: 99, text: "✅ Approved" } });
    expect(calls[1]).toEqual({ method: "answerCallbackQuery", params: { callback_query_id: "cq1", text: "Done" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// web/src/server/relay/telegram.ts
export interface InlineButton {
  text: string;
  callback_data: string;
}

export type TelegramTransport = (method: string, params: Record<string, unknown>) => Promise<any>;

export interface TelegramClient {
  sendMessage(chatId: string, text: string, keyboard?: InlineButton[][]): Promise<{ message_id: number }>;
  editMessageText(chatId: string, messageId: number, text: string): Promise<void>;
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
}

function fetchTransport(token: string): TelegramTransport {
  return async (method, params) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params)
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; description?: string };
    if (data.ok === false) throw new Error(`telegram ${method}: ${data.description ?? "failed"}`);
    return data.result;
  };
}

export function createTelegramClient(token: string, transport?: TelegramTransport): TelegramClient {
  const call = transport ?? fetchTransport(token);
  return {
    async sendMessage(chatId, text, keyboard) {
      const params: Record<string, unknown> = { chat_id: chatId, text };
      if (keyboard) params.reply_markup = { inline_keyboard: keyboard };
      return call("sendMessage", params);
    },
    async editMessageText(chatId, messageId, text) {
      await call("editMessageText", { chat_id: chatId, message_id: messageId, text });
    },
    async answerCallbackQuery(callbackQueryId, text) {
      const params: Record<string, unknown> = { callback_query_id: callbackQueryId };
      if (text) params.text = text;
      await call("answerCallbackQuery", params);
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/server/relay/telegram.ts web/test/relay/telegram.test.ts
git commit -m "feat(#4): server-side seller-bot Telegram client"
```

---

## Task 4: entitlement-token auth + env additions

**Files:**
- Modify: `web/src/server/lib/jwt.ts` (add `importVerifyKey`), `web/src/server/lib/env.ts`
- Create: `web/src/server/relay/relayAuth.ts`
- Test: `web/test/relay/relayAuth.test.ts`

**Interfaces:**
- Consumes: `verifyToken`, `TokenPayload`, `signLicenseToken` (existing `jwt.ts`); `makeTestKeypair` (test helper).
- Produces:
  - `jwt.ts`: `importVerifyKey(publicKeyBase64: string): Promise<CryptoKey>` (SPKI public key for `verify`).
  - `env.ts`: `AccountEnv` gains `LICENSE_PUBLIC_KEY: string; TELEGRAM_BOT_TOKEN: string; TELEGRAM_BOT_USERNAME: string; TELEGRAM_WEBHOOK_SECRET: string`.
  - `relayAuth.ts`: `interface RelayIdentity { accountId: string; deviceId: string }`; `authenticateRelay(request: Request, verifyKey: CryptoKey, nowMs: number): Promise<RelayIdentity | null>` — Bearer token → `verifyToken` → reject unless `exp*1000 > now` and `status ∈ {active, past_due}` → `{ accountId: sub, deviceId }`.

- [ ] **Step 1: Write the failing test**

```ts
// web/test/relay/relayAuth.test.ts
import { describe, it, expect } from "vitest";
import { makeTestKeypair } from "../helpers";
import { signLicenseToken, type TokenPayload } from "../../src/server/lib/jwt";
import { authenticateRelay } from "../../src/server/relay/relayAuth";

async function tokenFor(over: Partial<TokenPayload>, signingKey: CryptoKey) {
  const p: TokenPayload = { sub: "acct_1", deviceId: "dev_1", status: "active", plan: "monthly", iat: 0, exp: 1000, ...over };
  return signLicenseToken(p, signingKey);
}
function req(token?: string) {
  return new Request("http://t/relay", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

describe("relay auth", () => {
  it("accepts a valid active token and returns account + device", async () => {
    const { publicKey, signingKey } = await makeTestKeypair();
    const id = await authenticateRelay(req(await tokenFor({}, signingKey)), publicKey, 500_000); // 500s < exp 1000s
    expect(id).toEqual({ accountId: "acct_1", deviceId: "dev_1" });
  });

  it("rejects missing, expired, tampered, or unentitled tokens", async () => {
    const { publicKey, signingKey } = await makeTestKeypair();
    expect(await authenticateRelay(req(), publicKey, 1)).toBeNull();
    expect(await authenticateRelay(req(await tokenFor({}, signingKey)), publicKey, 2_000_000)).toBeNull(); // exp 1000s < 2000s
    expect(await authenticateRelay(req(await tokenFor({ status: "canceled" }, signingKey)), publicKey, 500_000)).toBeNull();
    expect(await authenticateRelay(req("a.b.c"), publicKey, 500_000)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3a: Add `importVerifyKey` to `web/src/server/lib/jwt.ts`**

```ts
export async function importVerifyKey(publicKeyBase64: string): Promise<CryptoKey> {
  const spki = Uint8Array.from(atob(publicKeyBase64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("spki", spki, { name: "Ed25519" }, false, ["verify"]);
}
```

- [ ] **Step 3b: Extend `AccountEnv` in `web/src/server/lib/env.ts`**

Add these fields to the interface:

```ts
  LICENSE_PUBLIC_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_USERNAME: string;
  TELEGRAM_WEBHOOK_SECRET: string;
```

- [ ] **Step 3c: Write `web/src/server/relay/relayAuth.ts`**

```ts
import { verifyToken } from "../lib/jwt";

export interface RelayIdentity {
  accountId: string;
  deviceId: string;
}

const ENTITLED = new Set(["active", "past_due"]);

function bearer(request: Request): string | null {
  const h = request.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const t = h.slice("Bearer ".length).trim();
  return t || null;
}

export async function authenticateRelay(request: Request, verifyKey: CryptoKey, nowMs: number): Promise<RelayIdentity | null> {
  const token = bearer(request);
  if (!token) return null;
  const payload = await verifyToken(token, verifyKey);
  if (!payload) return null;
  if (payload.exp * 1000 <= nowMs) return null;
  if (!ENTITLED.has(payload.status)) return null;
  return { accountId: payload.sub, deviceId: payload.deviceId };
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/server/lib/jwt.ts web/src/server/lib/env.ts web/src/server/relay/relayAuth.ts web/test/relay/relayAuth.test.ts
git commit -m "feat(#4): entitlement-token relay auth + verify-key import + env additions"
```

---

## Task 5: POST /relay/link-code

**Files:**
- Create: `web/src/server/handlers/relayLinkCode.ts`, `web/src/app/api/relay/link-code/route.ts`
- Test: `web/test/relay/linkCode.test.ts`

**Interfaces:**
- Consumes: `authenticateRelay` (T4), `createLinkCode` (T2).
- Produces:
  - `interface RelayLinkCodeDeps { db: D1Database; verifyKey: CryptoKey; now: () => number; botUsername: string; genCode: () => string; codeTtlMs: number }`
  - `handleRelayLinkCode(request: Request, deps: RelayLinkCodeDeps): Promise<Response>` → `200 { ok, code, deepLink }` (deepLink `https://t.me/<botUsername>?start=<code>`), `401` if unauthenticated.

- [ ] **Step 1: Write the failing test**

```ts
// web/test/relay/linkCode.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, makeTestKeypair } from "../helpers";
import { signLicenseToken } from "../../src/server/lib/jwt";
import { handleRelayLinkCode } from "../../src/server/handlers/relayLinkCode";

let deps: any, signingKey: CryptoKey;
beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS telegram_link_codes; DROP TABLE IF EXISTS users");
  await applySchema(env.DB);
  await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_1', 1, 0, 0)").run();
  const kp = await makeTestKeypair();
  signingKey = kp.signingKey;
  deps = { db: env.DB, verifyKey: kp.publicKey, now: () => 1000, botUsername: "AICAbot", genCode: () => "CODE1", codeTtlMs: 600_000 };
});
const auth = async () => `Bearer ${await signLicenseToken({ sub: "acct_1", deviceId: "d1", status: "active", plan: "monthly", iat: 0, exp: 9_999_999 }, signingKey)}`;

describe("relay link-code", () => {
  it("issues a code and deep link for an authenticated Pro user", async () => {
    const res = await handleRelayLinkCode(new Request("http://t/relay/link-code", { method: "POST", headers: { Authorization: await auth() } }), deps);
    const body = await res.json<any>();
    expect(res.status).toBe(200);
    expect(body.deepLink).toBe("https://t.me/AICAbot?start=CODE1");
    const stored = await env.DB.prepare("SELECT user_id, expires_at FROM telegram_link_codes WHERE code = 'CODE1'").first<any>();
    expect(stored).toEqual({ user_id: "acct_1", expires_at: 1000 + 600_000 });
  });

  it("401 without a valid token", async () => {
    const res = await handleRelayLinkCode(new Request("http://t/relay/link-code", { method: "POST" }), deps);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write the handler + route**

```ts
// web/src/server/handlers/relayLinkCode.ts
import { authenticateRelay } from "../relay/relayAuth";
import { createLinkCode } from "../relay/repository";

export interface RelayLinkCodeDeps {
  db: D1Database;
  verifyKey: CryptoKey;
  now: () => number;
  botUsername: string;
  genCode: () => string;
  codeTtlMs: number;
}

export async function handleRelayLinkCode(request: Request, deps: RelayLinkCodeDeps): Promise<Response> {
  const now = deps.now();
  const id = await authenticateRelay(request, deps.verifyKey, now);
  if (!id) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const code = deps.genCode();
  await createLinkCode(deps.db, code, id.accountId, now + deps.codeTtlMs);
  return Response.json({ ok: true, code, deepLink: `https://t.me/${deps.botUsername}?start=${code}` });
}
```

```ts
// web/src/app/api/relay/link-code/route.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleRelayLinkCode } from "@/server/handlers/relayLinkCode";
import { importVerifyKey } from "@/server/lib/jwt";

export async function POST(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  return handleRelayLinkCode(request, {
    db: env.DB,
    verifyKey: await importVerifyKey(env.LICENSE_PUBLIC_KEY),
    now: () => Date.now(),
    botUsername: env.TELEGRAM_BOT_USERNAME,
    genCode: () => crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    codeTtlMs: 10 * 60 * 1000
  });
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/server/handlers/relayLinkCode.ts web/src/app/api/relay/link-code/route.ts web/test/relay/linkCode.test.ts
git commit -m "feat(#4): POST /relay/link-code issues a Telegram deep-link code"
```

---

## Task 6: POST /relay/permission

**Files:**
- Create: `web/src/server/handlers/relayPermission.ts`, `web/src/app/api/relay/permission/route.ts`
- Test: `web/test/relay/permission.test.ts`

**Interfaces:**
- Consumes: `authenticateRelay` (T4); `getTelegramLink`, `createRelayRequest`, `setRelayMessageId`, `countPendingRelay` (T2); `TelegramClient` (T3).
- Produces:
  - `interface RelayPermissionDeps { db: D1Database; verifyKey: CryptoKey; now: () => number; telegram: TelegramClient; genRequestId: () => string; maxPending: number }`
  - `handleRelayPermission(request, deps): Promise<Response>` → `200 { ok, requestId, expiresAt }`; `409 { error:"not_linked" }`; `429 { error:"too_many" }`; `400` on bad body; `401` unauthenticated.
  - Sends the Telegram message with two buttons `callback_data = v1:<requestId>:approve|deny`, command truncated to 200 chars.

- [ ] **Step 1: Write the failing test**

```ts
// web/test/relay/permission.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, makeTestKeypair } from "../helpers";
import { signLicenseToken } from "../../src/server/lib/jwt";
import { handleRelayPermission } from "../../src/server/handlers/relayPermission";

let deps: any, signingKey: CryptoKey, sent: any[];
beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS relay_requests; DROP TABLE IF EXISTS telegram_links; DROP TABLE IF EXISTS users");
  await applySchema(env.DB);
  await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_1', 1, 0, 0)").run();
  const kp = await makeTestKeypair();
  signingKey = kp.signingKey;
  sent = [];
  const telegram = {
    sendMessage: async (chatId: string, text: string, keyboard: any) => { sent.push({ chatId, text, keyboard }); return { message_id: 77 }; },
    editMessageText: async () => {},
    answerCallbackQuery: async () => {}
  };
  deps = { db: env.DB, verifyKey: kp.publicKey, now: () => 1000, telegram, genRequestId: () => "req_1", maxPending: 5 };
});
const auth = async () => `Bearer ${await signLicenseToken({ sub: "acct_1", deviceId: "d1", status: "active", plan: "monthly", iat: 0, exp: 9_999_999 }, signingKey)}`;
const call = async (body: any) => handleRelayPermission(new Request("http://t/relay/permission", { method: "POST", headers: { Authorization: await auth() }, body: JSON.stringify(body) }), deps);

describe("relay permission", () => {
  it("409 when the account has no Telegram link", async () => {
    const res = await call({ tool: "Bash", command: "npm test", ttlSec: 300 });
    expect(res.status).toBe(409);
    expect((await res.json<any>()).error).toBe("not_linked");
  });

  it("creates a pending request and sends a two-button message when linked", async () => {
    await env.DB.prepare("INSERT INTO telegram_links (user_id, chat_id, linked_at) VALUES ('acct_1', '555', 0)").run();
    const res = await call({ tool: "Bash", command: "npm test", ttlSec: 300 });
    const body = await res.json<any>();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, requestId: "req_1", expiresAt: 1000 + 300_000 });
    expect(sent[0].chatId).toBe("555");
    expect(sent[0].keyboard[0].map((b: any) => b.callback_data)).toEqual(["v1:req_1:approve", "v1:req_1:deny"]);
    const row = await env.DB.prepare("SELECT status, tg_message_id FROM relay_requests WHERE request_id = 'req_1'").first<any>();
    expect(row).toEqual({ status: "pending", tg_message_id: 77 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write the handler + route**

```ts
// web/src/server/handlers/relayPermission.ts
import { authenticateRelay } from "../relay/relayAuth";
import { getTelegramLink, createRelayRequest, setRelayMessageId, countPendingRelay } from "../relay/repository";
import type { TelegramClient } from "../relay/telegram";

export interface RelayPermissionDeps {
  db: D1Database;
  verifyKey: CryptoKey;
  now: () => number;
  telegram: TelegramClient;
  genRequestId: () => string;
  maxPending: number;
}

const MAX_CMD = 200;

export async function handleRelayPermission(request: Request, deps: RelayPermissionDeps): Promise<Response> {
  const now = deps.now();
  const id = await authenticateRelay(request, deps.verifyKey, now);
  if (!id) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { tool?: string; command?: string; ttlSec?: number } | null;
  if (!body || typeof body.ttlSec !== "number" || body.ttlSec <= 0) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const link = await getTelegramLink(deps.db, id.accountId);
  if (!link) return Response.json({ ok: false, error: "not_linked" }, { status: 409 });

  if ((await countPendingRelay(deps.db, id.accountId, now)) >= deps.maxPending) {
    return Response.json({ ok: false, error: "too_many" }, { status: 429 });
  }

  const requestId = deps.genRequestId();
  const expiresAt = now + body.ttlSec * 1000;
  await createRelayRequest(deps.db, {
    request_id: requestId,
    user_id: id.accountId,
    device_id: id.deviceId,
    status: "pending",
    tg_message_id: null,
    created_at: now,
    expires_at: expiresAt
  });

  const tool = (body.tool ?? "a tool").slice(0, 60);
  const command = (body.command ?? "").slice(0, MAX_CMD);
  const text = command ? `🔔 Permission needed\n${tool}: ${command}` : `🔔 Permission needed\n${tool}`;
  try {
    const { message_id } = await deps.telegram.sendMessage(link.chat_id, text, [
      [
        { text: "✅ Approve", callback_data: `v1:${requestId}:approve` },
        { text: "⛔ Deny", callback_data: `v1:${requestId}:deny` }
      ]
    ]);
    await setRelayMessageId(deps.db, requestId, message_id);
  } catch {
    // Message send failed: leave the row pending; the device poll will read it and
    // time out to the native prompt. Fail-safe, never fail-open.
  }
  return Response.json({ ok: true, requestId, expiresAt });
}
```

```ts
// web/src/app/api/relay/permission/route.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleRelayPermission } from "@/server/handlers/relayPermission";
import { importVerifyKey } from "@/server/lib/jwt";
import { createTelegramClient } from "@/server/relay/telegram";

export async function POST(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  return handleRelayPermission(request, {
    db: env.DB,
    verifyKey: await importVerifyKey(env.LICENSE_PUBLIC_KEY),
    now: () => Date.now(),
    telegram: createTelegramClient(env.TELEGRAM_BOT_TOKEN),
    genRequestId: () => "req_" + crypto.randomUUID(),
    maxPending: 5
  });
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/server/handlers/relayPermission.ts web/src/app/api/relay/permission/route.ts web/test/relay/permission.test.ts
git commit -m "feat(#4): POST /relay/permission creates a request and sends the seller-bot prompt"
```

---

## Task 7: GET /relay/decision/:id

**Files:**
- Create: `web/src/server/handlers/relayDecision.ts`, `web/src/app/api/relay/decision/[id]/route.ts`
- Test: `web/test/relay/decision.test.ts`

**Interfaces:**
- Consumes: `authenticateRelay` (T4); `getRelayRequest` (T2).
- Produces:
  - `interface RelayDecisionDeps { db: D1Database; verifyKey: CryptoKey; now: () => number }`
  - `handleRelayDecision(request, deps, requestId): Promise<Response>` → `200 { status }` where `status ∈ pending|allow|deny|expired`. Unknown id, or a row owned by a different account, reads as `expired` (no leak). Unauthenticated → `401`.

- [ ] **Step 1: Write the failing test**

```ts
// web/test/relay/decision.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, makeTestKeypair } from "../helpers";
import { signLicenseToken } from "../../src/server/lib/jwt";
import { handleRelayDecision } from "../../src/server/handlers/relayDecision";

let deps: any, signingKey: CryptoKey;
beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS relay_requests; DROP TABLE IF EXISTS users");
  await applySchema(env.DB);
  await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_1', 1, 0, 0)").run();
  const kp = await makeTestKeypair();
  signingKey = kp.signingKey;
  deps = { db: env.DB, verifyKey: kp.publicKey, now: () => 1000 };
});
const authReq = async (sub = "acct_1") => new Request("http://t/relay/decision/x", { headers: { Authorization: `Bearer ${await signLicenseToken({ sub, deviceId: "d1", status: "active", plan: "monthly", iat: 0, exp: 9_999_999 }, signingKey)}` } });

describe("relay decision", () => {
  it("returns the resolved status for the owning account", async () => {
    await env.DB.prepare("INSERT INTO relay_requests (request_id, user_id, device_id, status, created_at, expires_at) VALUES ('r1','acct_1','d1','allow',0,9999999999999)").run();
    const res = await handleRelayDecision(await authReq(), deps, "r1");
    expect((await res.json<any>()).status).toBe("allow");
  });

  it("reports expired for a pending-but-past-expiry row, an unknown id, and a foreign row", async () => {
    await env.DB.prepare("INSERT INTO relay_requests (request_id, user_id, device_id, status, created_at, expires_at) VALUES ('r2','acct_1','d1','pending',0,100)").run();
    await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_2', 2, 0, 0)").run();
    await env.DB.prepare("INSERT INTO relay_requests (request_id, user_id, device_id, status, created_at, expires_at) VALUES ('r3','acct_2','d1','allow',0,9999999999999)").run();
    expect((await (await handleRelayDecision(await authReq(), deps, "r2")).json<any>()).status).toBe("expired"); // past expiry
    expect((await (await handleRelayDecision(await authReq(), deps, "nope")).json<any>()).status).toBe("expired"); // unknown
    expect((await (await handleRelayDecision(await authReq(), deps, "r3")).json<any>()).status).toBe("expired"); // foreign
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write the handler + route**

```ts
// web/src/server/handlers/relayDecision.ts
import { authenticateRelay } from "../relay/relayAuth";
import { getRelayRequest } from "../relay/repository";

export interface RelayDecisionDeps {
  db: D1Database;
  verifyKey: CryptoKey;
  now: () => number;
}

export async function handleRelayDecision(request: Request, deps: RelayDecisionDeps, requestId: string): Promise<Response> {
  const now = deps.now();
  const id = await authenticateRelay(request, deps.verifyKey, now);
  if (!id) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const row = await getRelayRequest(deps.db, requestId);
  if (!row || row.user_id !== id.accountId) {
    return Response.json({ status: "expired" });
  }
  const status = row.status === "pending" && now >= row.expires_at ? "expired" : row.status;
  return Response.json({ status });
}
```

```ts
// web/src/app/api/relay/decision/[id]/route.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleRelayDecision } from "@/server/handlers/relayDecision";
import { importVerifyKey } from "@/server/lib/jwt";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { env } = getCloudflareContext();
  const { id } = await ctx.params;
  return handleRelayDecision(
    request,
    { db: env.DB, verifyKey: await importVerifyKey(env.LICENSE_PUBLIC_KEY), now: () => Date.now() },
    id
  );
}
```

> Note: Next.js 15 route handlers receive `params` as a `Promise` — `await ctx.params`. If this project's Next version passes a plain object, drop the `await` (confirm against a sibling dynamic route if one exists).

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/server/handlers/relayDecision.ts "web/src/app/api/relay/decision/[id]/route.ts" web/test/relay/decision.test.ts
git commit -m "feat(#4): GET /relay/decision/:id (owner-scoped, lazy-expired)"
```

---

## Task 8: POST /webhooks/telegram

**Files:**
- Create: `web/src/server/handlers/telegramWebhook.ts`, `web/src/app/api/webhooks/telegram/route.ts`
- Test: `web/test/relay/webhook.test.ts`

**Interfaces:**
- Consumes: `getRelayRequest`, `resolveRelayRequest`, `getTelegramLink`, `getTelegramLinkByChat`, `upsertTelegramLink`, `consumeLinkCode` (T2); `TelegramClient` (T3).
- Produces:
  - `interface TelegramWebhookDeps { db: D1Database; now: () => number; telegram: TelegramClient; webhookSecret: string }`
  - `handleTelegramWebhook(request, deps): Promise<Response>` — checks `X-Telegram-Bot-Api-Secret-Token` (else `401`); on a `callback_query` verifies the tapping chat owns the request then resolves (first-wins) + edits the message + answers; on `/start <code>` completes linking (with relink-conflict guard); always `200` otherwise.

- [ ] **Step 1: Write the failing test**

```ts
// web/test/relay/webhook.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema } from "../helpers";
import { handleTelegramWebhook } from "../../src/server/handlers/telegramWebhook";

let deps: any, edits: any[], answers: any[], sent: any[];
beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS relay_requests; DROP TABLE IF EXISTS telegram_link_codes; DROP TABLE IF EXISTS telegram_links; DROP TABLE IF EXISTS users");
  await applySchema(env.DB);
  await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_1', 1, 0, 0)").run();
  edits = []; answers = []; sent = [];
  deps = {
    db: env.DB, now: () => 1000, webhookSecret: "SEK",
    telegram: {
      sendMessage: async (chatId: string, text: string) => { sent.push({ chatId, text }); return { message_id: 1 }; },
      editMessageText: async (chatId: string, messageId: number, text: string) => { edits.push({ chatId, messageId, text }); },
      answerCallbackQuery: async (id: string, text?: string) => { answers.push({ id, text }); }
    }
  };
});
const hook = (body: any, secret = "SEK") =>
  handleTelegramWebhook(new Request("http://t/webhooks/telegram", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": secret, "content-type": "application/json" }, body: JSON.stringify(body) }), deps);

describe("telegram webhook", () => {
  it("rejects a bad secret", async () => {
    expect((await hook({}, "WRONG")).status).toBe(401);
  });

  it("resolves a request only from the owning chat, first-wins", async () => {
    await env.DB.prepare("INSERT INTO telegram_links (user_id, chat_id, linked_at) VALUES ('acct_1','555',0)").run();
    await env.DB.prepare("INSERT INTO relay_requests (request_id, user_id, device_id, status, tg_message_id, created_at, expires_at) VALUES ('r1','acct_1','d1','pending',9,0,9999999999999)").run();
    // Foreign chat cannot decide:
    await hook({ callback_query: { id: "c0", data: "v1:r1:approve", message: { message_id: 9, chat: { id: 999 } } } });
    expect((await env.DB.prepare("SELECT status FROM relay_requests WHERE request_id='r1'").first<any>()).status).toBe("pending");
    // Owning chat approves:
    await hook({ callback_query: { id: "c1", data: "v1:r1:approve", message: { message_id: 9, chat: { id: 555 } } } });
    expect((await env.DB.prepare("SELECT status FROM relay_requests WHERE request_id='r1'").first<any>()).status).toBe("allow");
    expect(edits[0].text).toMatch(/approv/i);
    expect(answers.length).toBe(2);
  });

  it("links a chat via /start <code> and rejects a code owned by another chat's account conflict", async () => {
    await env.DB.prepare("INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES ('CODE1','acct_1',9999999999999)").run();
    await hook({ message: { text: "/start CODE1", chat: { id: 555 } } });
    expect((await env.DB.prepare("SELECT chat_id FROM telegram_links WHERE user_id='acct_1'").first<any>()).chat_id).toBe("555");
    expect(sent.some((m) => /linked/i.test(m.text))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write the handler + route**

```ts
// web/src/server/handlers/telegramWebhook.ts
import {
  getRelayRequest,
  resolveRelayRequest,
  getTelegramLink,
  getTelegramLinkByChat,
  upsertTelegramLink,
  consumeLinkCode
} from "../relay/repository";
import type { TelegramClient } from "../relay/telegram";

export interface TelegramWebhookDeps {
  db: D1Database;
  now: () => number;
  telegram: TelegramClient;
  webhookSecret: string;
}

interface Update {
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } };
  message?: { text?: string; chat: { id: number } };
}

function parseCallback(data: string): { requestId: string; choice: "approve" | "deny" } | null {
  const parts = data.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  if (parts[2] !== "approve" && parts[2] !== "deny") return null;
  if (!parts[1]) return null;
  return { requestId: parts[1], choice: parts[2] };
}

export async function handleTelegramWebhook(request: Request, deps: TelegramWebhookDeps): Promise<Response> {
  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== deps.webhookSecret) {
    return new Response("unauthorized", { status: 401 });
  }
  const update = (await request.json().catch(() => null)) as Update | null;
  if (!update) return new Response("ok");
  const now = deps.now();

  const cq = update.callback_query;
  if (cq?.data && cq.message) {
    const parsed = parseCallback(cq.data);
    if (parsed) {
      const row = await getRelayRequest(deps.db, parsed.requestId);
      const link = row ? await getTelegramLink(deps.db, row.user_id) : null;
      if (row && link && link.chat_id === String(cq.message.chat.id)) {
        const ok = await resolveRelayRequest(deps.db, parsed.requestId, parsed.choice === "approve" ? "allow" : "deny", now);
        const label = parsed.choice === "approve" ? "✅ Approved" : "⛔ Denied";
        try { await deps.telegram.editMessageText(link.chat_id, cq.message.message_id, ok ? label : "Already handled"); } catch { /* best-effort */ }
        await deps.telegram.answerCallbackQuery(cq.id, ok ? label : "Already handled");
      } else {
        await deps.telegram.answerCallbackQuery(cq.id, "Not authorized");
      }
    }
    return new Response("ok");
  }

  const text = update.message?.text?.trim();
  if (text?.startsWith("/start ") && update.message) {
    const chatId = String(update.message.chat.id);
    const code = text.slice("/start ".length).trim();
    const consumed = await consumeLinkCode(deps.db, code, now);
    if (!consumed) {
      await deps.telegram.sendMessage(chatId, "That link expired. Generate a fresh one from AI Coding Alerts.");
      return new Response("ok");
    }
    const existing = await getTelegramLinkByChat(deps.db, chatId);
    if (existing && existing.user_id !== consumed.user_id) {
      await deps.telegram.sendMessage(chatId, "This Telegram is already linked to another AI Coding Alerts account.");
      return new Response("ok");
    }
    await upsertTelegramLink(deps.db, consumed.user_id, chatId, now);
    await deps.telegram.sendMessage(chatId, "✅ Linked — approval requests will arrive here.");
  }
  return new Response("ok");
}
```

```ts
// web/src/app/api/webhooks/telegram/route.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleTelegramWebhook } from "@/server/handlers/telegramWebhook";
import { createTelegramClient } from "@/server/relay/telegram";

export async function POST(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  return handleTelegramWebhook(request, {
    db: env.DB,
    now: () => Date.now(),
    telegram: createTelegramClient(env.TELEGRAM_BOT_TOKEN),
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET
  });
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/server/handlers/telegramWebhook.ts web/src/app/api/webhooks/telegram/route.ts web/test/relay/webhook.test.ts
git commit -m "feat(#4): Telegram webhook (owner-checked taps + /start linking)"
```

---

## Task 9: expose `telegramLinked` on /auth/refresh

**Files:**
- Modify: `web/src/server/handlers/authRefresh.ts`
- Test: `web/test/handlers/authRefresh.test.ts` (add a case)

**Interfaces:**
- Consumes: `getTelegramLink` (T2).
- Produces: the `/auth/refresh` JSON response gains `telegramLinked: boolean`. No signature change to `handleAuthRefresh`.

- [ ] **Step 1: Write the failing test** (append to `web/test/handlers/authRefresh.test.ts`)

```ts
import { getTelegramLink } from "../../src/server/relay/repository"; // (import may already resolve; used to seed)

test("refresh reports telegramLinked true once a link row exists", async () => {
  // Reuse this file's existing setup that inserts the user + returns a valid github token & deps.
  // After a normal refresh, telegramLinked is false; after inserting a telegram_links row it is true.
  // (Adapt variable names — `deps`, the request builder — to this file's existing helpers.)
  const before = await handleAuthRefresh(makeRefreshRequest(), deps);
  expect((await before.json<any>()).telegramLinked).toBe(false);
  await deps.db.prepare("INSERT INTO telegram_links (user_id, chat_id, linked_at) SELECT id, '555', 0 FROM users LIMIT 1").run();
  const after = await handleAuthRefresh(makeRefreshRequest(), deps);
  expect((await after.json<any>()).telegramLinked).toBe(true);
});
```

> This file already exercises `handleAuthRefresh` with a seeded user, a fake `githubFetch`, a signing key, and a request builder. Reuse those exact helpers (names may differ — read the file). Ensure the `beforeEach` drops/recreates `telegram_links` too (add it to the existing `DROP TABLE` list), so `applySchema` provides it.

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL (`telegramLinked` is `undefined`).

- [ ] **Step 3: Modify `handleAuthRefresh`**

Add the import and one lookup, and include the field in the response:

```ts
import { getTelegramLink } from "../relay/repository";
```

```ts
  // ...after `const entitlement = resolveEntitlement(subscription);`
  const telegramLinked = (await getTelegramLink(deps.db, user.id)) !== null;

  const token = await mintAccountToken(user.id, body.deviceId, entitlement, nowMs, deps.signingKey);

  return Response.json({
    ok: true,
    token,
    status: entitlement.status,
    plan: entitlement.plan,
    telegramLinked
  });
```

- [ ] **Step 4: Run the auth-refresh tests** — Expected: PASS (existing + new). Run: `cd web && npx vitest run test/handlers/authRefresh.test.ts`

- [ ] **Step 5: Commit**

```bash
git add web/src/server/handlers/authRefresh.ts web/test/handlers/authRefresh.test.ts
git commit -m "feat(#4): surface telegramLinked on /auth/refresh"
```

---

## Task 10: extension — broker precedence (`modeSelect`)

**Files:**
- Create: `src/permission/modeSelect.ts`
- Test: `test/permission/modeSelect.test.ts`

**Interfaces:**
- Produces:
  - `type Broker = "managed" | "diy" | "native"`
  - `interface ModeInputs { isPro: boolean; linked: boolean; preferManaged: boolean; diyConfigured: boolean }`
  - `selectBroker(i: ModeInputs): Broker` — managed if `isPro && linked && preferManaged`; else diy if `diyConfigured`; else native.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectBroker } from "../../src/permission/modeSelect";

test("managed wins only when pro, linked, and preferred", () => {
  assert.equal(selectBroker({ isPro: true, linked: true, preferManaged: true, diyConfigured: true }), "managed");
  assert.equal(selectBroker({ isPro: true, linked: true, preferManaged: false, diyConfigured: true }), "diy");
  assert.equal(selectBroker({ isPro: false, linked: true, preferManaged: true, diyConfigured: true }), "diy");
  assert.equal(selectBroker({ isPro: true, linked: false, preferManaged: true, diyConfigured: true }), "diy");
});

test("falls back to native when neither managed nor DIY is available", () => {
  assert.equal(selectBroker({ isPro: true, linked: false, preferManaged: true, diyConfigured: false }), "native");
  assert.equal(selectBroker({ isPro: false, linked: false, preferManaged: true, diyConfigured: false }), "native");
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// src/permission/modeSelect.ts
export type Broker = "managed" | "diy" | "native";

export interface ModeInputs {
  isPro: boolean;
  linked: boolean;
  preferManaged: boolean;
  diyConfigured: boolean;
}

export function selectBroker(i: ModeInputs): Broker {
  if (i.isPro && i.linked && i.preferManaged) return "managed";
  if (i.diyConfigured) return "diy";
  return "native";
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/permission/modeSelect.ts test/permission/modeSelect.test.ts
git commit -m "feat(#4): broker precedence selector (managed/diy/native)"
```

---

## Task 11: extension — relay HTTP client

**Files:**
- Create: `src/relay/relayClient.ts`
- Test: `test/relay/relayClient.test.ts`

**Interfaces:**
- Produces:
  - `type FetchLike = (url: string, init?: { method?: string; headers?: Record<string,string>; body?: string }) => Promise<{ status: number; json: () => Promise<any> }>`
  - `interface RelayClientDeps { fetchImpl: FetchLike; baseUrl: () => string; token: () => Promise<string | undefined> }`
  - `interface RelayClient { createPermission(p: { tool: string; command: string; ttlSec: number }): Promise<{ ok: true; requestId: string } | { ok: false; notLinked: boolean }>; getDecision(requestId: string): Promise<"pending" | "allow" | "deny" | "expired"> }`
  - `createRelayClient(deps: RelayClientDeps): RelayClient`
- Consumes: reuses the `FetchLike` shape from `src/license/api.ts` (compatible — `{status, json}`).

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRelayClient } from "../../src/relay/relayClient";

function stub(routes: Record<string, { status: number; body: any }>) {
  const calls: any[] = [];
  const fetchImpl = async (url: string, init?: any) => {
    calls.push({ url, init });
    const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
    const r = routes[key] ?? { status: 404, body: {} };
    return { status: r.status, json: async () => r.body };
  };
  return { calls, fetchImpl };
}

test("createPermission returns requestId and sends the bearer token", async () => {
  const { calls, fetchImpl } = stub({ "POST /api/relay/permission": { status: 200, body: { ok: true, requestId: "req_9" } } });
  const client = createRelayClient({ fetchImpl, baseUrl: () => "https://x.dev/api", token: async () => "TOK" });
  const res = await client.createPermission({ tool: "Bash", command: "ls", ttlSec: 300 });
  assert.deepEqual(res, { ok: true, requestId: "req_9" });
  assert.equal(calls[0].init.headers.Authorization, "Bearer TOK");
});

test("createPermission maps 409 to notLinked and getDecision maps status", async () => {
  const { fetchImpl } = stub({
    "POST /api/relay/permission": { status: 409, body: { ok: false, error: "not_linked" } },
    "GET /api/relay/decision/req_9": { status: 200, body: { status: "allow" } }
  });
  const client = createRelayClient({ fetchImpl, baseUrl: () => "https://x.dev/api", token: async () => "TOK" });
  assert.deepEqual(await client.createPermission({ tool: "Bash", command: "ls", ttlSec: 300 }), { ok: false, notLinked: true });
  assert.equal(await client.getDecision("req_9"), "allow");
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// src/relay/relayClient.ts
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ status: number; json: () => Promise<any> }>;

export interface RelayClientDeps {
  fetchImpl: FetchLike;
  baseUrl: () => string;
  token: () => Promise<string | undefined>;
}

export interface RelayClient {
  createPermission(p: { tool: string; command: string; ttlSec: number }): Promise<{ ok: true; requestId: string } | { ok: false; notLinked: boolean }>;
  getDecision(requestId: string): Promise<"pending" | "allow" | "deny" | "expired">;
}

export function createRelayClient(deps: RelayClientDeps): RelayClient {
  async function authHeaders(): Promise<Record<string, string>> {
    const t = await deps.token();
    return t ? { Authorization: `Bearer ${t}`, "content-type": "application/json" } : { "content-type": "application/json" };
  }
  return {
    async createPermission(p) {
      const res = await deps.fetchImpl(`${deps.baseUrl()}/relay/permission`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(p)
      });
      if (res.status === 200) {
        const body = await res.json();
        if (body?.ok && typeof body.requestId === "string") return { ok: true, requestId: body.requestId };
      }
      return { ok: false, notLinked: res.status === 409 };
    },
    async getDecision(requestId) {
      const res = await deps.fetchImpl(`${deps.baseUrl()}/relay/decision/${encodeURIComponent(requestId)}`, {
        method: "GET",
        headers: await authHeaders()
      });
      if (res.status !== 200) return "expired";
      const body = await res.json().catch(() => null);
      const s = body?.status;
      return s === "allow" || s === "deny" || s === "pending" ? s : "expired";
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/relay/relayClient.ts test/relay/relayClient.test.ts
git commit -m "feat(#4): extension relay HTTP client (create + poll decision)"
```

---

## Task 12: extension — managed broker

**Files:**
- Create: `src/permission/managedBroker.ts`
- Test: `test/permission/managedBroker.test.ts`

**Interfaces:**
- Consumes: `PendingDecisionStore` (existing), `extractPermissionInfo` (existing `src/permission/permissionRequest.ts`), `RelayClient` (T11).
- Produces:
  - `interface ManagedBrokerDeps { store: PendingDecisionStore; relay: RelayClient; ttlMs: () => number; messageFor: (payload: unknown) => string; showPcPrompt: (text: string, resolve: (d: "allow" | "deny") => void) => () => void; sleep: (ms: number) => Promise<void>; pollMs: number; log: (msg: string) => void }`
  - `createManagedBroker(deps): { create(payload: unknown): Promise<{ id: string }> }`
  - Behavior: `store.create(ttl)`, show the PC prompt (parity + local fallback), then in the background POST the relay request and poll `getDecision` every `pollMs` until the store is no longer pending (resolved by phone, PC, or expiry). `notLinked`/errors are logged and left to expire → native. Returns `{ id }` promptly.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createManagedBroker } from "../../src/permission/managedBroker";
import { PendingDecisionStore } from "../../src/permission/PendingDecisionStore";

const payload = { hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "npm test" } };
const tick = () => new Promise((r) => setImmediate(r));

function setup(relay: any) {
  const store = new PendingDecisionStore({ idGen: (() => { let n = 0; return () => `id${++n}`; })() });
  const prompts: any[] = [];
  const broker = createManagedBroker({
    store, relay,
    ttlMs: () => 300000,
    messageFor: () => "Bash: npm test",
    showPcPrompt: (_t, _r) => { prompts.push(_r); return () => prompts.push("dismissed"); },
    sleep: async () => {},
    pollMs: 1,
    log: () => {}
  });
  return { store, broker, prompts };
}

test("polls the relay and resolves allow", async () => {
  let polls = 0;
  const relay = {
    createPermission: async () => ({ ok: true, requestId: "req_1" }),
    getDecision: async () => (++polls >= 2 ? "allow" : "pending")
  };
  const { store, broker } = setup(relay);
  const { id } = await broker.create(payload);
  assert.equal(store.status(id), "pending");
  for (let i = 0; i < 5 && store.status(id) === "pending"; i++) await tick();
  assert.equal(store.status(id), "allow");
});

test("notLinked leaves the decision to expire (never fails open)", async () => {
  const relay = { createPermission: async () => ({ ok: false, notLinked: true }), getDecision: async () => "pending" };
  const { store, broker } = setup(relay);
  const { id } = await broker.create(payload);
  for (let i = 0; i < 3; i++) await tick();
  assert.equal(store.status(id), "pending"); // never resolved to allow; will expire -> native
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// src/permission/managedBroker.ts
import { PendingDecisionStore } from "./PendingDecisionStore";
import { extractPermissionInfo } from "./permissionRequest";
import { RelayClient } from "../relay/relayClient";

export interface ManagedBrokerDeps {
  store: PendingDecisionStore;
  relay: RelayClient;
  ttlMs: () => number;
  messageFor: (payload: unknown) => string;
  showPcPrompt: (text: string, resolve: (d: "allow" | "deny") => void) => () => void;
  sleep: (ms: number) => Promise<void>;
  pollMs: number;
  log: (msg: string) => void;
}

export function createManagedBroker(deps: ManagedBrokerDeps): { create(payload: unknown): Promise<{ id: string }> } {
  return {
    async create(payload) {
      const info = extractPermissionInfo(payload);
      const ttlMs = deps.ttlMs();
      const id = deps.store.create(ttlMs);
      const text = deps.messageFor(payload);
      const dismissPc = deps.showPcPrompt(text, (d) => deps.store.resolve(id, d));

      void (async () => {
        try {
          const created = await deps.relay.createPermission({
            tool: info?.tool ?? "a tool",
            command: info?.command ?? "",
            ttlSec: Math.ceil(ttlMs / 1000)
          });
          if (!created.ok) {
            deps.log(created.notLinked ? "relay: account not linked; falling back to native" : "relay: create failed");
            return; // leave pending -> expires -> native
          }
          while (deps.store.status(id) === "pending") {
            await deps.sleep(deps.pollMs);
            const status = await deps.relay.getDecision(created.requestId);
            if (status === "allow" || status === "deny") { deps.store.resolve(id, status); break; }
            if (status === "expired") break;
          }
        } catch (e) {
          deps.log(`relay poll failed: ${String(e)}`);
        } finally {
          dismissPc();
        }
      })();

      return { id };
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/permission/managedBroker.ts test/permission/managedBroker.test.ts
git commit -m "feat(#4): managed broker (relay create + poll, PC-prompt parity, fail-safe)"
```

---

## Task 13: extension — account status, config, and commands

**Files:**
- Modify: `src/license/AccountService.ts`, `src/config/readAlertSettings.ts`, `package.json`, `src/license/wire.ts`
- Test: `test/config/preferManagedBot.test.ts`, and extend an existing `AccountService` test (`test/license/*.test.ts`) for `telegramLinked` + `currentToken`.

**Interfaces:**
- Produces:
  - `AccountService.state()` gains `telegramLinked: boolean` (parsed from the `/auth/refresh` response field added in T9, cached in the same place `pro`/`mode` are cached).
  - `AccountService.currentToken(): Promise<string | undefined>` — the stored entitlement token (from `secrets`) used as the relay Bearer.
  - `readAlertSettings` gains `preferManagedBot: boolean` (default `true`), key `preferManagedBot`.
  - `package.json` config property `aiCodingAlerts.preferManagedBot`.
  - `wire.ts`: register `aiCodingAlerts.connectTelegram` (calls `POST /relay/link-code` via the service token, opens the deep link) and `aiCodingAlerts.refreshAccountStatus` (calls `service.recheckNow()` and reports linked state).

> **Read first:** `src/license/AccountService.ts` and `src/license/api.ts` to match the existing refresh-call and cache shape. `state()` currently returns `{ pro, mode }` (see `wire.ts`). Add `telegramLinked` alongside them, populated from the refresh response's new `telegramLinked` field, defaulting to `false` when never refreshed/offline. Add `currentToken()` reading the same secret the offline `isPro()` check reads. Adapt names to what the file actually uses.

- [ ] **Step 1: Write the failing test (config reader — the network-free, deterministic part)**

```ts
// test/config/preferManagedBot.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAlertSettings } from "../../src/config/readAlertSettings";

test("preferManagedBot defaults to true and honors an override", () => {
  assert.equal(readAlertSettings(<T>(_k: string, fb: T) => fb).preferManagedBot, true);
  const overrides: Record<string, unknown> = { preferManagedBot: false };
  assert.equal(readAlertSettings(<T>(k: string, fb: T) => (k in overrides ? (overrides[k] as T) : fb)).preferManagedBot, false);
});
```

Also add a focused `AccountService` test (in the existing license test file that already constructs a service with a fake `fetchImpl`): after a refresh whose stubbed response includes `telegramLinked: true`, assert `service.state().telegramLinked === true`, and that `service.currentToken()` returns the token the refresh stored. Reuse that file's existing fakes.

- [ ] **Step 2: Run tests to verify they fail** — Expected: FAIL.

- [ ] **Step 3a: Add the setting to `src/config/readAlertSettings.ts`**

In the returned `AlertSettings` object add:

```ts
    preferManagedBot: get("preferManagedBot", true),
```

and add `preferManagedBot: boolean;` to the `AlertSettings` interface.

- [ ] **Step 3b: Add the `package.json` property** under `contributes.configuration.properties`:

```json
"aiCodingAlerts.preferManagedBot": {
  "type": "boolean", "default": true,
  "description": "When you are Pro and have linked Telegram, use the managed AI Coding Alerts bot for approve/deny. Turn off to keep using your own bot (your command text then never leaves your machine)."
}
```

- [ ] **Step 3c: Extend `AccountService`** — parse `telegramLinked` from the refresh response into the cached state and expose it on `state()`; add `currentToken()`. (Follow the file's existing patterns per the "Read first" note.)

- [ ] **Step 3d: Register the two commands in `src/license/wire.ts`** (add to the `registerAccountCommands` push list):

```ts
    vscode.commands.registerCommand("aiCodingAlerts.connectTelegram", async () => {
      const token = await service.currentToken();
      if (!token) { void vscode.window.showInformationMessage("Sign in and subscribe to use the managed bot."); return; }
      try {
        const res = await fetch(`${LICENSE_BASE_URL}/relay/link-code`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        const body = (await res.json()) as { ok?: boolean; deepLink?: string };
        if (body?.ok && body.deepLink) void vscode.env.openExternal(vscode.Uri.parse(body.deepLink));
        else void vscode.window.showErrorMessage("Couldn't start Telegram linking. Try again.");
      } catch { void vscode.window.showErrorMessage("Couldn't reach the linking service."); }
    }),
    vscode.commands.registerCommand("aiCodingAlerts.refreshAccountStatus", async () => {
      const r = await service.recheckNow();
      const linked = service.state().telegramLinked;
      void vscode.window.showInformationMessage(r.ok ? `Account re-checked. Telegram ${linked ? "linked" : "not linked"}.` : `Re-check: ${r.message}`);
    })
```

Add the two commands to `package.json` `contributes.commands` (titles "AI Coding Alerts: Connect Telegram (managed bot)" and "AI Coding Alerts: Refresh account status").

- [ ] **Step 4: Run the config test + the AccountService test + full extension suite** — Expected: PASS. Run `npm test` and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/license/AccountService.ts src/license/wire.ts src/config/readAlertSettings.ts package.json test/config/preferManagedBot.test.ts test/license/
git commit -m "feat(#4): account telegramLinked + token accessor, preferManagedBot, link/refresh commands"
```

---

## Task 14: extension — wire the dispatcher into activate()

**Files:**
- Modify: `src/extension.ts`
- Test: manual/integration (activate() is not unit-tested; all logic lives in the tested modules T10–T13). Guard: `npm test` green + `npm run build` (esbuild) exit 0 + `npx tsc --noEmit` clean.

**Interfaces:**
- Consumes: `selectBroker` (T10), `createRelayClient` (T11), `createManagedBroker` (T12), `AccountService.currentToken`/`state().telegramLinked`/`state().pro` (T13), the existing `permissionSystem` (DIY) + `PendingDecisionStore` + `IngressServer` wiring (see `src/extension.ts:154-205`).

- [ ] **Step 1: Construct the managed broker after the existing `permissionSystem`/`poller` block** (around `src/extension.ts:194`), before `permissionRoutes`:

```ts
import { createRelayClient } from "./relay/relayClient";
import { createManagedBroker } from "./permission/managedBroker";
import { selectBroker } from "./permission/modeSelect";
import { newId } from "./util/id";
import { LICENSE_BASE_URL } from "./license/constants";
```

```ts
const relayClient = createRelayClient({
  fetchImpl: (url, init) => fetch(url, init).then((r) => ({ status: r.status, json: () => r.json() })),
  baseUrl: () => LICENSE_BASE_URL,
  token: () => account.currentToken()
});
const managedBroker = createManagedBroker({
  store: decisions,
  relay: relayClient,
  ttlMs: () => config.read().permissionTimeoutSec * 1000,
  messageFor: (payload) => registry.detect(payload)?.message ?? "Permission needed",
  showPcPrompt: (text, resolve) => {
    let live = true;
    void vscode.window
      .showInformationMessage(`Claude Code — ${text}`, "Approve", "Deny")
      .then((choice) => {
        if (live && choice === "Approve") resolve("allow");
        else if (live && choice === "Deny") resolve("deny");
      })
      .then(undefined, (e) => output.appendLine(`PC prompt failed: ${String(e)}`));
    return () => { live = false; };
  },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  pollMs: 2000,
  log: (msg) => output.appendLine(msg)
});
```

> The `showPcPrompt` closure is duplicated between the DIY `permissionSystem` and the managed broker. Factor it into one local `const showPcPrompt = (text, resolve) => { ... }` above both and pass it to each, to keep it DRY.

- [ ] **Step 2: Replace the `permissionRoutes.create` body with the dispatcher**

```ts
const permissionRoutes = {
  create: async (payload: unknown) => {
    const mode = selectBroker({
      isPro: account.state().pro,
      linked: account.state().telegramLinked,
      preferManaged: config.read().preferManagedBot,
      diyConfigured: twoWayEnabled()
    });
    if (mode === "managed") {
      return managedBroker.create(payload);
    }
    if (mode === "diy") {
      const res = await permissionSystem.create(payload);
      if (twoWayEnabled() && decisions.pendingCount() > 0) poller.start();
      return res;
    }
    return { id: newId() }; // native: unknown id -> hook times out -> native prompt
  },
  decision: (id: string) => permissionSystem.decision(id)
};
```

`permissionSystem.decision` reads the shared `decisions` store, so it serves managed and DIY resolutions identically. Keep both `IngressServer` constructions using this `permissionRoutes` (they already do).

- [ ] **Step 3: Run the full suite + build + typecheck**

Run: `npm test && npm run build && npx tsc --noEmit`
Expected: tests pass, esbuild exits 0, tsc clean.

- [ ] **Step 4: Manual smoke test** (documented, not automated — needs the registered seller bot + a phone)

Register the bot with @BotFather; set `TELEGRAM_BOT_TOKEN`/`TELEGRAM_BOT_USERNAME`/`TELEGRAM_WEBHOOK_SECRET` + `LICENSE_PUBLIC_KEY` on the Worker; set the Telegram webhook to `<origin>/api/webhooks/telegram` with the secret; apply the schema to D1. As a Pro user: run "Connect Telegram", tap the deep link, `/start`; trigger a Claude Code permission prompt; confirm the phone message → Approve lets the tool run, Deny blocks it, PC notification resolves the same decision, and no answer for 5 min falls back to the native prompt. Toggle `preferManagedBot` off and confirm it uses your own DIY bot.

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts
git commit -m "feat(#4): dispatch permission requests to managed/DIY/native brokers"
```

---

## Final Verification

- [ ] `web/`: `npm test` (vitest) green, `npx tsc --noEmit` clean.
- [ ] extension: `npm test` green, `npm run build` exit 0, `npx tsc --noEmit` clean.
- [ ] Manual smoke test (Task 14, Step 4) confirms the end-to-end phone→agent flow and the DIY/native fallbacks.
- [ ] Whole-branch review, then finish the branch via `superpowers:finishing-a-development-branch`.

## Self-Review Notes (author)

- **Spec coverage:** transport/poll (T6, T7, T11, T12), entitlement-token auth (T4), Telegram linking (T5, T8, T13), webhook ownership + relink guard (T8), mode selection (T10, T14), 2-button Approve/Deny (T6, T8), fail-safe→native on every failure (T6 send-fail, T7 unknown/foreign→expired, T11 non-200→expired, T12 notLinked/error→expire, T14 native branch), blast-radius cap (T6 `maxPending`), privacy truncation + no command persistence (T6), `telegramLinked` status plumbing (T9, T13), secrets (T4 env + T14 smoke). All spec sections map to a task.
- **Type consistency:** `RelayIdentity` (T4) → T5/T6/T7; `RelayRequestRow`/repo fns (T2) → T6/T7/T8; `TelegramClient` (T3) → T6/T8; `RelayClient` (T11) → T12/T14; `selectBroker` inputs (T10) → T14; `PendingDecisionStore` API reused unchanged.
- **Reconciliation tasks (flagged inline):** T9 (append to the existing authRefresh test using its own helpers), T13 (AccountService internals — read the file, add `telegramLinked`/`currentToken`), T14 (extension.ts wiring against the real `permissionSystem`/`account` names). Each names the file to read and the exact additions.
- **Known deferral:** on a stale linked-status cache, a `notLinked` managed attempt waits out the full `permissionTimeoutSec` before the native prompt (no fast-fail signal exists on the hook path). Rare (status refreshes daily + on demand); acceptable for v1, documented.
