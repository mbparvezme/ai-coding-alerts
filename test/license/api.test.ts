import { test } from "node:test";
import assert from "node:assert/strict";
import { authGithub, refreshAuth, deactivateAccount } from "../../src/license/api";

const fetchOk = async (_url: string, _init: any) => ({ status: 200, json: async () => ({ ok: true, token: "tok", status: "active", plan: "yearly" }) });
const fetch409 = async () => ({ status: 409, json: async () => ({ ok: false, error: "device_limit" }) });

test("authGithub returns token on 200", async () => {
  const r = await authGithub("http://b", "gho_x", "d1", fetchOk as any);
  assert.equal(r.ok && r.token, "tok");
});

test("authGithub maps device_limit 409", async () => {
  const r = await authGithub("http://b", "gho_x", "d1", fetch409 as any);
  assert.equal(!r.ok && r.code, "device_limit");
});

test("refreshAuth maps no_account 404", async () => {
  const r = await refreshAuth("http://b", "gho_x", "d1", (async () => ({ status: 404, json: async () => ({ ok: false, error: "no_account" }) })) as any);
  assert.equal(!r.ok && r.code, "no_account");
});

test("deactivateAccount returns ok on 200", async () => {
  const r = await deactivateAccount("http://b", "gho_x", "d1", (async () => ({ status: 200, json: async () => ({ ok: true }) })) as any);
  assert.equal(r.ok, true);
});

test("authGithub returns network code when fetch throws", async () => {
  const r = await authGithub("http://b", "gho_x", "d1", (async () => { throw new Error("offline"); }) as any);
  assert.equal(!r.ok && r.code, "network");
});
