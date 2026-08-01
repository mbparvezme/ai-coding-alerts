# Free DIY Two-Way Telegram Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a free, self-hosted user approve or deny an AI coding agent's permission request from their phone via their own Telegram bot, gating the agent's tool call.

**Architecture:** A blocking `PermissionRequest` hook does POST-then-poll against the extension's local ingress. The extension registers a pending decision, pushes an inline-keyboard message to Telegram (and a PC notification), long-polls `getUpdates` for the tap, and returns the decision to the waiting hook. On a 5-minute timeout the hook returns no decision, so Claude Code's native prompt shows. The window the hook points at is the sole broker, so no cross-window coordination is needed.

**Tech Stack:** TypeScript, VS Code extension API, `node:http`/`node:https` (no new runtime deps), `node:test` + `tsx`, POSIX `sh` + Windows `cmd`/PowerShell hook scripts. Spec: `docs/superpowers/specs/2026-07-31-free-diy-bot-design.md`.

## Global Constraints

- **No new runtime dependencies.** Use `node:https`/`node:http` exactly as `src/platform/telegramSend.ts` does today.
- **Test runner:** `node --import tsx --test "test/**/*.test.ts"` (via `npm test`). Single file: `node --import tsx --test test/<path>.test.ts`. Requires Node ≥ 21 (CI pins Node 24).
- **Test style:** `node:test` + `node:assert/strict`; keep everything network- and VS-Code-free by injecting senders/clocks/transports (mirror `test/reactors/telegramNotifier.test.ts`).
- **Windows hooks:** quoted script path, **no** `cmd /c` wrapper (project convention).
- **No behavior change for one-way alerts** (completion/notification/activity) or the offline sound fallback.
- **Free tier:** nothing here may require sign-in or the backend.
- **Reuse** `Alert`, `createAlert`, `MuteController`, `newId`, `ClaudeCodeDetector`, and the injected-sender test pattern rather than parallel machinery.
- **`callback_data`** wire format is `v1:<uuid>:<choice>` where choice ∈ `approve|deny|remember|mute`.
- **Decision JSON** the hook emits on allow: `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}` (and `"deny"`); empty output ⇒ native dialog.

---

## File Structure

**New**
- `src/permission/callbackData.ts` — encode/parse `callback_data`.
- `src/permission/AllowRules.ts` — session-scoped auto-approve rules + `PermissionInfo`.
- `src/permission/permissionRequest.ts` — extract `{tool, command}` from a raw `PermissionRequest` payload.
- `src/permission/PendingDecisionStore.ts` — pending-decision registry (create/resolve/status/onChange).
- `src/platform/telegramApi.ts` — Telegram Bot API client (send/edit/answer/getUpdates) over an injectable transport.
- `src/permission/TelegramPoller.ts` — `getUpdates` loop with chatId validation, offset tracking, 409 backoff.
- `src/permission/permissionController.ts` — `createPermissionSystem` factory tying it together; exposes `create`, `decision`, `handleCallback`.
- `hooks/permission-hook.sh`, `hooks/permission-hook.cmd`, `hooks/permission-hook.ps1` — the blocking hook.
- Matching tests under `test/permission/**` and `test/platform/telegramApi.test.ts`, `test/hooks/permissionHook.test.ts`.

**Modified**
- `src/ingress/IngressServer.ts` — add `POST /permission` and `GET /decision/:id`.
- `src/setup/hookCommands.ts` — route `PermissionRequest` to `permission-hook`.
- `src/setup/hooksMerge.ts` — recognize the permission hook in `OUR_COMMAND`.
- `src/setup/HookInstaller.ts` — deploy the new scripts.
- `src/config/ConfigService.ts` — add `permissionTimeoutSec`, `telegramMuteMinutes`, `telegram.twoWay`.
- `src/extension.ts` — construct and wire the permission system.
- `package.json` — new configuration properties.

---

## Task 1: callback_data codec

**Files:**
- Create: `src/permission/callbackData.ts`
- Test: `test/permission/callbackData.test.ts`

**Interfaces:**
- Produces: `type Choice = "approve"|"deny"|"remember"|"mute"`; `encodeCallback(id: string, choice: Choice): string`; `parseCallback(data: string): { id: string; choice: Choice } | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeCallback, parseCallback } from "../../src/permission/callbackData";

test("round-trips id and choice", () => {
  const data = encodeCallback("abc-123", "approve");
  assert.equal(data, "v1:abc-123:approve");
  assert.deepEqual(parseCallback(data), { id: "abc-123", choice: "approve" });
});

test("parses every choice", () => {
  for (const c of ["approve", "deny", "remember", "mute"] as const) {
    assert.deepEqual(parseCallback(encodeCallback("i", c)), { id: "i", choice: c });
  }
});

test("rejects malformed or unknown data", () => {
  assert.equal(parseCallback("v1:i:nope"), null);
  assert.equal(parseCallback("v2:i:approve"), null);
  assert.equal(parseCallback("garbage"), null);
  assert.equal(parseCallback("v1::approve"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test test/permission/callbackData.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
export type Choice = "approve" | "deny" | "remember" | "mute";

const CHOICES = new Set<Choice>(["approve", "deny", "remember", "mute"]);

export function encodeCallback(id: string, choice: Choice): string {
  return `v1:${id}:${choice}`;
}

export function parseCallback(data: string): { id: string; choice: Choice } | null {
  const parts = data.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return null;
  }
  const [, id, choice] = parts;
  if (!id || !CHOICES.has(choice as Choice)) {
    return null;
  }
  return { id, choice: choice as Choice };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/permission/callbackData.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/permission/callbackData.ts test/permission/callbackData.test.ts
git commit -m "feat(#3): callback_data codec for Telegram action buttons"
```

---

## Task 2: AllowRules (session allow-rules)

**Files:**
- Create: `src/permission/AllowRules.ts`
- Test: `test/permission/allowRules.test.ts`

**Interfaces:**
- Produces: `interface PermissionInfo { agent: string; tool: string; command: string }`; `class AllowRules { static key(i: PermissionInfo): string; remember(i: PermissionInfo): void; matches(i: PermissionInfo): boolean; clear(): void }`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { AllowRules, PermissionInfo } from "../../src/permission/AllowRules";

const info = (command: string): PermissionInfo => ({ agent: "claude-code", tool: "Bash", command });

test("matches only after remember, and normalizes whitespace", () => {
  const rules = new AllowRules();
  assert.equal(rules.matches(info("npm run test")), false);
  rules.remember(info("npm   run   test"));
  assert.equal(rules.matches(info("npm run test")), true);
});

test("different tool or command does not match", () => {
  const rules = new AllowRules();
  rules.remember(info("npm run test"));
  assert.equal(rules.matches(info("npm run build")), false);
  assert.equal(rules.matches({ agent: "claude-code", tool: "Write", command: "npm run test" }), false);
});

