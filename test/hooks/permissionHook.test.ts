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
