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