test("clear forgets everything", () => {
  const rules = new AllowRules();
  rules.remember(info("ls"));
  rules.clear();
  assert.equal(rules.matches(info("ls")), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test test/permission/allowRules.test.ts` — Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
export interface PermissionInfo {
  agent: string;
  tool: string;
  command: string;
}

export class AllowRules {
  private readonly keys = new Set<string>();

  static key(i: PermissionInfo): string {
    const command = i.command.trim().replace(/\s+/g, " ");
    return `${i.agent}|${i.tool}|${command}`;
  }

  remember(i: PermissionInfo): void {
    this.keys.add(AllowRules.key(i));
  }

  matches(i: PermissionInfo): boolean {
    return this.keys.has(AllowRules.key(i));
  }

  clear(): void {
    this.keys.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/permission/AllowRules.ts test/permission/allowRules.test.ts
git commit -m "feat(#3): session-scoped allow-rules for 'Approve & remember'"
```

---

## Task 3: PermissionRequest payload parser

**Files:**
- Create: `src/permission/permissionRequest.ts`
- Test: `test/permission/permissionRequest.test.ts`

**Interfaces:**
- Consumes: `PermissionInfo` from Task 2.
- Produces: `extractPermissionInfo(payload: unknown): PermissionInfo | null` — reads `hook_event_name === "PermissionRequest"`, `tool_name`, `tool_input.command`/`description`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPermissionInfo } from "../../src/permission/permissionRequest";

test("extracts tool and command from a PermissionRequest payload", () => {
  const info = extractPermissionInfo({
    hook_event_name: "PermissionRequest",
    tool_name: "Bash",
    tool_input: { command: "npm run test", description: "run tests" }
  });
  assert.deepEqual(info, { agent: "claude-code", tool: "Bash", command: "npm run test" });
});

test("falls back to description then empty when command absent", () => {
  assert.equal(
    extractPermissionInfo({ hook_event_name: "PermissionRequest", tool_name: "Edit", tool_input: { description: "edit file" } })?.command,
    "edit file"
  );
  assert.equal(
    extractPermissionInfo({ hook_event_name: "PermissionRequest", tool_name: "Read" })?.command,
    ""
  );
});

test("returns null for non-PermissionRequest payloads", () => {
  assert.equal(extractPermissionInfo({ hook_event_name: "Stop" }), null);
  assert.equal(extractPermissionInfo("nope"), null);
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
import { PermissionInfo } from "./AllowRules";

interface RawPermission {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: { command?: unknown; description?: unknown };
}

export function extractPermissionInfo(payload: unknown): PermissionInfo | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const p = payload as RawPermission;
  if (p.hook_event_name !== "PermissionRequest") {
    return null;
  }
  const tool = typeof p.tool_name === "string" ? p.tool_name : "a tool";
  const command =
    (typeof p.tool_input?.command === "string" && p.tool_input.command.trim()) ||
    (typeof p.tool_input?.description === "string" && p.tool_input.description.trim()) ||
    "";
  return { agent: "claude-code", tool, command };
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/permission/permissionRequest.ts test/permission/permissionRequest.test.ts
git commit -m "feat(#3): extract tool/command from PermissionRequest payloads"
```

---

## Task 4: PendingDecisionStore

**Files:**
- Create: `src/permission/PendingDecisionStore.ts`
- Test: `test/permission/pendingDecisionStore.test.ts`

**Interfaces:**
- Produces:
  - `type DecisionStatus = "pending" | "allow" | "deny" | "expired"`
  - `class PendingDecisionStore` with:
    - `constructor(deps?: { now?: () => number; idGen?: () => string })`
    - `create(ttlMs: number): string` — returns a new id, registers pending.
    - `resolve(id: string, decision: "allow" | "deny"): boolean` — first-wins; false if unknown/expired/already resolved.
    - `status(id: string): DecisionStatus` — unknown ⇒ `"expired"`; sweeps time-based expiry.
    - `onChange(cb: () => void): () => void` — fires on resolve; returns unsubscribe.
    - `pendingCount(): number`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PendingDecisionStore } from "../../src/permission/PendingDecisionStore";

function fixedClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("create → pending, resolve → decision, second resolve is a no-op", () => {
  let n = 0;
  const store = new PendingDecisionStore({ idGen: () => `id${++n}` });
  const id = store.create(5000);
  assert.equal(id, "id1");
  assert.equal(store.status(id), "pending");
  assert.equal(store.resolve(id, "allow"), true);
  assert.equal(store.status(id), "allow");
  assert.equal(store.resolve(id, "deny"), false);
  assert.equal(store.status(id), "allow");
});

test("expires after ttl and cannot be resolved", () => {
  const clock = fixedClock();
  const store = new PendingDecisionStore({ now: clock.now, idGen: () => "x" });
  const id = store.create(1000);
  clock.advance(1000);
  assert.equal(store.status(id), "expired");
  assert.equal(store.resolve(id, "allow"), false);
});

test("unknown id reads as expired", () => {
  const store = new PendingDecisionStore();
  assert.equal(store.status("missing"), "expired");
});

test("onChange fires on resolve; pendingCount reflects open decisions", () => {
  let fired = 0;
  const store = new PendingDecisionStore({ idGen: () => `id${store.pendingCount()}` });
  const off = store.onChange(() => (fired += 1));
  const id = store.create(5000);
  assert.equal(store.pendingCount(), 1);
  store.resolve(id, "deny");
  assert.equal(fired, 1);
  assert.equal(store.pendingCount(), 0);
  off();
  store.create(5000);
  store.resolve(store.create(5000), "allow");
  assert.equal(fired, 1);
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
import { newId } from "../util/id";

export type DecisionStatus = "pending" | "allow" | "deny" | "expired";

interface Entry {
  status: "pending" | "allow" | "deny";
  expiresAt: number;
}

export class PendingDecisionStore {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly idGen: () => string;

  constructor(deps: { now?: () => number; idGen?: () => string } = {}) {
    this.now = deps.now ?? (() => Date.now());
    this.idGen = deps.idGen ?? newId;
  }

  create(ttlMs: number): string {
    const id = this.idGen();
    this.entries.set(id, { status: "pending", expiresAt: this.now() + ttlMs });
    return id;
  }

  resolve(id: string, decision: "allow" | "deny"): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.status !== "pending" || this.now() >= entry.expiresAt) {
      return false;
    }
    entry.status = decision;
    this.emit();
    return true;
  }

  status(id: string): DecisionStatus {
    const entry = this.entries.get(id);
    if (!entry) {
      return "expired";
    }
    if (entry.status === "pending" && this.now() >= entry.expiresAt) {
      return "expired";
    }
    return entry.status;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  pendingCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.status === "pending" && this.now() < entry.expiresAt) {
        count += 1;
      }
    }
    return count;
  }

  private emit(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/permission/PendingDecisionStore.ts test/permission/pendingDecisionStore.test.ts
git commit -m "feat(#3): pending-decision store with first-wins resolve and ttl"
```

---

## Task 5: Telegram API client

**Files:**
- Create: `src/platform/telegramApi.ts`
- Test: `test/platform/telegramApi.test.ts`

**Interfaces:**
- Produces:
  - `interface InlineButton { text: string; callback_data: string }`
  - `interface TelegramUpdate { update_id: number; callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } } }`
  - `type Transport = (method: string, params: Record<string, unknown>) => Promise<any>`
  - `interface TelegramApi { sendMessage(chatId, text, keyboard?): Promise<{ message_id: number }>; editMessageText(chatId, messageId, text): Promise<void>; answerCallbackQuery(callbackQueryId, text?): Promise<void>; getUpdates(offset, timeoutSec): Promise<TelegramUpdate[]> }`
  - `function createTelegramApi(token: string, transport?: Transport): TelegramApi`
- Consumes: node:https (default transport only).

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTelegramApi } from "../../src/platform/telegramApi";

function fakeTransport() {
  const calls: Array<{ method: string; params: any }> = [];
  const t = async (method: string, params: any) => {
    calls.push({ method, params });
    if (method === "sendMessage") return { message_id: 42 };
    if (method === "getUpdates") return [{ update_id: 7, callback_query: { id: "q", data: "v1:i:approve" } }];
    return true;
  };
  return { calls, t };
}

test("sendMessage passes chat_id, text, and inline keyboard", async () => {
  const { calls, t } = fakeTransport();
  const api = createTelegramApi("TOK", t);
  const res = await api.sendMessage("C", "hi", [[{ text: "Approve", callback_data: "v1:i:approve" }]]);
  assert.equal(res.message_id, 42);
  assert.equal(calls[0].method, "sendMessage");
  assert.equal(calls[0].params.chat_id, "C");
  assert.equal(calls[0].params.text, "hi");
  assert.deepEqual(calls[0].params.reply_markup, { inline_keyboard: [[{ text: "Approve", callback_data: "v1:i:approve" }]] });
});

test("getUpdates forwards offset and timeout and returns updates", async () => {
  const { calls, t } = fakeTransport();
  const api = createTelegramApi("TOK", t);
  const updates = await api.getUpdates(100, 25);
  assert.equal(calls[0].params.offset, 100);
  assert.equal(calls[0].params.timeout, 25);
  assert.equal(updates[0].update_id, 7);
});

test("editMessageText and answerCallbackQuery send the right params", async () => {
  const { calls, t } = fakeTransport();
  const api = createTelegramApi("TOK", t);
  await api.editMessageText("C", 42, "done");
  await api.answerCallbackQuery("q", "Already handled");
  assert.deepEqual(calls[0], { method: "editMessageText", params: { chat_id: "C", message_id: 42, text: "done" } });
  assert.deepEqual(calls[1], { method: "answerCallbackQuery", params: { callback_query_id: "q", text: "Already handled" } });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
import { request } from "node:https";

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
}

export type Transport = (method: string, params: Record<string, unknown>) => Promise<any>;

const TIMEOUT_MS = 5000;

function httpsTransport(token: string, requestTimeoutMs: number): Transport {
  return (method, params) =>
    new Promise((resolve, reject) => {
      const body = JSON.stringify(params);
      const req = request(
        {
          hostname: "api.telegram.org",
          path: `/bot${token}/${method}`,
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data || "{}");
              if (parsed.ok === false) {
                reject(new Error(`Telegram ${method} failed: ${parsed.error_code} ${parsed.description}`));
              } else {
                resolve(parsed.result);
              }
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.setTimeout(requestTimeoutMs, () => req.destroy(new Error(`Telegram ${method} timed out`)));
      req.on("error", reject);
      req.write(body);
      req.end();
    });
}

export interface TelegramApi {
  sendMessage(chatId: string, text: string, keyboard?: InlineButton[][]): Promise<{ message_id: number }>;
  editMessageText(chatId: string, messageId: number, text: string): Promise<void>;
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
  getUpdates(offset: number, timeoutSec: number): Promise<TelegramUpdate[]>;
}

export function createTelegramApi(token: string, transport?: Transport): TelegramApi {
  // getUpdates long-polls, so its transport needs a longer socket timeout than the poll window.
  const call = transport ?? httpsTransport(token, TIMEOUT_MS);
  const longCall = transport ?? httpsTransport(token, 60_000);
  return {
    async sendMessage(chatId, text, keyboard) {
      const params: Record<string, unknown> = { chat_id: chatId, text };
      if (keyboard) {
        params.reply_markup = { inline_keyboard: keyboard };
      }
      return call("sendMessage", params);
    },
    async editMessageText(chatId, messageId, text) {
      await call("editMessageText", { chat_id: chatId, message_id: messageId, text });
    },
    async answerCallbackQuery(callbackQueryId, text) {
      const params: Record<string, unknown> = { callback_query_id: callbackQueryId };
      if (text) {
        params.text = text;
      }
      await call("answerCallbackQuery", params);
    },
    async getUpdates(offset, timeoutSec) {
      return (await longCall("getUpdates", { offset, timeout: timeoutSec })) ?? [];
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/platform/telegramApi.ts test/platform/telegramApi.test.ts
git commit -m "feat(#3): Telegram API client (send/edit/answer/getUpdates)"
```

---

## Task 6: TelegramPoller

**Files:**
- Create: `src/permission/TelegramPoller.ts`
- Test: `test/permission/telegramPoller.test.ts`

**Interfaces:**
- Consumes: `TelegramUpdate` (Task 5).
- Produces:
  - `interface PollerDeps { getUpdates(offset, timeoutSec): Promise<TelegramUpdate[]>; chatId: () => string; onCallback(cb: { callbackQueryId: string; data: string; chatId: string; messageId?: number }): void | Promise<void>; loadOffset(): number; saveOffset(n: number): void; isActive(): boolean; sleep?(ms: number): Promise<void>; longPollSec?: number }`
  - `class TelegramPoller { constructor(deps: PollerDeps); start(): void; stop(): void; get running(): boolean }`
- Behavior: while `isActive()`, `getUpdates(offset)`, advance offset past every update (even ignored), dispatch `onCallback` only for `callback_query` whose `message.chat.id` matches `chatId()`; on error back off via `sleep`; stop when `isActive()` returns false.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { TelegramPoller } from "../../src/permission/TelegramPoller";
import { TelegramUpdate } from "../../src/platform/telegramApi";

function harness(scripted: TelegramUpdate[][]) {
  let call = 0;
  let offset = 0;
  const seen: any[] = [];
  let active = true;
  const deps = {
    getUpdates: async (o: number) => {
      seen.push({ kind: "poll", offset: o });
      const batch = scripted[call] ?? [];
      call += 1;
      if (call >= scripted.length) active = false; // stop after the scripted batches
      return batch;
    },
    chatId: () => "555",
    onCallback: async (cb: any) => seen.push({ kind: "cb", ...cb }),
    loadOffset: () => offset,
    saveOffset: (n: number) => (offset = n),
    isActive: () => active,
    sleep: async () => {}
  };
  return { deps, seen, getOffset: () => offset };
}

test("dispatches matching callbacks and advances offset past all updates", async () => {
  const updates: TelegramUpdate[] = [
    { update_id: 10, callback_query: { id: "q1", data: "v1:i:approve", message: { message_id: 1, chat: { id: 555 } } } },
    { update_id: 11, callback_query: { id: "q2", data: "v1:j:deny", message: { message_id: 2, chat: { id: 999 } } } }
  ];
  const { deps, seen, getOffset } = harness([updates]);
  const poller = new TelegramPoller(deps);
  poller.start();
  await new Promise((r) => setTimeout(r, 10));
  const callbacks = seen.filter((s) => s.kind === "cb");
  assert.equal(callbacks.length, 1);
  assert.equal(callbacks[0].callbackQueryId, "q1");
  assert.equal(getOffset(), 12); // max update_id + 1, even though q2 was foreign
});

test("recovers from a getUpdates error via backoff", async () => {
  let call = 0;
  let active = true;
  const seen: any[] = [];
  const poller = new TelegramPoller({
    getUpdates: async () => {
      call += 1;
      if (call === 1) throw new Error("409 Conflict");
      active = false;
      return [{ update_id: 5, callback_query: { id: "q", data: "v1:i:approve", message: { message_id: 1, chat: { id: 1 } } } }];
    },
    chatId: () => "1",
    onCallback: async (cb) => seen.push(cb),
    loadOffset: () => 0,
    saveOffset: () => {},
    isActive: () => active,
    sleep: async () => {}
  });
  poller.start();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(seen.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
import { TelegramUpdate } from "../platform/telegramApi";

export interface PollerDeps {
  getUpdates(offset: number, timeoutSec: number): Promise<TelegramUpdate[]>;
  chatId(): string;
  onCallback(cb: { callbackQueryId: string; data: string; chatId: string; messageId?: number }): void | Promise<void>;
  loadOffset(): number;
  saveOffset(n: number): void;
  isActive(): boolean;
  sleep?(ms: number): Promise<void>;
  longPollSec?: number;
}

const DEFAULT_LONG_POLL_SEC = 25;
const BACKOFF_MS = 3000;

export class TelegramPoller {
  private looping = false;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: PollerDeps) {
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get running(): boolean {
    return this.looping;
  }

  start(): void {
    if (this.looping) {
      return;
    }
    this.looping = true;
    void this.loop();
  }

  stop(): void {
    this.looping = false;
  }

  private async loop(): Promise<void> {
    while (this.looping && this.deps.isActive()) {
      try {
        const offset = this.deps.loadOffset();
        const updates = await this.deps.getUpdates(offset, this.deps.longPollSec ?? DEFAULT_LONG_POLL_SEC);
        for (const update of updates) {
          this.deps.saveOffset(update.update_id + 1);
          const cq = update.callback_query;
          if (!cq?.data || !cq.message) {
            continue;
          }
          if (String(cq.message.chat.id) !== this.deps.chatId()) {
            continue; // foreign chat — ignore but offset already advanced
          }
          await this.deps.onCallback({
            callbackQueryId: cq.id,
            data: cq.data,
            chatId: String(cq.message.chat.id),
            messageId: cq.message.message_id
          });
        }
      } catch {
        await this.sleep(BACKOFF_MS);
      }
    }
    this.looping = false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/permission/TelegramPoller.ts test/permission/telegramPoller.test.ts
git commit -m "feat(#3): getUpdates poller with chatId validation and backoff"
```

---

## Task 7: Ingress /permission and /decision routes

**Files:**
- Modify: `src/ingress/IngressServer.ts`
- Test: `test/ingress/ingressServer.test.ts` (add cases)

**Interfaces:**
- Produces: `IngressServer` second constructor arg `permission?: { create(payload: unknown): Promise<{ id: string }> | { id: string }; decision(id: string): { status: string } }`. `POST /permission` → 200 `{id}`; `GET /decision/:id` → 200 `{status}`; both 404 when `permission` is absent. `POST /alert` unchanged.

- [ ] **Step 1: Write the failing test (append to the existing file)**

```ts
async function get(port: number, path: string) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

test("POST /permission returns an id and GET /decision/:id returns status", async () => {
  let seen: unknown;
  const server = new IngressServer(() => {}, {
    create: (p) => { seen = p; return { id: "pid-1" }; },
    decision: (id) => ({ status: id === "pid-1" ? "allow" : "expired" })
  });
  await server.start(0 as unknown as number);
  const port = server.port();
  const post = await fetch(`http://127.0.0.1:${port}/permission`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hook_event_name: "PermissionRequest" })
  });
  const posted = await post.json();
  const decided = await get(port, "/decision/pid-1");
  const unknown = await get(port, "/decision/nope");
  await server.stop();
  assert.deepEqual(seen, { hook_event_name: "PermissionRequest" });
  assert.equal(posted.id, "pid-1");
  assert.deepEqual(decided.body, { status: "allow" });
  assert.deepEqual(unknown.body, { status: "expired" });
});

test("permission routes 404 when no permission handler is provided", async () => {
  const server = new IngressServer(() => {});
  await server.start(0 as unknown as number);
  const res = await fetch(`http://127.0.0.1:${server.port()}/decision/x`);
  await server.stop();
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Modify `IngressServer`**

Replace the class with this (keeps `/alert` behavior identical):

```ts
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";

type PayloadHandler = (payload: unknown) => void;

export interface PermissionRoutes {
  create(payload: unknown): Promise<{ id: string }> | { id: string };
  decision(id: string): { status: string };
}

export class IngressServer {
  private server: Server | undefined;

  constructor(
    private readonly onPayload: PayloadHandler,
    private readonly permission?: PermissionRoutes
  ) {}

  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => this.handle(req, res));
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.removeListener("error", reject);
        this.server = server;
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
      this.server = undefined;
    });
  }

  port(): number {
    const address = this.server?.address();
    return address && typeof address === "object" ? address.port : 0;
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? "";
    if (req.method === "POST" && url === "/alert") {
      this.readBody(req, (payload) => {
        if (payload === undefined) {
          res.writeHead(400).end();
          return;
        }
        this.onPayload(payload);
        res.writeHead(202).end();
      });
      return;
    }
    if (this.permission && req.method === "POST" && url === "/permission") {
      this.readBody(req, async (payload) => {
        if (payload === undefined) {
          res.writeHead(400).end();
          return;
        }
        try {
          const { id } = await this.permission!.create(payload);
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id }));
        } catch {
          res.writeHead(500).end();
        }
      });
      return;
    }
    if (this.permission && req.method === "GET" && url.startsWith("/decision/")) {
      const id = decodeURIComponent(url.slice("/decision/".length));
      const { status } = this.permission.decision(id);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status }));
      return;
    }
    res.writeHead(404).end();
  }

  private readBody(req: IncomingMessage, done: (payload: unknown) => void): void {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        done(JSON.parse(body || "{}"));
      } catch {
        done(undefined);
      }
    });
  }
}
```

- [ ] **Step 4: Run the ingress tests** — Expected: PASS (old + new).

Run: `node --import tsx --test test/ingress/ingressServer.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/ingress/IngressServer.ts test/ingress/ingressServer.test.ts
git commit -m "feat(#3): ingress POST /permission and GET /decision routes"
```

---

## Task 8: permissionController (createPermissionSystem)

**Files:**
- Create: `src/permission/permissionController.ts`
- Test: `test/permission/permissionController.test.ts`

**Interfaces:**
- Consumes: `PendingDecisionStore` (T4), `AllowRules`/`PermissionInfo` (T2), `extractPermissionInfo` (T3), `TelegramApi`/`InlineButton` (T5), `parseCallback` (T1), `Alert`/`createAlert` (model), `MuteController`.
- Produces:
  ```ts
  interface PermissionDeps {
    store: PendingDecisionStore;
    allowRules: AllowRules;
    api: () => TelegramApi;              // built from current bot token
    enabled: () => boolean;              // telegram.enabled && twoWay && token && chatId
    chatId: () => string;
    ttlMs: () => number;
    messageFor: (payload: unknown) => string;   // display text (reuse detector)
    showPcPrompt: (text: string, resolve: (d: "allow" | "deny") => void) => () => void;
    muteFor: (ms: number) => void;
    muteMs: () => number;
    log: (msg: string) => void;
  }
  interface PermissionSystem {
    create(payload: unknown): Promise<{ id: string }>;
    decision(id: string): { status: string };
    handleCallback(cb: { callbackQueryId: string; data: string }): Promise<void>;
  }
  function createPermissionSystem(deps: PermissionDeps): PermissionSystem;
  ```
- Behavior:
  - `create`: if `!enabled()` → return a fresh unknown id (store not touched) so the hook's poll reads `expired` → native dialog. If `allowRules.matches(info)` → `store.create` then immediate `resolve("allow")` (no send, no prompt). Otherwise `store.create(ttl)`, then in the background: send the inline-keyboard Telegram message (record `message_id`), show the PC prompt, and register an `onChange`/timeout bridge that edits the message + dismisses the prompt on resolve/expiry. Always returns `{id}` promptly.
  - `handleCallback`: `parseCallback(data)`; `approve`→resolve allow; `deny`→resolve deny; `remember`→`allowRules.remember(info)` + resolve allow; `mute`→`muteFor(muteMs())`; then `api().answerCallbackQuery`. Needs the `PermissionInfo` for `remember` — store it alongside the pending entry (see Step 3).

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPermissionSystem } from "../../src/permission/permissionController";
import { PendingDecisionStore } from "../../src/permission/PendingDecisionStore";
import { AllowRules } from "../../src/permission/AllowRules";

function setup(overrides: Partial<Parameters<typeof createPermissionSystem>[0]> = {}) {
  const sent: any[] = [];
  const edits: any[] = [];
  const answered: any[] = [];
  const prompts: any[] = [];
  let n = 0;
  const store = new PendingDecisionStore({ idGen: () => `id${++n}` });
  const allowRules = new AllowRules();
  const api = () => ({
    sendMessage: async (chatId: string, text: string, keyboard: any) => { sent.push({ chatId, text, keyboard }); return { message_id: 7 }; },
    editMessageText: async (chatId: string, messageId: number, text: string) => { edits.push({ messageId, text }); },
    answerCallbackQuery: async (id: string, text?: string) => { answered.push({ id, text }); },
    getUpdates: async () => []
  });
  const sys = createPermissionSystem({
    store, allowRules, api,
    enabled: () => true, chatId: () => "C", ttlMs: () => 300000,
    messageFor: () => "Bash: npm run test",
    showPcPrompt: (_t, _r) => { prompts.push(_r); return () => prompts.push("dismissed"); },
    muteFor: () => sent.push({ muted: true }), muteMs: () => 1000,
    log: () => {},
    ...overrides
  });
  return { sys, store, allowRules, sent, edits, answered, prompts };
}

const payload = { hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "npm run test" } };

test("normal path registers pending and sends an inline-keyboard message", async () => {
  const { sys, store, sent } = setup();
  const { id } = await sys.create(payload);
  assert.equal(store.status(id), "pending");
  await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].keyboard.length, 2); // two rows of buttons
});

test("approve callback resolves allow and edits the message", async () => {
  const { sys, store, edits, answered } = setup();
  const { id } = await sys.create(payload);
  await new Promise((r) => setImmediate(r));
  await sys.handleCallback({ callbackQueryId: "q", data: `v1:${id}:approve` });
  assert.equal(store.status(id), "allow");
  assert.equal(answered.length, 1);
  assert.ok(edits.some((e) => /approv/i.test(e.text)));
});

test("remember resolves allow and auto-approves the next identical request", async () => {
  const { sys, store, allowRules, sent } = setup();
  const { id } = await sys.create(payload);
  await new Promise((r) => setImmediate(r));
  await sys.handleCallback({ callbackQueryId: "q", data: `v1:${id}:remember` });
  assert.equal(store.status(id), "allow");
  const before = sent.length;
  const second = await sys.create(payload);              // should auto-resolve, no new send
  assert.equal(store.status(second.id), "allow");
  assert.equal(sent.length, before);
});

test("disabled telegram yields an expired (unknown) id → native dialog", async () => {
  const { sys, store } = setup({ enabled: () => false });
  const { id } = await sys.create(payload);
  assert.equal(store.status(id), "expired");
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
import { PendingDecisionStore } from "./PendingDecisionStore";
import { AllowRules, PermissionInfo } from "./AllowRules";
import { extractPermissionInfo } from "./permissionRequest";
import { parseCallback } from "./callbackData";
import { encodeCallback } from "./callbackData";
import { InlineButton, TelegramApi } from "../platform/telegramApi";
import { newId } from "../util/id";

export interface PermissionDeps {
  store: PendingDecisionStore;
  allowRules: AllowRules;
  api: () => TelegramApi;
  enabled: () => boolean;
  chatId: () => string;
  ttlMs: () => number;
  messageFor: (payload: unknown) => string;
  showPcPrompt: (text: string, resolve: (d: "allow" | "deny") => void) => () => void;
  muteFor: (ms: number) => void;
  muteMs: () => number;
  log: (msg: string) => void;
}

export interface PermissionSystem {
  create(payload: unknown): Promise<{ id: string }>;
  decision(id: string): { status: string };
  handleCallback(cb: { callbackQueryId: string; data: string }): Promise<void>;
}

function keyboard(id: string): InlineButton[][] {
  return [
    [
      { text: "✅ Approve", callback_data: encodeCallback(id, "approve") },
      { text: "⛔ Deny", callback_data: encodeCallback(id, "deny") }
    ],
    [
      { text: "✅ Approve & remember", callback_data: encodeCallback(id, "remember") },
      { text: "🔕 Mute", callback_data: encodeCallback(id, "mute") }
    ]
  ];
}

export function createPermissionSystem(deps: PermissionDeps): PermissionSystem {
  // Live pending context, keyed by decision id, needed by handleCallback.
  const context = new Map<string, { info: PermissionInfo | null; messageId?: number; dismissPc?: () => void; done: boolean }>();

  const finish = async (id: string, outcome: string): Promise<void> => {
    const ctx = context.get(id);
    if (!ctx || ctx.done) {
      return;
    }
    ctx.done = true;
    ctx.dismissPc?.();
    if (ctx.messageId !== undefined) {
      try {
        await deps.api().editMessageText(deps.chatId(), ctx.messageId, outcome);
      } catch (e) {
        deps.log(`edit message failed: ${String(e)}`);
      }
    }
    context.delete(id);
  };

  return {
    async create(payload) {
      if (!deps.enabled()) {
        return { id: newId() }; // not registered → poll reads "expired" → native dialog
      }
      const info = extractPermissionInfo(payload);
      if (info && deps.allowRules.matches(info)) {
        const id = deps.store.create(deps.ttlMs());
        deps.store.resolve(id, "allow");
        return { id }; // silent auto-approve, no send/prompt
      }
      const id = deps.store.create(deps.ttlMs());
      const text = deps.messageFor(payload);
      const ctx: { info: PermissionInfo | null; messageId?: number; dismissPc?: () => void; done: boolean } = { info, done: false };
      context.set(id, ctx);

      const off = deps.store.onChange(() => {
        const status = deps.store.status(id);
        if (status === "allow") { off(); void finish(id, `✅ ${text}\n\nApproved`); }
        else if (status === "deny") { off(); void finish(id, `⛔ ${text}\n\nDenied`); }
      });
      setTimeout(() => {
        if (deps.store.status(id) === "expired") { off(); void finish(id, `⏱ ${text}\n\nTimed out — answer on your computer`); }
      }, deps.ttlMs() + 1000);

      ctx.dismissPc = deps.showPcPrompt(text, (d) => deps.store.resolve(id, d));
      deps.api()
        .sendMessage(deps.chatId(), `🔔 Permission needed\n${text}`, keyboard(id))
        .then((res) => { ctx.messageId = res.message_id; })
        .catch((e) => deps.log(`send message failed: ${String(e)}`));

      return { id };
    },

    decision(id) {
      return { status: deps.store.status(id) };
    },

    async handleCallback({ callbackQueryId, data }) {
      const parsed = parseCallback(data);
      if (!parsed) {
        return;
      }
      const ctx = context.get(parsed.id);
      let note: string | undefined;
      switch (parsed.choice) {
        case "approve":
          if (!deps.store.resolve(parsed.id, "allow")) note = "Already handled";
          break;
        case "deny":
          if (!deps.store.resolve(parsed.id, "deny")) note = "Already handled";
          break;
        case "remember":
          if (ctx?.info) deps.allowRules.remember(ctx.info);
          if (!deps.store.resolve(parsed.id, "allow")) note = "Already handled";
          else note = "Will remember";
          break;
        case "mute":
          deps.muteFor(deps.muteMs());
          note = "Alerts muted";
          break;
      }
      try {
        await deps.api().answerCallbackQuery(callbackQueryId, note);
      } catch (e) {
        deps.log(`answerCallbackQuery failed: ${String(e)}`);
      }
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/permission/permissionController.ts test/permission/permissionController.test.ts
git commit -m "feat(#3): permission controller tying store, Telegram, and PC prompt together"
```

---

## Task 9: Blocking hook scripts

**Files:**
- Create: `hooks/permission-hook.sh`, `hooks/permission-hook.cmd`, `hooks/permission-hook.ps1`
- Test: `test/hooks/permissionHook.test.ts`

**Interfaces:**
- Consumes: `POST /permission` → `{id}`, `GET /decision/:id` → `{status}` (Task 7).
- Produces: on stdout, the PermissionRequest decision JSON for `allow`/`deny`, or nothing for `pending`-timeout/`expired`/no-listener. Scripts contain the literal port `51789` (the installer substitutes the active port).

- [ ] **Step 1: Write the failing test** (POSIX-guarded integration against a stub server)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = path.join(root, "hooks", "permission-hook.sh");

function stub(decisionSequence: string[]) {
  let i = 0;
  return createServer((req, res) => {
    if (req.method === "POST" && req.url === "/permission") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: "test-id" }));
    } else if (req.url?.startsWith("/decision/")) {
      const status = decisionSequence[Math.min(i++, decisionSequence.length - 1)];
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status }));
    } else {
      res.writeHead(404).end();
    }
  });
}

async function runHook(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", [script], { env: { ...process.env, AICA_PORT: String(port) } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", () => resolve(out.trim()));
    child.stdin.end(JSON.stringify({ hook_event_name: "PermissionRequest", tool_name: "Bash" }));
  });
}

test("emits allow decision JSON when the extension approves", { skip: process.platform === "win32" }, async () => {
  const server = stub(["pending", "allow"]);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;
  const out = await runHook(port);
  server.close();
  assert.match(out, /"behavior":"allow"/);
});

test("emits nothing on expired (falls back to native dialog)", { skip: process.platform === "win32" }, async () => {
  const server = stub(["expired"]);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;
  const out = await runHook(port);
  server.close();
  assert.equal(out, "");
});
```

> Note: the test injects the port via `AICA_PORT` so it can target the stub. The script uses `${AICA_PORT:-51789}` so the installer's `51789` substitution still works in production and the env override works in tests.

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL (script missing).

Run: `node --import tsx --test test/hooks/permissionHook.test.ts`

- [ ] **Step 3: Write `hooks/permission-hook.sh`**

```sh
#!/bin/sh
# Two-way permission hook. Reads the PermissionRequest payload on stdin, asks the
# AI Coding Alerts extension for an approve/deny decision (via Telegram), and
# returns it to Claude Code. No listener or a timeout → no output → native dialog.
PORT="${AICA_PORT:-51789}"
BASE="http://127.0.0.1:$PORT"
ID=$(curl -s --connect-timeout 1 --max-time 5 -X POST "$BASE/permission" \
  -H "content-type: application/json" -d @- \
  | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[ -z "$ID" ] && exit 0
i=0
while [ "$i" -lt 160 ]; do
  STATUS=$(curl -s --max-time 10 "$BASE/decision/$ID" \
    | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  case "$STATUS" in
    allow) printf '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}\n'; exit 0 ;;
    deny)  printf '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny"}}}\n'; exit 0 ;;
    pending) ;;
    *) exit 0 ;;
  esac
  sleep 2
  i=$((i + 1))
done
exit 0
```

- [ ] **Step 4: Write `hooks/permission-hook.ps1`** (Windows logic; robust JSON via Invoke-RestMethod)

```powershell
$ErrorActionPreference = "Stop"
$port = if ($env:AICA_PORT) { $env:AICA_PORT } else { "51789" }
$base = "http://127.0.0.1:$port"
$payload = [Console]::In.ReadToEnd()
try {
  $res = Invoke-RestMethod -Uri "$base/permission" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 5
  $id = $res.id
} catch { exit 0 }
if (-not $id) { exit 0 }
for ($i = 0; $i -lt 160; $i++) {
  try { $d = Invoke-RestMethod -Uri "$base/decision/$id" -TimeoutSec 10 } catch { exit 0 }
  switch ($d.status) {
    "allow"   { Write-Output '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'; exit 0 }
    "deny"    { Write-Output '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny"}}}'; exit 0 }
    "pending" { }
    default   { exit 0 }
  }
  Start-Sleep -Seconds 2
}
exit 0
```

- [ ] **Step 5: Write `hooks/permission-hook.cmd`** (thin wrapper; passes stdin through to the ps1)

```bat
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0permission-hook.ps1"
```

- [ ] **Step 6: Run the hook test** — Expected: PASS on POSIX (the two `.sh` cases); the file has no Windows-only cases, so CI stays green. Manually verify the `.cmd`/`.ps1` on the developer's Windows box.

- [ ] **Step 7: Commit**

```bash
git add hooks/permission-hook.sh hooks/permission-hook.ps1 hooks/permission-hook.cmd test/hooks/permissionHook.test.ts
git commit -m "feat(#3): blocking permission hook scripts (sh + cmd/ps1)"
```

---

## Task 10: Installer wiring for the permission hook

**Files:**
- Modify: `src/setup/hookCommands.ts`, `src/setup/hooksMerge.ts`, `src/setup/HookInstaller.ts`
- Test: `test/setup/hookCommands.test.ts`, `test/setup/hooksMerge.test.ts` (add cases)

**Interfaces:**
- `PermissionRequest` now maps to the `permission-hook` script (no kind arg). `mergeHooks` recognizes `permission-hook.(cmd|sh)` and `/permission`/`/decision` URLs as ours. `HookInstaller` deploys the three new scripts with port substitution.

- [ ] **Step 1: Write the failing tests**

Add to `test/setup/hookCommands.test.ts`:

```ts
import { desiredHooks, hookCommand } from "../../src/setup/hookCommands";

test("PermissionRequest maps to the blocking permission hook", () => {
  const hooks = desiredHooks("linux", "/home/u/.ai-coding-alerts");
  const pr = hooks.find((h) => h.event === "PermissionRequest");
  assert.ok(pr);
  assert.match(pr!.command, /permission-hook\.sh"$/);
  assert.doesNotMatch(pr!.command, /alert-hook/);
});

test("windows permission command uses the .cmd with a quoted path and no kind arg", () => {
  assert.equal(hookCommand("win32", "C:/Users/u/.ai-coding-alerts", "permission"), `"C:\\Users\\u\\.ai-coding-alerts\\permission-hook.cmd"`);
});
```

Add to `test/setup/hooksMerge.test.ts`:

```ts
test("recognizes and replaces a stale permission-hook entry", () => {
  const settings = { hooks: { PermissionRequest: [{ hooks: [{ type: "command", command: '"/x/permission-hook.sh"' }] }] } };
  const desired = [{ event: "PermissionRequest", command: '"/new/permission-hook.sh"' }];
  const merged = mergeHooks(settings, desired);
  const entries = (merged.settings.hooks as any).PermissionRequest;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].hooks[0].command, '"/new/permission-hook.sh"');
});
```

- [ ] **Step 2: Run tests to verify they fail** — Expected: FAIL.

- [ ] **Step 3: Update `hookCommands.ts`**

```ts
import { Os } from "../platform/Platform";

export type AlertKind = "popup" | "finished" | "activity" | "permission";

export interface DesiredHook {
  event: string;
  matcher?: string;
  command: string;
}

const EVENTS: Array<{ event: string; matcher?: string; kind: AlertKind }> = [
  { event: "Notification", kind: "popup" },
  { event: "PermissionRequest", kind: "permission" },
  { event: "PostToolUse", matcher: "Bash|Write|Edit|NotebookEdit", kind: "activity" },
  { event: "Stop", kind: "finished" }
];

export function hookCommand(os: Os, scriptsDir: string, kind: AlertKind): string {
  const script = kind === "permission" ? "permission-hook" : "alert-hook";
  const arg = kind === "permission" ? "" : ` ${kind}`;
  if (os === "win32") {
    return `"${scriptsDir.replace(/\//g, "\\")}\\${script}.cmd"${arg}`;
  }
  return `"${scriptsDir}/${script}.sh"${arg}`;
}

export function desiredHooks(os: Os, scriptsDir: string): DesiredHook[] {
  return EVENTS.map(({ event, matcher, kind }) => ({
    event,
    matcher,
    command: hookCommand(os, scriptsDir, kind)
  }));
}
```

- [ ] **Step 4: Update the `OUR_COMMAND` regex in `hooksMerge.ts`**

```ts
const OUR_COMMAND = /alert-hook\.(cmd|sh)|permission-hook\.(cmd|sh)|127\.0\.0\.1:\d+\/(alert|permission|decision)/;
```

- [ ] **Step 5: Add the new scripts to `HookInstaller.ts`**

```ts
const SCRIPTS = [
  "alert-hook.cmd", "alert-fallback.ps1", "alert-hook.sh", "alert-fallback.sh",
  "permission-hook.cmd", "permission-hook.ps1", "permission-hook.sh"
];
```

- [ ] **Step 6: Run the setup tests** — Expected: PASS.

Run: `node --import tsx --test test/setup/hookCommands.test.ts test/setup/hooksMerge.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/setup/hookCommands.ts src/setup/hooksMerge.ts src/setup/HookInstaller.ts test/setup/hookCommands.test.ts test/setup/hooksMerge.test.ts
git commit -m "feat(#3): register the blocking PermissionRequest hook in setup"
```

---

## Task 11: Config settings + package.json contributions

**Files:**
- Modify: `src/config/ConfigService.ts`, `package.json`
- Test: `test/config/permissionConfig.test.ts` (pure defaults check via a fake `vscode` is heavy; instead assert the shape through a small pure helper — see Step 1)

**Interfaces:**
- Produces on `AlertSettings`: `permissionTimeoutSec: number` (default 300), `telegramMuteMinutes: number` (default 480), and `telegram.twoWay: boolean` (default true).

- [ ] **Step 1: Write the failing test**

Extract the default-reading into a pure helper so it is testable without the `vscode` module:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAlertSettings } from "../../src/config/readAlertSettings";

test("reads new permission settings with defaults", () => {
  const get = <T>(_key: string, fallback: T): T => fallback; // simulate no user overrides
  const s = readAlertSettings(get);
  assert.equal(s.permissionTimeoutSec, 300);
  assert.equal(s.telegramMuteMinutes, 480);
  assert.equal(s.telegram.twoWay, true);
});

test("honors user overrides", () => {
  const overrides: Record<string, unknown> = { permissionTimeoutSec: 120, enableTelegramTwoWay: false };
  const get = <T>(key: string, fallback: T): T => (key in overrides ? (overrides[key] as T) : fallback);
  const s = readAlertSettings(get);
  assert.equal(s.permissionTimeoutSec, 120);
  assert.equal(s.telegram.twoWay, false);
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Refactor `ConfigService` to delegate to a pure reader**

Create `src/config/readAlertSettings.ts`:

```ts
import { SoundChoices } from "./soundResolver";

export interface AlertSettings extends SoundChoices {
  port: number;
  popupAlertDelay: number;
  finishedAlertDelay: number;
  enableOsNotification: boolean;
  enableWindowFocus: boolean;
  telegram: { enabled: boolean; botToken: string; chatId: string; twoWay: boolean };
  permissionTimeoutSec: number;
  telegramMuteMinutes: number;
  escalationRepeats: number;
  escalationInterval: number;
}

export type Getter = <T>(key: string, fallback: T) => T;

export function readAlertSettings(get: Getter): AlertSettings {
  return {
    port: get("port", 51789),
    popupAlertDelay: get("popupAlertDelay", 3),
    finishedAlertDelay: get("finishedAlertDelay", 10),
    popup: { sound: get("popupSound", "alarm"), customSoundPath: get("popupCustomSoundPath", ""), enabled: get("enablePopupSound", true) },
    finished: { sound: get("finishedSound", "chime"), customSoundPath: get("finishedCustomSoundPath", ""), enabled: get("enableFinishedSound", true) },
    enableOsNotification: get("enableOsNotification", true),
    enableWindowFocus: get("enableWindowFocus", true),
    telegram: {
      enabled: get("enableTelegramPush", false),
      botToken: get("telegramBotToken", ""),
      chatId: get("telegramChatId", ""),
      twoWay: get("enableTelegramTwoWay", true)
    },
    permissionTimeoutSec: get("permissionTimeoutSec", 300),
    telegramMuteMinutes: get("telegramMuteMinutes", 480),
    escalationRepeats: get("escalationRepeats", 3),
    escalationInterval: get("escalationInterval", 30)
  };
}
```

Update `src/config/ConfigService.ts` to use it (and re-export `AlertSettings` from the new file for existing importers):

```ts
import * as vscode from "vscode";
import { AlertSettings, readAlertSettings } from "./readAlertSettings";

export type { AlertSettings } from "./readAlertSettings";

const SECTION = "aiCodingAlerts";

export class ConfigService {
  read(): AlertSettings {
    const config = vscode.workspace.getConfiguration(SECTION);
    return readAlertSettings(<T>(key: string, fallback: T) => config.get<T>(key, fallback));
  }

  onDidChange(listener: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) {
        listener();
      }
    });
  }
}
```

- [ ] **Step 4: Add the `package.json` configuration properties** under `contributes.configuration.properties` (alongside the existing `aiCodingAlerts.*` keys):

```json
"aiCodingAlerts.enableTelegramTwoWay": {
  "type": "boolean", "default": true,
  "description": "Let Telegram Approve/Deny buttons answer an agent's permission request. Requires a bot token and chat id."
},
"aiCodingAlerts.permissionTimeoutSec": {
  "type": "number", "default": 300,
  "description": "How long to wait for a Telegram (or on-screen) decision before falling back to Claude Code's normal permission prompt."
},
"aiCodingAlerts.telegramMuteMinutes": {
  "type": "number", "default": 480,
  "description": "How long the Telegram 'Mute' button silences alerts."
}
```

- [ ] **Step 5: Run the config test and the full suite** — Expected: PASS.

Run: `node --import tsx --test test/config/permissionConfig.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/config/readAlertSettings.ts src/config/ConfigService.ts package.json test/config/permissionConfig.test.ts
git commit -m "feat(#3): permission timeout, two-way toggle, and mute-duration settings"
```

---

## Task 12: Wire the permission system into activate()

**Files:**
- Modify: `src/extension.ts`
- Test: manual/integration (activate() is not unit-tested today; all logic lives in the tested modules above). Guard: `npm test` stays green and `npm run build` succeeds.

**Interfaces:**
- Consumes: everything above. Constructs the store, allow-rules, Telegram API factory, poller, and `createPermissionSystem`; passes the system's `create`/`decision` as the second `IngressServer` argument; feeds poller callbacks into `system.handleCallback`; routes the Telegram `Mute` through the existing `MuteController` and refreshes the status bar.

- [ ] **Step 1: Add construction after the existing `mute`/`config` setup** (near line 62), before `IngressServer` is created

```ts
import { PendingDecisionStore } from "./permission/PendingDecisionStore";
import { AllowRules } from "./permission/AllowRules";
import { TelegramPoller } from "./permission/TelegramPoller";
import { createPermissionSystem } from "./permission/permissionController";
import { createTelegramApi } from "./platform/telegramApi";
```

```ts
const decisions = new PendingDecisionStore();
const allowRules = new AllowRules();
const telegramApiFor = () => createTelegramApi(config.read().telegram.botToken);
const twoWayEnabled = () => {
  const t = config.read().telegram;
  return t.enabled && t.twoWay && t.botToken.trim() !== "" && t.chatId.trim() !== "";
};

const permissionSystem = createPermissionSystem({
  store: decisions,
  allowRules,
  api: telegramApiFor,
  enabled: twoWayEnabled,
  chatId: () => config.read().telegram.chatId.trim(),
  ttlMs: () => config.read().permissionTimeoutSec * 1000,
  messageFor: (payload) => registry.detect(payload)?.message ?? "Permission needed",
  showPcPrompt: (text, resolve) => {
    let live = true;
    void vscode.window
      .showInformationMessage(`Claude Code — ${text}`, "Approve", "Deny")
      .then((choice) => {
        if (live && choice === "Approve") resolve("allow");
        else if (live && choice === "Deny") resolve("deny");
      });
    return () => { live = false; }; // best-effort: VS Code notifications can't be force-closed; stale clicks are ignored by first-wins
  },
  muteFor: (ms) => { mute.muteFor(ms); updateMuteStatus(); },
  muteMs: () => config.read().telegramMuteMinutes * 60 * 1000,
  log: (msg) => output.appendLine(msg)
});

const poller = new TelegramPoller({
  getUpdates: (offset, timeoutSec) => telegramApiFor().getUpdates(offset, timeoutSec),
  chatId: () => config.read().telegram.chatId.trim(),
  onCallback: (cb) => permissionSystem.handleCallback(cb),
  loadOffset: () => context.globalState.get<number>("aiCodingAlerts.tgOffset", 0),
  saveOffset: (n) => void context.globalState.update("aiCodingAlerts.tgOffset", n),
  isActive: () => twoWayEnabled() && decisions.pendingCount() > 0
});
decisions.onChange(() => { if (twoWayEnabled() && decisions.pendingCount() > 0) poller.start(); });
```

> `updateMuteStatus` is declared later in `activate()`; move the `permissionSystem`/`showPcPrompt` construction to **after** `updateMuteStatus` is defined (just after line 168), or hoist `updateMuteStatus` above this block. Hoisting is cleaner — declare `updateMuteStatus` before the permission block.

- [ ] **Step 2: Pass the permission routes into `IngressServer`** — change both constructions (initial and the config-change reconnect) from `new IngressServer(handlePayload)` to:

```ts
new IngressServer(handlePayload, {
  create: (payload) => permissionSystem.create(payload),
  decision: (id) => permissionSystem.decision(id)
})
```

- [ ] **Step 3: Kick the poller when a decision is created** — the `decisions.onChange` above starts it on resolve, but it must also start on *create*. Since `create` doesn't emit `onChange`, start the poller inside the ingress `create` wrapper:

```ts
const permissionRoutes = {
  create: async (payload: unknown) => {
    const res = await permissionSystem.create(payload);
    if (twoWayEnabled() && decisions.pendingCount() > 0) poller.start();
    return res;
  },
  decision: (id: string) => permissionSystem.decision(id)
};
```

Use `permissionRoutes` in both `IngressServer` constructions.

- [ ] **Step 4: Run the full suite and build**

Run: `npm test && npm run build`
Expected: all tests PASS; build exits 0. (Watch for the HeroUI-style `client-only`/import traps — none expected here since this is the extension, not `web/`.)

- [ ] **Step 5: Manual smoke test** (documented, not automated)

Load the extension (F5), set a Telegram bot token + chat id, enable push, install hooks, and from a Claude Code session trigger a permission prompt. Confirm: phone message with four buttons; Approve lets the tool run; Deny blocks it; PC notification resolves the same decision; no response for 5 min → native dialog. Verify `Approve & remember` silences the next identical request, and `Mute` mutes.

- [ ] **Step 6: Commit**

```bash
git add src/extension.ts
git commit -m "feat(#3): wire two-way permission system into extension activation"
```

---

## Final Verification

- [ ] `npm test` — full suite green (existing + new permission/ingress/setup/config/hook tests).
- [ ] `npm run build` — esbuild exits 0.
- [ ] Manual smoke test (Task 12, Step 5) confirms the end-to-end phone→agent flow.
- [ ] Request a whole-branch code review (subagent-driven-development final review), then finish the branch via `superpowers:finishing-a-development-branch`.

---

## Self-Review Notes (author)

- **Spec coverage:** blocking transport (T7, T9), PermissionRequest gating (T9 output JSON), four buttons (T8 keyboard + T8 handleCallback), timeout→native (T9 expired path + T8 timeout edit), single-broker/poll-while-pending (T12 `isActive`), chatId validation (T6), remember (T2, T8), Mute (T8, T12), message editing (T8 `finish`), security (T6 validation, T1 structured data). All spec sections map to a task.
- **Type consistency:** `PermissionInfo` (T2) is consumed by T3/T8; `TelegramUpdate` (T5) by T6; `PendingDecisionStore` API stable across T4/T8/T12; `PermissionRoutes` (T7) matches the object built in T12.
- **Known limitation (documented):** VS Code `showInformationMessage` can't be programmatically dismissed, so on a phone decision the PC notification remains visible until clicked; the stale click is a no-op via first-wins. Acceptable for v1; a StatusBarItem-based prompt could replace it later if desired.
- **Open items from the spec** (payload field re-verification, installer settings scope) are covered by the tests in T3/T10 and the manual smoke test in T12.
