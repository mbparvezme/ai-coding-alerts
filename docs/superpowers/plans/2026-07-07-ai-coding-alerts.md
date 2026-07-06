# AI Coding Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a publishable VS Code extension that alerts the developer (sound + OS notification + window focus) when an AI coding agent starts waiting for a permission confirmation, with an alert-history panel and a stats dashboard.

**Architecture:** A local HTTP server receives agent hook POSTs. A detector-strategy registry normalizes each payload into a platform-neutral `Alert`. An `AlertBus` fans the `Alert` out to independent reactors (sound, OS notification, window focus, history). Sound/notification/focus each resolve to a per-OS `{command,args}` from a pure builder run with a detached `spawn`. Two sidebar webviews render history and stats.

**Tech Stack:** TypeScript, esbuild, `@types/vscode`, Node built-in `node:http`/`node:child_process`, Node built-in test runner (`node:test`) run through `tsx`.

## Global Constraints

- Publisher: `mbparvezme`. Extension id: `ai-coding-alerts`.
- All settings namespaced under `aiCodingAlerts.`.
- Default port: `51789`.
- No unnecessary comments or code; code must read as human-written; follow clean-code / SOLID.
- Pure logic modules (model, detection, stats, bus, all command builders, ingress) MUST NOT import `vscode`, so they run under `node:test`.
- Modules that need VS Code state receive it by dependency injection (e.g. `HistoryStore` takes a `KeyValueStore`).
- Target VS Code engine `^1.90.0`; Node 18+ runtime APIs only.
- Unit test command: `node --import tsx --test "test/**/*.test.ts"`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.js`
- Create: `.gitignore`
- Create: `.vscodeignore`
- Create: `.vscode/launch.json`
- Create: `.vscode/tasks.json`
- Create: `src/extension.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: an activatable extension whose `activate(context)` logs to an output channel; npm scripts `build`, `watch`, `test`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "ai-coding-alerts",
  "displayName": "AI Coding Alerts",
  "description": "Get a sound, an OS notification, and window focus when Claude Code or another AI agent is waiting for your confirmation.",
  "version": "0.1.0",
  "publisher": "mbparvezme",
  "engines": { "vscode": "^1.90.0" },
  "categories": ["Notebooks", "Other"],
  "keywords": ["claude", "claude code", "ai agent", "notification", "alert"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "scripts": {
    "build": "node esbuild.js",
    "watch": "node esbuild.js --watch",
    "vscode:prepublish": "node esbuild.js --production",
    "test": "node --import tsx --test \"test/**/*.test.ts\""
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/vscode": "^1.90.0",
    "esbuild": "^0.21.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "target": "ES2022",
    "lib": ["ES2022"],
    "sourceMap": true,
    "rootDir": ".",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `esbuild.js`**

```js
const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node18",
    outfile: "dist/extension.js",
    external: ["vscode"],
    sourcemap: !production,
    minify: production,
    logLevel: "info"
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
*.vsix
```

- [ ] **Step 5: Create `.vscodeignore`**

```
.vscode/**
docs/**
test/**
src/**
node_modules/**
esbuild.js
tsconfig.json
**/*.map
```

- [ ] **Step 6: Create `.vscode/launch.json`**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "npm: build"
    }
  ]
}
```

- [ ] **Step 7: Create `.vscode/tasks.json`**

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "build",
      "problemMatcher": "$esbuild",
      "group": { "kind": "build", "isDefault": true },
      "label": "npm: build"
    }
  ]
}
```

- [ ] **Step 8: Create `src/extension.ts`**

```ts
import * as vscode from "vscode";

let output: vscode.OutputChannel;

export function activate(_context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("AI Coding Alerts");
  output.appendLine("AI Coding Alerts activated");
}

export function deactivate(): void {
  output?.dispose();
}
```

- [ ] **Step 9: Install and build**

Run: `cd /d/ai-coding-alerts && npm install && npm run build`
Expected: `dist/extension.js` written, exit 0.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json esbuild.js .gitignore .vscodeignore .vscode src/extension.ts
git commit -m "chore: scaffold extension with esbuild build"
```

---

### Task 2: Alert model and id helper

**Files:**
- Create: `src/model/Alert.ts`
- Create: `src/util/id.ts`
- Test: `test/model/alert.test.ts`

**Interfaces:**
- Produces:
  - `type AlertStatus = "pending" | "approved" | "denied"`
  - `interface Alert { id: string; agent: string; type: string; message: string; receivedAt: number; status: AlertStatus; respondedAt?: number }`
  - `function createAlert(input: { agent: string; type: string; message: string; receivedAt?: number }): Alert` — fills `id` via `newId()`, `receivedAt` default `Date.now()`, `status: "pending"`.
  - `function newId(): string`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAlert } from "../../src/model/Alert";

test("createAlert defaults status to pending and generates an id", () => {
  const a = createAlert({ agent: "claude-code", type: "permission", message: "hi" });
  assert.equal(a.status, "pending");
  assert.equal(a.agent, "claude-code");
  assert.ok(a.id.length > 0);
  assert.ok(a.receivedAt <= Date.now());
});

test("createAlert honours an explicit receivedAt", () => {
  const a = createAlert({ agent: "x", type: "y", message: "z", receivedAt: 123 });
  assert.equal(a.receivedAt, 123);
});

test("newId values are unique", async () => {
  const { newId } = await import("../../src/util/id");
  assert.notEqual(newId(), newId());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test "test/model/alert.test.ts"`
Expected: FAIL — cannot find module `src/model/Alert`.

- [ ] **Step 3: Create `src/util/id.ts`**

```ts
import { randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID();
}
```

- [ ] **Step 4: Create `src/model/Alert.ts`**

```ts
import { newId } from "../util/id";

export type AlertStatus = "pending" | "approved" | "denied";

export interface Alert {
  id: string;
  agent: string;
  type: string;
  message: string;
  receivedAt: number;
  status: AlertStatus;
  respondedAt?: number;
}

export function createAlert(input: {
  agent: string;
  type: string;
  message: string;
  receivedAt?: number;
}): Alert {
  return {
    id: newId(),
    agent: input.agent,
    type: input.type,
    message: input.message,
    receivedAt: input.receivedAt ?? Date.now(),
    status: "pending"
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test "test/model/alert.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/model/Alert.ts src/util/id.ts test/model/alert.test.ts
git commit -m "feat: add Alert model and id helper"
```

---

### Task 3: Detection strategy (interface, Claude Code detector, registry)

**Files:**
- Create: `src/detection/AgentDetector.ts`
- Create: `src/detection/ClaudeCodeDetector.ts`
- Create: `src/detection/DetectorRegistry.ts`
- Test: `test/detection/claudeCodeDetector.test.ts`
- Test: `test/detection/detectorRegistry.test.ts`

**Interfaces:**
- Consumes: `Alert`, `createAlert` (Task 2).
- Produces:
  - `interface AgentDetector { readonly agent: string; canHandle(payload: unknown): boolean; parse(payload: unknown): Alert }`
  - `class ClaudeCodeDetector implements AgentDetector` — `agent = "claude-code"`.
  - `class DetectorRegistry { constructor(detectors: AgentDetector[]); detect(payload: unknown): Alert | undefined }` — returns the first detector's parse, or `undefined` if none match.

Claude Code `Notification` hook payload shape (from its hook stdin JSON): `{ hook_event_name: "Notification", message: string, ... }`. The detector matches on `hook_event_name === "Notification"` and maps `message` to the alert message, `type` to `"notification"`.

