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
  const pair = (await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as webcrypto.CryptoKeyPair;
  const raw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  return { pair, publicB64: Buffer.from(raw).toString("base64") };
}
async function mint(pair: webcrypto.CryptoKeyPair, iatSec: number, status = "active"): Promise<string> {
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
