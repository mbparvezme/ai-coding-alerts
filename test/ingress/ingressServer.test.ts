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