- [ ] **Step 1: Write the failing detector test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ClaudeCodeDetector } from "../../src/detection/ClaudeCodeDetector";

const detector = new ClaudeCodeDetector();

test("canHandle accepts a Notification hook payload", () => {
  assert.equal(detector.canHandle({ hook_event_name: "Notification", message: "x" }), true);
});

test("canHandle rejects unrelated payloads", () => {
  assert.equal(detector.canHandle({ hook_event_name: "Stop" }), false);
  assert.equal(detector.canHandle(null), false);
  assert.equal(detector.canHandle("nope"), false);
});

test("parse maps message and sets agent/type", () => {
  const alert = detector.parse({ hook_event_name: "Notification", message: "Waiting for permission" });
  assert.equal(alert.agent, "claude-code");
  assert.equal(alert.type, "notification");
  assert.equal(alert.message, "Waiting for permission");
  assert.equal(alert.status, "pending");
});

test("parse falls back to a default message when absent", () => {
  const alert = detector.parse({ hook_event_name: "Notification" });
  assert.equal(alert.message, "Claude Code needs your attention");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test "test/detection/claudeCodeDetector.test.ts"`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `src/detection/AgentDetector.ts`**

```ts
import { Alert } from "../model/Alert";

export interface AgentDetector {
  readonly agent: string;
  canHandle(payload: unknown): boolean;
  parse(payload: unknown): Alert;
}
```

- [ ] **Step 4: Create `src/detection/ClaudeCodeDetector.ts`**

```ts
import { Alert, createAlert } from "../model/Alert";
import { AgentDetector } from "./AgentDetector";

interface ClaudeNotification {
  hook_event_name: string;
  message?: string;
}

function isClaudeNotification(payload: unknown): payload is ClaudeNotification {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { hook_event_name?: unknown }).hook_event_name === "Notification"
  );
}

export class ClaudeCodeDetector implements AgentDetector {
  readonly agent = "claude-code";

  canHandle(payload: unknown): boolean {
    return isClaudeNotification(payload);
  }

  parse(payload: unknown): Alert {
    const message = isClaudeNotification(payload) && payload.message
      ? payload.message
      : "Claude Code needs your attention";
    return createAlert({ agent: this.agent, type: "notification", message });
  }
}
```

- [ ] **Step 5: Write the failing registry test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DetectorRegistry } from "../../src/detection/DetectorRegistry";
import { AgentDetector } from "../../src/detection/AgentDetector";
import { createAlert } from "../../src/model/Alert";

function stub(agent: string, matches: boolean): AgentDetector {
  return {
    agent,
    canHandle: () => matches,
    parse: () => createAlert({ agent, type: "t", message: "m" })
  };
}

test("detect returns the first matching detector's alert", () => {
  const registry = new DetectorRegistry([stub("a", false), stub("b", true), stub("c", true)]);
  const alert = registry.detect({});
  assert.equal(alert?.agent, "b");
});

test("detect returns undefined when nothing matches", () => {
  const registry = new DetectorRegistry([stub("a", false)]);
  assert.equal(registry.detect({}), undefined);
});
```

- [ ] **Step 6: Create `src/detection/DetectorRegistry.ts`**

```ts
import { Alert } from "../model/Alert";
import { AgentDetector } from "./AgentDetector";

export class DetectorRegistry {
  constructor(private readonly detectors: AgentDetector[]) {}

  detect(payload: unknown): Alert | undefined {
    const detector = this.detectors.find((d) => d.canHandle(payload));
    return detector?.parse(payload);
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node --import tsx --test "test/detection/*.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 8: Commit**

```bash
git add src/detection test/detection
git commit -m "feat: add agent detection strategy and Claude Code detector"
```

---

### Task 4: Alert bus and reactor interface

**Files:**
- Create: `src/alert/Reactor.ts`
- Create: `src/alert/AlertBus.ts`
- Test: `test/alert/alertBus.test.ts`

**Interfaces:**
- Consumes: `Alert` (Task 2).
- Produces:
  - `interface Reactor { react(alert: Alert): void | Promise<void> }`
  - `class AlertBus { constructor(reactors: Reactor[], onError?: (r: Reactor, e: unknown) => void); emit(alert: Alert): Promise<void> }` — awaits every reactor; a rejected/throwing reactor is caught and reported via `onError`, never stopping the others.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { AlertBus } from "../../src/alert/AlertBus";
import { Reactor } from "../../src/alert/Reactor";
import { createAlert } from "../../src/model/Alert";

const alert = createAlert({ agent: "a", type: "t", message: "m" });

test("emit invokes every reactor", async () => {
  const seen: string[] = [];
  const r = (name: string): Reactor => ({ react: () => { seen.push(name); } });
  await new AlertBus([r("one"), r("two")]).emit(alert);
  assert.deepEqual(seen, ["one", "two"]);
});

test("a throwing reactor does not block the others", async () => {
  const seen: string[] = [];
  const errors: unknown[] = [];
  const bad: Reactor = { react: () => { throw new Error("boom"); } };
  const good: Reactor = { react: () => { seen.push("good"); } };
  await new AlertBus([bad, good], (_r, e) => errors.push(e)).emit(alert);
  assert.deepEqual(seen, ["good"]);
  assert.equal(errors.length, 1);
});

test("a rejecting async reactor is caught", async () => {
  const errors: unknown[] = [];
  const bad: Reactor = { react: async () => { throw new Error("async boom"); } };
  await new AlertBus([bad], (_r, e) => errors.push(e)).emit(alert);
  assert.equal(errors.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test "test/alert/alertBus.test.ts"`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `src/alert/Reactor.ts`**

```ts
import { Alert } from "../model/Alert";

export interface Reactor {
  react(alert: Alert): void | Promise<void>;
}
```

- [ ] **Step 4: Create `src/alert/AlertBus.ts`**

```ts
import { Alert } from "../model/Alert";
import { Reactor } from "./Reactor";

type ErrorHandler = (reactor: Reactor, error: unknown) => void;

export class AlertBus {
  constructor(
    private readonly reactors: Reactor[],
    private readonly onError: ErrorHandler = () => {}
  ) {}

  async emit(alert: Alert): Promise<void> {
    for (const reactor of this.reactors) {
      try {
        await reactor.react(alert);
      } catch (error) {
        this.onError(reactor, error);
      }
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test "test/alert/alertBus.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/alert test/alert
git commit -m "feat: add alert bus with isolated reactor fan-out"
```

---

### Task 5: Ingress HTTP server

**Files:**
- Create: `src/ingress/IngressServer.ts`
- Test: `test/ingress/ingressServer.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (decoupled by callback).
- Produces:
  - `class IngressServer { constructor(onPayload: (payload: unknown) => void); start(port: number): Promise<void>; stop(): Promise<void>; }`
  - Accepts `POST /alert` with a JSON body; on valid JSON calls `onPayload(parsed)` and responds `202`. Invalid JSON → `400`. Other routes/methods → `404`. Start rejects if the port is in use.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { IngressServer } from "../../src/ingress/IngressServer";

async function post(port: number, path: string, body: string) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
  return res.status;
}

test("valid POST /alert forwards parsed payload and returns 202", async () => {
  const received: unknown[] = [];
  const server = new IngressServer((p) => received.push(p));
  await server.start(0 as unknown as number);
  const port = server.port();
  const status = await post(port, "/alert", JSON.stringify({ hello: "world" }));
  await server.stop();
  assert.equal(status, 202);
  assert.deepEqual(received, [{ hello: "world" }]);
});

test("invalid JSON returns 400 and does not forward", async () => {
  const received: unknown[] = [];
  const server = new IngressServer((p) => received.push(p));
  await server.start(0 as unknown as number);
  const status = await post(server.port(), "/alert", "{not json");
  await server.stop();
  assert.equal(status, 400);
  assert.equal(received.length, 0);
});

test("unknown route returns 404", async () => {
  const server = new IngressServer(() => {});
  await server.start(0 as unknown as number);
  const status = await post(server.port(), "/nope", "{}");
  await server.stop();
  assert.equal(status, 404);
});
```

