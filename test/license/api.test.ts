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
