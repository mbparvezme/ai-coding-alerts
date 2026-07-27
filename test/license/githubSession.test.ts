import { test } from "node:test";
import assert from "node:assert/strict";
import { vscodeAuthProvider } from "../../src/license/githubSession";

test("requests github provider with user:email scope, passing createIfNone through", async () => {
  const calls: any[] = [];
  const fake = { getSession: async (p: string, s: string[], o: any) => { calls.push([p, s, o]); return { accessToken: "gho_x" }; } };
  const provider = vscodeAuthProvider(fake);
  const session = await provider.getSession(true);
  assert.equal(session?.accessToken, "gho_x");
  assert.deepEqual(calls[0], ["github", ["user:email"], { createIfNone: true }]);
});

test("silent path passes createIfNone:false", async () => {
  const fake = { getSession: async (_p: string, _s: string[], o: any) => (o.createIfNone ? { accessToken: "x" } : undefined) };
  const provider = vscodeAuthProvider(fake);
  assert.equal(await provider.getSession(false), undefined);
});