Note: `start(0)` binds an ephemeral port; `port()` reports the actual bound port for the test.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test "test/ingress/ingressServer.test.ts"`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `src/ingress/IngressServer.ts`**

```ts
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";

type PayloadHandler = (payload: unknown) => void;

export class IngressServer {
  private server: Server | undefined;

  constructor(private readonly onPayload: PayloadHandler) {}

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
    if (req.method !== "POST" || req.url !== "/alert") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        this.onPayload(payload);
        res.writeHead(202).end();
      } catch {
        res.writeHead(400).end();
      }
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test "test/ingress/ingressServer.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ingress test/ingress
git commit -m "feat: add local HTTP ingress server"
```

---

### Task 6: Stats service

**Files:**
- Create: `src/stats/StatsService.ts`
- Test: `test/stats/statsService.test.ts`

**Interfaces:**
- Consumes: `Alert` (Task 2).
- Produces:
  - `interface DashboardStats { totalToday: number; approved: number; denied: number; averageResponseMs: number | null; peakHour: number | null; mostCommonType: string | null }`
  - `function computeStats(alerts: Alert[], now?: number): DashboardStats` — "today" is same calendar day as `now` (local time). `approved`/`denied` count today's alerts by status. `averageResponseMs` averages `respondedAt - receivedAt` over resolved alerts that have `respondedAt` (all-time), or `null` if none. `peakHour` is the local hour (0–23) with the most alerts today, `null` if none. `mostCommonType` is the most frequent `type` today, `null` if none.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStats } from "../../src/stats/StatsService";
import { Alert } from "../../src/model/Alert";

function at(hour: number, over: Partial<Alert> = {}): Alert {
  const d = new Date(2026, 0, 15, hour, 0, 0);
  return {
    id: Math.random().toString(),
    agent: "claude-code",
    type: "notification",
    message: "m",
    receivedAt: d.getTime(),
    status: "pending",
    ...over
  };
}

const now = new Date(2026, 0, 15, 23, 0, 0).getTime();

test("empty input yields zeroed stats", () => {
  const s = computeStats([], now);
  assert.deepEqual(s, {
    totalToday: 0, approved: 0, denied: 0,
    averageResponseMs: null, peakHour: null, mostCommonType: null
  });
});

test("counts today's alerts and statuses", () => {
  const s = computeStats([
    at(9, { status: "approved" }),
    at(9, { status: "denied" }),
    at(10, { status: "approved" })
  ], now);
  assert.equal(s.totalToday, 3);
  assert.equal(s.approved, 2);
  assert.equal(s.denied, 1);
  assert.equal(s.peakHour, 9);
});

test("average response time uses resolved alerts", () => {
  const base = at(9);
  const resolved: Alert = { ...base, respondedAt: base.receivedAt + 4000 };
  const s = computeStats([resolved, at(10)], now);
  assert.equal(s.averageResponseMs, 4000);
});

test("most common type wins by frequency", () => {
  const s = computeStats([
    at(9, { type: "permission" }),
    at(9, { type: "permission" }),
    at(10, { type: "notification" })
  ], now);
  assert.equal(s.mostCommonType, "permission");
});

test("alerts from other days are excluded from today counts", () => {
  const yesterday = at(9);
  yesterday.receivedAt = new Date(2026, 0, 14, 9).getTime();
  const s = computeStats([yesterday], now);
  assert.equal(s.totalToday, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test "test/stats/statsService.test.ts"`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `src/stats/StatsService.ts`**

```ts
import { Alert } from "../model/Alert";

export interface DashboardStats {
  totalToday: number;
  approved: number;
  denied: number;
  averageResponseMs: number | null;
  peakHour: number | null;
  mostCommonType: string | null;
}

function isSameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

function topKey<T>(items: T[], key: (item: T) => string | number): string | number | null {
  const counts = new Map<string | number, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best: string | number | null = null;
  let bestCount = 0;
  for (const [k, count] of counts) {
    if (count > bestCount) {
      best = k;
      bestCount = count;
    }
  }
  return best;
}

export function computeStats(alerts: Alert[], now: number = Date.now()): DashboardStats {
  const today = alerts.filter((a) => isSameDay(a.receivedAt, now));
  const resolved = alerts.filter((a) => typeof a.respondedAt === "number");
  const totalResponse = resolved.reduce((sum, a) => sum + (a.respondedAt! - a.receivedAt), 0);

  return {
    totalToday: today.length,
    approved: today.filter((a) => a.status === "approved").length,
    denied: today.filter((a) => a.status === "denied").length,
    averageResponseMs: resolved.length ? Math.round(totalResponse / resolved.length) : null,
    peakHour: today.length ? (topKey(today, (a) => new Date(a.receivedAt).getHours()) as number) : null,
    mostCommonType: today.length ? (topKey(today, (a) => a.type) as string) : null
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test "test/stats/statsService.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stats test/stats
git commit -m "feat: add dashboard stats computation"
```

---

### Task 7: History store

**Files:**
- Create: `src/history/HistoryStore.ts`
- Test: `test/history/historyStore.test.ts`

**Interfaces:**
- Consumes: `Alert`, `AlertStatus` (Task 2).
- Produces:
  - `interface KeyValueStore { get<T>(key: string, fallback: T): T; update(key: string, value: unknown): Thenable<void> | Promise<void> }` (a subset of `vscode.Memento`).
  - `class HistoryStore { constructor(store: KeyValueStore); readonly onDidChange: Event; list(): Alert[]; add(alert: Alert): void; setStatus(id: string, status: AlertStatus, at?: number): void; clear(): void }`
  - `onDidChange` is a zero-arg listener registry: `onDidChange(listener: () => void): { dispose(): void }`. Fires after `add`, `setStatus`, `clear`. Newest alert is first in `list()`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { HistoryStore, KeyValueStore } from "../../src/history/HistoryStore";
import { createAlert } from "../../src/model/Alert";

function memory(): KeyValueStore {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback: T) => (map.has(key) ? (map.get(key) as T) : fallback),
    update: async (key: string, value: unknown) => { map.set(key, value); }
  };
}

test("add prepends and persists alerts", () => {
  const store = new HistoryStore(memory());
  store.add(createAlert({ agent: "a", type: "t", message: "first" }));
  store.add(createAlert({ agent: "a", type: "t", message: "second" }));
  assert.deepEqual(store.list().map((a) => a.message), ["second", "first"]);
});

test("setStatus updates status and respondedAt", () => {
  const store = new HistoryStore(memory());
  const alert = createAlert({ agent: "a", type: "t", message: "m" });
  store.add(alert);
  store.setStatus(alert.id, "approved", 999);
  const updated = store.list()[0];
  assert.equal(updated.status, "approved");
  assert.equal(updated.respondedAt, 999);
});

test("change listeners fire on mutation", () => {
  const store = new HistoryStore(memory());
  let fired = 0;
  store.onDidChange(() => { fired += 1; });
  store.add(createAlert({ agent: "a", type: "t", message: "m" }));
  store.clear();
  assert.equal(fired, 2);
});

test("state survives a new store over the same backing map", () => {
  const backing = memory();
  const first = new HistoryStore(backing);
  first.add(createAlert({ agent: "a", type: "t", message: "persisted" }));
  const second = new HistoryStore(backing);
  assert.equal(second.list()[0].message, "persisted");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test "test/history/historyStore.test.ts"`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `src/history/HistoryStore.ts`**

```ts
import { Alert, AlertStatus } from "../model/Alert";

export interface KeyValueStore {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

const KEY = "aiCodingAlerts.history";

type Listener = () => void;

export class HistoryStore {
  private listeners = new Set<Listener>();

  constructor(private readonly store: KeyValueStore) {}

  onDidChange(listener: Listener): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  list(): Alert[] {
    return this.store.get<Alert[]>(KEY, []);
  }

  add(alert: Alert): void {
    this.persist([alert, ...this.list()]);
  }

  setStatus(id: string, status: AlertStatus, at: number = Date.now()): void {
    this.persist(
      this.list().map((a) => (a.id === id ? { ...a, status, respondedAt: at } : a))
    );
  }

  clear(): void {
    this.persist([]);
  }

  private persist(alerts: Alert[]): void {
    void this.store.update(KEY, alerts);
    this.listeners.forEach((l) => l());
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test "test/history/historyStore.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/history test/history
git commit -m "feat: add persistent alert history store"
```

---

### Task 8: Per-OS command builders (sound, notification, focus)

**Files:**
- Create: `src/platform/Platform.ts`
- Create: `src/platform/soundCommand.ts`
- Create: `src/platform/notifyCommand.ts`
- Create: `src/platform/focusCommand.ts`
- Test: `test/platform/soundCommand.test.ts`
- Test: `test/platform/notifyCommand.test.ts`
- Test: `test/platform/focusCommand.test.ts`

**Interfaces:**
- Produces:
  - `type Os = "darwin" | "linux" | "win32"`
  - `interface Command { command: string; args: string[] }`
  - `function buildSoundCommand(os: Os, filePath: string): Command`
  - `function buildNotifyCommand(os: Os, title: string, message: string): Command`
  - `function buildFocusCommand(os: Os): Command | null` — `null` when focus is unsupported on that OS.

- [ ] **Step 1: Write the failing sound test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSoundCommand } from "../../src/platform/soundCommand";

test("macOS uses afplay", () => {
  const c = buildSoundCommand("darwin", "/a/b.wav");
  assert.equal(c.command, "afplay");
  assert.deepEqual(c.args, ["/a/b.wav"]);
});

test("linux uses ffplay with quiet auto-exit flags", () => {
  const c = buildSoundCommand("linux", "/a/b.wav");
  assert.equal(c.command, "ffplay");
  assert.ok(c.args.includes("-autoexit"));
  assert.ok(c.args.includes("/a/b.wav"));
});

test("windows uses powershell MediaPlayer with the file path embedded", () => {
  const c = buildSoundCommand("win32", "C:\\a\\b.wav");
  assert.equal(c.command, "powershell");
  assert.ok(c.args.join(" ").includes("C:\\a\\b.wav"));
  assert.ok(c.args.join(" ").includes("MediaPlayer"));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test "test/platform/soundCommand.test.ts"`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `src/platform/Platform.ts`**

```ts
export type Os = "darwin" | "linux" | "win32";

export interface Command {
  command: string;
  args: string[];
}

export function currentOs(): Os {
  return process.platform as Os;
}
```

- [ ] **Step 4: Create `src/platform/soundCommand.ts`**

```ts
import { Command, Os } from "./Platform";

export function buildSoundCommand(os: Os, filePath: string): Command {
  if (os === "darwin") {
    return { command: "afplay", args: [filePath] };
  }
  if (os === "linux") {
    return { command: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "quiet", filePath] };
  }
  const script =
    `Add-Type -AssemblyName presentationCore; ` +
    `$p = New-Object System.Windows.Media.MediaPlayer; ` +
    `$p.Open([uri]'${filePath}'); $p.Play(); Start-Sleep -Seconds 5`;
  return { command: "powershell", args: ["-NoProfile", "-STA", "-Command", script] };
}
```

- [ ] **Step 5: Write the failing notify test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNotifyCommand } from "../../src/platform/notifyCommand";

test("macOS uses terminal-notifier", () => {
  const c = buildNotifyCommand("darwin", "Title", "Body");
  assert.equal(c.command, "terminal-notifier");
  assert.ok(c.args.includes("Title"));
  assert.ok(c.args.includes("Body"));
});

test("linux uses notify-send with critical urgency", () => {
  const c = buildNotifyCommand("linux", "Title", "Body");
  assert.equal(c.command, "notify-send");
  assert.ok(c.args.includes("-u"));
  assert.ok(c.args.includes("critical"));
});

test("windows uses BurntToast via powershell", () => {
  const c = buildNotifyCommand("win32", "Title", "Body");
  assert.equal(c.command, "powershell");
  assert.ok(c.args.join(" ").includes("New-BurntToastNotification"));
  assert.ok(c.args.join(" ").includes("Body"));
});
```

- [ ] **Step 6: Create `src/platform/notifyCommand.ts`**

```ts
import { Command, Os } from "./Platform";

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "''");
}

export function buildNotifyCommand(os: Os, title: string, message: string): Command {
  if (os === "darwin") {
    return { command: "terminal-notifier", args: ["-title", title, "-message", message] };
  }
  if (os === "linux") {
    return { command: "notify-send", args: ["-u", "critical", title, message] };
  }
  const script = `New-BurntToastNotification -Text '${escapeSingleQuotes(title)}','${escapeSingleQuotes(message)}'`;
  return { command: "powershell", args: ["-NoProfile", "-Command", script] };
}
```

- [ ] **Step 7: Write the failing focus test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFocusCommand } from "../../src/platform/focusCommand";

test("macOS activates Visual Studio Code via osascript", () => {
  const c = buildFocusCommand("darwin");
  assert.equal(c?.command, "osascript");
  assert.ok(c?.args.join(" ").includes("Visual Studio Code"));
});

test("linux uses wmctrl to raise the window", () => {
  const c = buildFocusCommand("linux");
  assert.equal(c?.command, "wmctrl");
  assert.ok(c?.args.includes("-a"));
});

test("windows uses powershell AppActivate", () => {
  const c = buildFocusCommand("win32");
  assert.equal(c?.command, "powershell");
  assert.ok(c?.args.join(" ").includes("AppActivate"));
});
```

- [ ] **Step 8: Create `src/platform/focusCommand.ts`**

```ts
import { Command, Os } from "./Platform";

export function buildFocusCommand(os: Os): Command | null {
  if (os === "darwin") {
    return { command: "osascript", args: ["-e", 'tell application "Visual Studio Code" to activate'] };
  }
  if (os === "linux") {
    return { command: "wmctrl", args: ["-a", "Visual Studio Code"] };
  }
  const script =
    `$w = New-Object -ComObject WScript.Shell; ` +
    `$w.AppActivate('Visual Studio Code') | Out-Null`;
  return { command: "powershell", args: ["-NoProfile", "-Command", script] };
}
```

- [ ] **Step 9: Run all platform tests**

Run: `node --import tsx --test "test/platform/*.test.ts"`
Expected: PASS (9 tests).

- [ ] **Step 10: Commit**

```bash
git add src/platform test/platform
git commit -m "feat: add per-OS sound, notification, and focus command builders"
```

---

### Task 9: Runner and the three side-effect reactors

**Files:**
- Create: `src/platform/runCommand.ts`
- Create: `src/reactors/SoundPlayer.ts`
- Create: `src/reactors/OsNotifier.ts`
- Create: `src/reactors/WindowFocuser.ts`
- Test: `test/reactors/soundPlayer.test.ts`

**Interfaces:**
- Consumes: `Command`, `Os` (Task 8); builders (Task 8); `Reactor` (Task 4); `Alert` (Task 2).
- Produces:
  - `type CommandRunner = (command: Command) => void` (default detached `spawn`).
  - `interface SoundConfig { resolvePath(): string | null }` — supplies the absolute sound file path (built in wiring from settings).
  - `class SoundPlayer implements Reactor` — `constructor(os: Os, config: SoundConfig, run: CommandRunner)`. On `react`, resolves the path; if non-null, runs `buildSoundCommand`. Exposes `play(): void` for history replay.
  - `class OsNotifier implements Reactor` — `constructor(os: Os, enabled: () => boolean, run: CommandRunner)`. Skips when disabled.
  - `class WindowFocuser implements Reactor` — `constructor(os: Os, enabled: () => boolean, run: CommandRunner)`. Skips when disabled or when `buildFocusCommand` returns null.

- [ ] **Step 1: Write the failing SoundPlayer test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SoundPlayer } from "../../src/reactors/SoundPlayer";
import { Command } from "../../src/platform/Platform";
import { createAlert } from "../../src/model/Alert";

const alert = createAlert({ agent: "a", type: "t", message: "m" });

test("react runs the resolved sound command", async () => {
  const runs: Command[] = [];
  const player = new SoundPlayer("darwin", { resolvePath: () => "/s/ping.wav" }, (c) => runs.push(c));
  await player.react(alert);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].command, "afplay");
});

test("react is a no-op when no path resolves", async () => {
  const runs: Command[] = [];
  const player = new SoundPlayer("darwin", { resolvePath: () => null }, (c) => runs.push(c));
  await player.react(alert);
  assert.equal(runs.length, 0);
});

test("play() replays the current sound", () => {
  const runs: Command[] = [];
  const player = new SoundPlayer("linux", { resolvePath: () => "/s/ping.wav" }, (c) => runs.push(c));
  player.play();
  assert.equal(runs[0].command, "ffplay");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test "test/reactors/soundPlayer.test.ts"`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `src/platform/runCommand.ts`**

```ts
import { spawn } from "node:child_process";
import { Command } from "./Platform";

export function runCommand(command: Command): void {
  const child = spawn(command.command, command.args, {
    detached: true,
    stdio: "ignore"
  });
  child.on("error", () => {});
  child.unref();
}
```

- [ ] **Step 4: Create `src/reactors/SoundPlayer.ts`**

```ts
import { Alert } from "../model/Alert";
import { Reactor } from "../alert/Reactor";
import { Command, Os } from "../platform/Platform";
import { buildSoundCommand } from "../platform/soundCommand";

export type CommandRunner = (command: Command) => void;

export interface SoundConfig {
  resolvePath(): string | null;
}

export class SoundPlayer implements Reactor {
  constructor(
    private readonly os: Os,
    private readonly config: SoundConfig,
    private readonly run: CommandRunner
  ) {}

  react(_alert: Alert): void {
    this.play();
  }

  play(): void {
    const path = this.config.resolvePath();
    if (!path) {
      return;
    }
    this.run(buildSoundCommand(this.os, path));
  }
}
```

- [ ] **Step 5: Create `src/reactors/OsNotifier.ts`**

```ts
import { Alert } from "../model/Alert";
import { Reactor } from "../alert/Reactor";
import { Command, Os } from "../platform/Platform";
import { buildNotifyCommand } from "../platform/notifyCommand";
import { CommandRunner } from "./SoundPlayer";

const TITLE = "AI Coding Alerts";

export class OsNotifier implements Reactor {
  constructor(
    private readonly os: Os,
    private readonly enabled: () => boolean,
    private readonly run: CommandRunner
  ) {}

  react(alert: Alert): void {
    if (!this.enabled()) {
      return;
    }
    this.run(buildNotifyCommand(this.os, TITLE, alert.message));
  }
}
```

- [ ] **Step 6: Create `src/reactors/WindowFocuser.ts`**

```ts
import { Alert } from "../model/Alert";
import { Reactor } from "../alert/Reactor";
import { Os } from "../platform/Platform";
import { buildFocusCommand } from "../platform/focusCommand";
import { CommandRunner } from "./SoundPlayer";

export class WindowFocuser implements Reactor {
  constructor(
    private readonly os: Os,
    private readonly enabled: () => boolean,
    private readonly run: CommandRunner
  ) {}

  react(_alert: Alert): void {
    if (!this.enabled()) {
      return;
    }
    const command = buildFocusCommand(this.os);
    if (command) {
      this.run(command);
    }
  }
}
```

- [ ] **Step 7: Run to verify it passes**

Run: `node --import tsx --test "test/reactors/soundPlayer.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add src/platform/runCommand.ts src/reactors test/reactors
git commit -m "feat: add sound, notification, and focus reactors"
```

---

### Task 10: Config service and contribution points

**Files:**
- Modify: `package.json` (add `contributes.configuration`, `contributes.viewsContainers`, `contributes.views`, `contributes.commands`)
- Create: `src/config/ConfigService.ts`

**Interfaces:**
- Produces:
  - `interface AlertSettings { port: number; sound: string; customSoundPath: string; enableOsNotification: boolean; enableWindowFocus: boolean }`
  - `class ConfigService { constructor(); read(): AlertSettings; onDidChange(listener: () => void): vscode.Disposable }`
  - Built-in sound ids: `"chime"`, `"ping"`, `"knock"`, `"alarm"`, plus `"custom"`.

- [ ] **Step 1: Add contribution points to `package.json`**

Insert a `contributes` block (sibling of `main`):

```json
"contributes": {
  "configuration": {
    "title": "AI Coding Alerts",
    "properties": {
      "aiCodingAlerts.port": {
        "type": "number",
        "default": 51789,
        "description": "Local port the extension listens on for agent alerts."
      },
      "aiCodingAlerts.sound": {
        "type": "string",
        "enum": ["chime", "ping", "knock", "alarm", "custom"],
        "default": "chime",
        "description": "Sound played on an alert. Choose 'custom' to use your own file."
      },
      "aiCodingAlerts.customSoundPath": {
        "type": "string",
        "default": "",
        "description": "Absolute path to a custom sound file, used when 'sound' is 'custom'."
      },
      "aiCodingAlerts.enableOsNotification": {
        "type": "boolean",
        "default": true,
        "description": "Show an OS-level notification on an alert."
      },
      "aiCodingAlerts.enableWindowFocus": {
        "type": "boolean",
        "default": true,
        "description": "Bring the VS Code window to the foreground on an alert."
      }
    }
  },
  "viewsContainers": {
    "activitybar": [
      {
        "id": "aiCodingAlerts",
        "title": "AI Coding Alerts",
        "icon": "media/icon.svg"
      }
    ]
  },
  "views": {
    "aiCodingAlerts": [
      { "id": "aiCodingAlerts.history", "name": "Alert History", "type": "webview" },
      { "id": "aiCodingAlerts.dashboard", "name": "Dashboard", "type": "webview" }
    ]
  },
  "commands": [
    { "command": "aiCodingAlerts.clearHistory", "title": "AI Coding Alerts: Clear History" },
    { "command": "aiCodingAlerts.testAlert", "title": "AI Coding Alerts: Send Test Alert" }
  ]
}
```

- [ ] **Step 2: Create `src/config/ConfigService.ts`**

```ts
import * as vscode from "vscode";

const SECTION = "aiCodingAlerts";

export interface AlertSettings {
  port: number;
  sound: string;
  customSoundPath: string;
  enableOsNotification: boolean;
  enableWindowFocus: boolean;
}

export class ConfigService {
  read(): AlertSettings {
    const config = vscode.workspace.getConfiguration(SECTION);
    return {
      port: config.get<number>("port", 51789),
      sound: config.get<string>("sound", "chime"),
      customSoundPath: config.get<string>("customSoundPath", ""),
      enableOsNotification: config.get<boolean>("enableOsNotification", true),
      enableWindowFocus: config.get<boolean>("enableWindowFocus", true)
    };
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

- [ ] **Step 3: Build to verify types compile**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add package.json src/config
git commit -m "feat: add settings contributions and config service"
```

---

### Task 11: Bundled assets (sounds and icon)

**Files:**
- Create: `media/sounds/chime.wav`
- Create: `media/sounds/ping.wav`
- Create: `media/sounds/knock.wav`
- Create: `media/sounds/alarm.wav`
- Create: `media/icon.svg`
- Create: `src/config/soundResolver.ts`
- Test: `test/config/soundResolver.test.ts`

**Interfaces:**
- Consumes: `AlertSettings` (Task 10).
- Produces:
  - `function resolveSoundPath(settings: { sound: string; customSoundPath: string }, mediaRoot: string): string | null` — for a built-in id returns `<mediaRoot>/sounds/<id>.wav`; for `"custom"` returns `customSoundPath` if non-empty else `null`; unknown id → `null`.

- [ ] **Step 1: Generate the four WAV sounds**

Run (writes four short distinct tones):

```bash
cd /d/ai-coding-alerts && node -e '
const fs=require("fs");
function wav(path, freq, ms, vol){
  const rate=44100, n=Math.floor(rate*ms/1000);
  const buf=Buffer.alloc(44+n*2);
  buf.write("RIFF",0); buf.writeUInt32LE(36+n*2,4); buf.write("WAVE",8);
  buf.write("fmt ",12); buf.writeUInt32LE(16,16); buf.writeUInt16LE(1,20);
  buf.writeUInt16LE(1,22); buf.writeUInt32LE(rate,24); buf.writeUInt32LE(rate*2,28);
  buf.writeUInt16LE(2,32); buf.writeUInt16LE(16,34); buf.write("data",36); buf.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++){
    const env=Math.min(1,(n-i)/(rate*0.05));
    const s=Math.sin(2*Math.PI*freq*i/rate)*vol*env*32767;
    buf.writeInt16LE(s|0,44+i*2);
  }
  fs.writeFileSync(path,buf);
}
fs.mkdirSync("media/sounds",{recursive:true});
wav("media/sounds/chime.wav",880,400,0.4);
wav("media/sounds/ping.wav",1320,180,0.4);
wav("media/sounds/knock.wav",220,250,0.5);
wav("media/sounds/alarm.wav",660,700,0.5);
'
ls -la media/sounds
```

Expected: four `.wav` files listed.

- [ ] **Step 2: Create `media/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
  <path d="M13.7 21a2 2 0 0 1-3.4 0"/>
</svg>
```

- [ ] **Step 3: Write the failing resolver test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSoundPath } from "../../src/config/soundResolver";

test("built-in sound resolves under mediaRoot/sounds", () => {
  const p = resolveSoundPath({ sound: "ping", customSoundPath: "" }, "/ext");
  assert.equal(p, "/ext/sounds/ping.wav");
});

test("custom uses the configured path", () => {
  const p = resolveSoundPath({ sound: "custom", customSoundPath: "/my/bell.wav" }, "/ext");
  assert.equal(p, "/my/bell.wav");
});

test("custom without a path resolves to null", () => {
  assert.equal(resolveSoundPath({ sound: "custom", customSoundPath: "" }, "/ext"), null);
});

test("unknown sound resolves to null", () => {
  assert.equal(resolveSoundPath({ sound: "weird", customSoundPath: "" }, "/ext"), null);
});
```

- [ ] **Step 4: Create `src/config/soundResolver.ts`**

```ts
const BUILT_IN = new Set(["chime", "ping", "knock", "alarm"]);

export function resolveSoundPath(
  settings: { sound: string; customSoundPath: string },
  mediaRoot: string
): string | null {
  if (settings.sound === "custom") {
    return settings.customSoundPath.trim() ? settings.customSoundPath : null;
  }
  if (BUILT_IN.has(settings.sound)) {
    return `${mediaRoot}/sounds/${settings.sound}.wav`;
  }
  return null;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --import tsx --test "test/config/soundResolver.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add media src/config/soundResolver.ts test/config
git commit -m "feat: add bundled sounds, icon, and sound path resolver"
```

---

### Task 12: History sidebar webview

**Files:**
- Create: `src/views/HistoryViewProvider.ts`
- Create: `src/views/webviewHtml.ts`
- Create: `media/history.js`
- Create: `media/panel.css`

**Interfaces:**
- Consumes: `HistoryStore` (Task 7); `SoundPlayer.play` (Task 9); `Alert` (Task 2).
- Produces:
  - `function nonce(): string` and `function panelHtml(opts: { webview: vscode.Webview; extensionUri: vscode.Uri; script: string; title: string }): string` in `webviewHtml.ts`.
  - `class HistoryViewProvider implements vscode.WebviewViewProvider` — `constructor(extensionUri: vscode.Uri, history: HistoryStore, onReplay: () => void)`. Renders the alert list; posts `{type:"data", alerts}` to the webview; handles inbound `{type:"approve"|"deny", id}` → `history.setStatus`, and `{type:"replay"}` → `onReplay()`. Re-posts on `history.onDidChange`. View id `aiCodingAlerts.history`.

- [ ] **Step 1: Create `src/views/webviewHtml.ts`**

```ts
import * as vscode from "vscode";

export function nonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function panelHtml(opts: {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  script: string;
  title: string;
}): string {
  const { webview, extensionUri, script, title } = opts;
  const n = nonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", script));
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "panel.css"));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${n}';" />
<link href="${cssUri}" rel="stylesheet" />
<title>${title}</title>
</head>
<body>
<div id="root"></div>
<script nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
}
```

- [ ] **Step 2: Create `src/views/HistoryViewProvider.ts`**

```ts
import * as vscode from "vscode";
import { HistoryStore } from "../history/HistoryStore";
import { panelHtml } from "./webviewHtml";

export class HistoryViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "aiCodingAlerts.history";

  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly history: HistoryStore,
    private readonly onReplay: () => void
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = panelHtml({
      webview: view.webview,
      extensionUri: this.extensionUri,
      script: "history.js",
      title: "Alert History"
    });
    view.webview.onDidReceiveMessage((msg) => this.handle(msg));
    this.history.onDidChange(() => this.push());
    this.push();
  }

  private handle(msg: { type: string; id?: string }): void {
    if (msg.type === "approve" && msg.id) {
      this.history.setStatus(msg.id, "approved");
    } else if (msg.type === "deny" && msg.id) {
      this.history.setStatus(msg.id, "denied");
    } else if (msg.type === "replay") {
      this.onReplay();
    }
  }

  private push(): void {
    this.view?.webview.postMessage({ type: "data", alerts: this.history.list() });
  }
}
```

- [ ] **Step 3: Create `media/panel.css`**

```css
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; }
.row { border-bottom: 1px solid var(--vscode-panel-border); padding: 8px 0; }
.msg { font-size: 13px; margin-bottom: 4px; }
.meta { font-size: 11px; opacity: 0.7; margin-bottom: 6px; }
.status { text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
.status.approved { color: var(--vscode-testing-iconPassed); }
.status.denied { color: var(--vscode-testing-iconFailed); }
.status.pending { color: var(--vscode-testing-iconQueued); }
button { margin-right: 6px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 3px 8px; cursor: pointer; border-radius: 2px; }
.empty { opacity: 0.6; font-size: 12px; padding: 12px 0; }
.metric { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); }
.metric .value { font-weight: 600; }
```

- [ ] **Step 4: Create `media/history.js`**

```js
const vscode = acquireVsCodeApi();
const root = document.getElementById("root");

function fmt(ts) {
  return new Date(ts).toLocaleString();
}

function render(alerts) {
  if (!alerts.length) {
    root.innerHTML = '<div class="empty">No alerts yet.</div>';
    return;
  }
  root.innerHTML = alerts.map((a) => `
    <div class="row">
      <div class="msg"></div>
      <div class="meta">${fmt(a.receivedAt)} · ${a.agent}</div>
      <div class="status ${a.status}">${a.status}</div>
      <div>
        <button data-act="approve" data-id="${a.id}">Approve</button>
        <button data-act="deny" data-id="${a.id}">Deny</button>
        <button data-act="replay">Replay</button>
      </div>
    </div>`).join("");
  const msgs = root.querySelectorAll(".msg");
  alerts.forEach((a, i) => { msgs[i].textContent = a.message; });
}

root.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const act = btn.getAttribute("data-act");
  if (act === "replay") { vscode.postMessage({ type: "replay" }); return; }
  vscode.postMessage({ type: act, id: btn.getAttribute("data-id") });
});

window.addEventListener("message", (e) => {
  if (e.data.type === "data") render(e.data.alerts);
});
```

- [ ] **Step 5: Build to verify types compile**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/views/HistoryViewProvider.ts src/views/webviewHtml.ts media/history.js media/panel.css
git commit -m "feat: add alert history sidebar webview"
```

---

### Task 13: Dashboard sidebar webview

**Files:**
- Create: `src/views/DashboardViewProvider.ts`
- Create: `media/dashboard.js`

**Interfaces:**
- Consumes: `HistoryStore` (Task 7); `computeStats`, `DashboardStats` (Task 6); `panelHtml` (Task 12).
- Produces:
  - `class DashboardViewProvider implements vscode.WebviewViewProvider` — `constructor(extensionUri, history)`. On resolve and on `history.onDidChange`, posts `{type:"stats", stats}` computed via `computeStats(history.list())`. View id `aiCodingAlerts.dashboard`.

- [ ] **Step 1: Create `src/views/DashboardViewProvider.ts`**

```ts
import * as vscode from "vscode";
import { HistoryStore } from "../history/HistoryStore";
import { computeStats } from "../stats/StatsService";
import { panelHtml } from "./webviewHtml";

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "aiCodingAlerts.dashboard";

  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly history: HistoryStore
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = panelHtml({
      webview: view.webview,
      extensionUri: this.extensionUri,
      script: "dashboard.js",
      title: "Dashboard"
    });
    this.history.onDidChange(() => this.push());
    this.push();
  }

  private push(): void {
    this.view?.webview.postMessage({ type: "stats", stats: computeStats(this.history.list()) });
  }
}
```

- [ ] **Step 2: Create `media/dashboard.js`**

```js
const vscode = acquireVsCodeApi();
const root = document.getElementById("root");

function ms(v) { return v == null ? "—" : (v / 1000).toFixed(1) + "s"; }
function hour(v) { return v == null ? "—" : String(v).padStart(2, "0") + ":00"; }
function txt(v) { return v == null ? "—" : v; }

function render(s) {
  const rows = [
    ["Alerts today", s.totalToday],
    ["Approved", s.approved],
    ["Denied", s.denied],
    ["Avg. response", ms(s.averageResponseMs)],
    ["Peak hour", hour(s.peakHour)],
    ["Most common type", txt(s.mostCommonType)]
  ];
  root.innerHTML = rows.map(([label, value]) =>
    `<div class="metric"><span>${label}</span><span class="value">${value}</span></div>`
  ).join("");
}

window.addEventListener("message", (e) => {
  if (e.data.type === "stats") render(e.data.stats);
});
```

Reuses `vscode` binding note: this file runs in its own webview, so `acquireVsCodeApi` is fresh here.

- [ ] **Step 3: Build to verify types compile**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/views/DashboardViewProvider.ts media/dashboard.js
git commit -m "feat: add stats dashboard sidebar webview"
```

---

### Task 14: Wire everything in `extension.ts`

**Files:**
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: every prior module.
- Produces: full activation wiring — ingress server, detector registry, alert bus, reactors, history store, both view providers, commands, config live-reload, port-conflict handling, disposal.

- [ ] **Step 1: Replace `src/extension.ts`**

```ts
import * as vscode from "vscode";
import { ConfigService } from "./config/ConfigService";
import { resolveSoundPath } from "./config/soundResolver";
import { HistoryStore } from "./history/HistoryStore";
import { DetectorRegistry } from "./detection/DetectorRegistry";
import { ClaudeCodeDetector } from "./detection/ClaudeCodeDetector";
import { AlertBus } from "./alert/AlertBus";
import { IngressServer } from "./ingress/IngressServer";
import { SoundPlayer } from "./reactors/SoundPlayer";
import { OsNotifier } from "./reactors/OsNotifier";
import { WindowFocuser } from "./reactors/WindowFocuser";
import { runCommand } from "./platform/runCommand";
import { currentOs } from "./platform/Platform";
import { createAlert } from "./model/Alert";
import { HistoryViewProvider } from "./views/HistoryViewProvider";
import { DashboardViewProvider } from "./views/DashboardViewProvider";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("AI Coding Alerts");
  const config = new ConfigService();
  const history = new HistoryStore(context.globalState);
  const os = currentOs();
  const mediaRoot = context.extensionUri.fsPath.replace(/\\/g, "/") + "/media";

  const soundPlayer = new SoundPlayer(
    os,
    { resolvePath: () => resolveSoundPath(config.read(), mediaRoot) },
    runCommand
  );
  const bus = new AlertBus(
    [
      soundPlayer,
      new OsNotifier(os, () => config.read().enableOsNotification, runCommand),
      new WindowFocuser(os, () => config.read().enableWindowFocus, runCommand),
      { react: (alert) => history.add(alert) }
    ],
    (_r, e) => output.appendLine(`Reactor error: ${String(e)}`)
  );

  const registry = new DetectorRegistry([new ClaudeCodeDetector()]);

  const handlePayload = (payload: unknown): void => {
    const alert = registry.detect(payload);
    if (alert) {
      void bus.emit(alert);
    } else {
      output.appendLine(`Ignored unrecognized payload: ${JSON.stringify(payload)}`);
    }
  };

  let server = new IngressServer(handlePayload);
  const startServer = async (): Promise<void> => {
    const { port } = config.read();
    try {
      await server.start(port);
      output.appendLine(`Listening on 127.0.0.1:${port}`);
    } catch {
      vscode.window.showWarningMessage(`AI Coding Alerts: port ${port} is unavailable. Change aiCodingAlerts.port.`);
    }
  };
  void startServer();

  const historyView = new HistoryViewProvider(context.extensionUri, history, () => soundPlayer.play());
  const dashboardView = new DashboardViewProvider(context.extensionUri, history);

  context.subscriptions.push(
    output,
    vscode.window.registerWebviewViewProvider(HistoryViewProvider.viewId, historyView),
    vscode.window.registerWebviewViewProvider(DashboardViewProvider.viewId, dashboardView),
    vscode.commands.registerCommand("aiCodingAlerts.clearHistory", () => history.clear()),
    vscode.commands.registerCommand("aiCodingAlerts.testAlert", () =>
      handlePayload({ hook_event_name: "Notification", message: "Test alert" })
    ),
    config.onDidChange(async () => {
      await server.stop();
      server = new IngressServer(handlePayload);
      await startServer();
    }),
    { dispose: () => void server.stop() }
  );
}

export function deactivate(): void {}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Manual smoke test in the Extension Development Host**

1. Press F5 in VS Code (uses `.vscode/launch.json`).
2. In the host, open the AI Coding Alerts activity-bar container; confirm History and Dashboard panels load.
3. Run command "AI Coding Alerts: Send Test Alert" → hear a sound, see an OS notification, and a new history row.
4. From a terminal: `curl -X POST http://127.0.0.1:51789/alert -H "content-type: application/json" -d "{\"hook_event_name\":\"Notification\",\"message\":\"curl test\"}"` → new alert fires.
5. Approve/Deny a row → Dashboard counters update.

Expected: all steps behave as described.

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat: wire ingress, detection, reactors, and views on activation"
```

---

### Task 15: README, license, changelog, marketplace metadata

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `CHANGELOG.md`
- Modify: `package.json` (add `repository`, `license`, `icon` — reuse a PNG or drop `icon` if none)

**Interfaces:**
- Consumes: nothing.
- Produces: publish-ready docs including the Claude Code hook snippet.

- [ ] **Step 1: Create `README.md`**

````markdown
# AI Coding Alerts

Get a sound, an OS-level notification, and window focus the moment Claude Code (or another AI coding agent) is waiting for your confirmation.

## Features

- Local listener that any agent can POST alerts to.
- Sound alert with four built-in sounds or your own file.
- OS-level notification (terminal-notifier on macOS, `notify-send` on Linux, BurntToast on Windows).
- Brings the VS Code window to the foreground.
- **Alert History** panel: every alert with timestamp, status, and one-click sound replay.
- **Dashboard** panel: alerts today, approved/denied, average response time, peak hour, most common type.

## Setup

1. Install the extension.
2. Open the **AI Coding Alerts** view in the activity bar.
3. (Optional) Adjust settings — see below.

### Claude Code hook

Add a `Notification` hook to your Claude Code settings (`~/.claude/settings.json`) so Claude tells the extension when it is waiting:

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:51789/alert -H 'content-type: application/json' -d @-"
          }
        ]
      }
    ]
  }
}
```

Claude Code pipes the hook JSON on stdin; `-d @-` forwards it to the extension. If you change `aiCodingAlerts.port`, update the URL to match.

### OS notification prerequisites

- **macOS:** `brew install terminal-notifier`
- **Linux:** `notify-send` (from `libnotify-bin`) and `wmctrl` for window focus
- **Windows:** `Install-Module -Name BurntToast -Scope CurrentUser`

## Settings

| Setting | Default | Description |
|---|---|---|
| `aiCodingAlerts.port` | `51789` | Local port the extension listens on. |
| `aiCodingAlerts.sound` | `chime` | `chime`, `ping`, `knock`, `alarm`, or `custom`. |
| `aiCodingAlerts.customSoundPath` | `""` | Absolute path used when `sound` is `custom`. |
| `aiCodingAlerts.enableOsNotification` | `true` | Toggle the OS notification. |
| `aiCodingAlerts.enableWindowFocus` | `true` | Toggle window focus on alert. |

## Test it

```bash
curl -X POST http://127.0.0.1:51789/alert \
  -H "content-type: application/json" \
  -d '{"hook_event_name":"Notification","message":"Test alert"}'
```

Or run the command **AI Coding Alerts: Send Test Alert**.

## Adding another agent

Implement `AgentDetector` (`src/detection/AgentDetector.ts`) and register it in the `DetectorRegistry` list in `src/extension.ts`. The alert layer needs no changes.
````

- [ ] **Step 2: Create `LICENSE`** (MIT, holder "mbparvezme", year 2026).

- [ ] **Step 3: Create `CHANGELOG.md`**

```markdown
# Change Log

## 0.1.0

- Initial release: local alert listener, sound/OS-notification/window-focus reactors, alert history, and stats dashboard.
```

- [ ] **Step 4: Add metadata to `package.json`**

Add these keys (alongside existing top-level keys):

```json
"license": "MIT",
"repository": { "type": "git", "url": "https://github.com/mbparvezme/ai-coding-alerts.git" }
```

- [ ] **Step 5: Full verification**

Run: `npm run build && node --import tsx --test "test/**/*.test.ts"`
Expected: build exit 0; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md LICENSE CHANGELOG.md package.json
git commit -m "docs: add README, license, changelog, and marketplace metadata"
```

---

## Self-Review

**Spec coverage:**
- Listen on configurable TCP port (default 51789) → Tasks 5, 10, 14.
- Claude Code Notification hook triggers alert → Tasks 3, 14, 15 (hook snippet).
- Play user-selected sound, 3–4 built-ins + custom path → Tasks 8, 9, 11, 10.
- OS-level notification per platform → Tasks 8, 9.
- Focus VS Code window → Tasks 8, 9.
- Alert History panel with timestamp/message/status + replay → Tasks 7, 12.
- Dashboard: total today, approved/denied, avg response, peak hour, most common type → Tasks 6, 13.
- Settings (port, sound+custom, OS-notif toggle, focus toggle) → Task 10.
- Detection-strategy abstraction, alert layer decoupled → Tasks 3, 4 (bus consumes only `Alert`).
- Deliverables: package.json contributions, README + hook snippet, Dev Host testable → Tasks 10, 15, 14.

**Placeholder scan:** none — every step has full content.

**Type consistency:** `Alert`/`createAlert`, `Reactor.react`, `AlertBus.emit`, `DetectorRegistry.detect`, `HistoryStore` (`list/add/setStatus/clear/onDidChange`), `CommandRunner`/`Command`, `resolveSoundPath`, `computeStats`/`DashboardStats`, `panelHtml` — names/signatures match across producing and consuming tasks. `context.globalState` satisfies the `KeyValueStore` interface (has `get`/`update`).
