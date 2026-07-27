import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { AccountService, type DayStore } from "../../src/license/AccountService";
import type { SecretStore } from "../../src/license/AccountService";
import type { AuthProvider } from "../../src/license/githubSession";
import type { FetchLike } from "../../src/license/api";
import { localDayKey } from "../../src/license/recheck";

const subtle = webcrypto.subtle;
const b64url = (u8: Uint8Array) => Buffer.from(u8).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

async function keypair() {
  const pair = (await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as webcrypto.CryptoKeyPair;
  const raw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  return { pair, publicB64: Buffer.from(raw).toString("base64") };
}
async function mint(pair: webcrypto.CryptoKeyPair, iatSec: number, status = "active"): Promise<string> {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })));
  const body = b64url(Buffer.from(JSON.stringify({ sub: "acct_1", deviceId: "dev", status, plan: "monthly", iat: iatSec, exp: iatSec + 7 * 24 * 3600 })));
  const input = `${header}.${body}`;
  const sig = new Uint8Array(await subtle.sign({ name: "Ed25519" }, pair.privateKey, Buffer.from(input)));
  return `${input}.${b64url(sig)}`;
}
function memSecrets(): SecretStore {
  const data: Record<string, string> = {};
  return { get: (k) => Promise.resolve(data[k]), store: (k, v) => { data[k] = v; return Promise.resolve(); }, delete: (k) => { delete data[k]; return Promise.resolve(); } };
}
function memDay(initial?: string) {
  let v: string | undefined = initial;
  const store: DayStore = { get: (_k) => v, update: (_k, nv) => { v = nv; return Promise.resolve(); } };
  return { store, current: () => v };
}
function make(o: { publicB64: string; fetchImpl: FetchLike; now: () => number; auth: AuthProvider; secrets?: SecretStore; dayStore?: DayStore }) {
  return new AccountService({
    secrets: o.secrets ?? memSecrets(),
    dayStore: o.dayStore ?? memDay().store,
    auth: o.auth,
    deviceId: "dev",
    baseUrl: "https://api",
    publicKeyB64: o.publicB64,
    fetchImpl: o.fetchImpl,
    now: o.now
  });
}

test("signIn (interactive) stores a token; isPro reflects an active token offline; marks checked today", async () => {
  const { pair, publicB64 } = await keypair();
  const nowSec = 1_700_000_000, nowMs = nowSec * 1000 + 1000;
  const token = await mint(pair, nowSec);
  const day = memDay();
  let createIfNone: boolean | undefined;
  const auth: AuthProvider = { getSession: async (c) => { createIfNone = c; return { accessToken: "gho_x" }; } };
  const fetchImpl: FetchLike = async () => ({ status: 200, json: async () => ({ ok: true, token, status: "active", plan: "monthly" }) });
  const svc = make({ publicB64, fetchImpl, now: () => nowMs, auth, dayStore: day.store });
  await svc.init();
  const r = await svc.signIn();
  assert.equal(r.ok, true);
  assert.equal(createIfNone, true);            // interactive
  assert.equal(svc.isSignedIn(), true);
  assert.equal(svc.isPro(), true);
  assert.equal(day.current(), localDayKey(nowMs)); // marked checked today
});

test("recheckIfNewDay does nothing when already checked today (no auth, no fetch)", async () => {
  const { publicB64 } = await keypair();
  const nowMs = 1_700_000_000_000;
  const day = memDay(localDayKey(nowMs));
  let fetchCalls = 0, authCalls = 0;
  const auth: AuthProvider = { getSession: async () => { authCalls++; return { accessToken: "gho_x" }; } };
  const fetchImpl: FetchLike = async () => { fetchCalls++; return { status: 200, json: async () => ({}) }; };
  const svc = make({ publicB64, fetchImpl, now: () => nowMs, auth, dayStore: day.store });
  await svc.init();
  await svc.recheckIfNewDay();
  assert.equal(fetchCalls, 0);
  assert.equal(authCalls, 0);
});

test("recheckIfNewDay (silent) refreshes and advances lastCheckDay on a new day", async () => {
  const { pair, publicB64 } = await keypair();
  const nowSec = 1_700_000_000, nowMs = nowSec * 1000 + 1000;
  const token = await mint(pair, nowSec);
  const day = memDay("2000-01-01"); // stale
  let createIfNone: boolean | undefined, fetchCalls = 0;
  const auth: AuthProvider = { getSession: async (c) => { createIfNone = c; return { accessToken: "gho_x" }; } };
  const fetchImpl: FetchLike = async () => { fetchCalls++; return { status: 200, json: async () => ({ ok: true, token, status: "active", plan: "monthly" }) }; };
  const svc = make({ publicB64, fetchImpl, now: () => nowMs, auth, dayStore: day.store });
  await svc.init();
  await svc.recheckIfNewDay();
  assert.equal(createIfNone, false);           // silent
  assert.equal(fetchCalls, 1);
  assert.equal(day.current(), localDayKey(nowMs));
  assert.equal(svc.isPro(), true);
});

test("a definitive no_account on recheck clears the cached token", async () => {
  const { pair, publicB64 } = await keypair();
  const nowSec = 1_700_000_000, nowMs = nowSec * 1000 + 1000;
  const active = await mint(pair, nowSec);
  const day = memDay();
  const auth: AuthProvider = { getSession: async () => ({ accessToken: "gho_x" }) };
  let call = 0;
  const fetchImpl: FetchLike = async () => {
    call++;
    if (call === 1) return { status: 200, json: async () => ({ ok: true, token: active, status: "active", plan: "monthly" }) };
    return { status: 404, json: async () => ({ ok: false, error: "no_account" }) };
  };
  const svc = make({ publicB64, fetchImpl, now: () => nowMs, auth, dayStore: day.store });
  await svc.init();
  await svc.signIn();
  assert.equal(svc.isPro(), true);
  await day.store.update("k", "2000-01-01"); // force a new day
  await svc.recheckIfNewDay();
  assert.equal(svc.isPro(), false);
  assert.equal(svc.isSignedIn(), false);
});

test("network error on recheck keeps the token (grace) and does not advance the day", async () => {
  const { pair, publicB64 } = await keypair();
  const nowSec = 1_700_000_000, nowMs = nowSec * 1000 + 1000;
  const active = await mint(pair, nowSec);
  const day = memDay();
  const auth: AuthProvider = { getSession: async () => ({ accessToken: "gho_x" }) };
  let call = 0;
  const fetchImpl: FetchLike = async () => {
    call++;
    if (call === 1) return { status: 200, json: async () => ({ ok: true, token: active, status: "active", plan: "monthly" }) };
    throw new Error("offline");
  };
  const svc = make({ publicB64, fetchImpl, now: () => nowMs, auth, dayStore: day.store });
  await svc.init();
  await svc.signIn();
  await day.store.update("k", "2000-01-01"); // force a new day
  await svc.recheckIfNewDay();
  assert.equal(svc.isPro(), true);          // grace kept
  assert.equal(day.current(), "2000-01-01"); // NOT advanced -> retry next start
});

test("silent recheck with no GitHub session keeps the token and does not advance the day", async () => {
  const { pair, publicB64 } = await keypair();
  const nowSec = 1_700_000_000, nowMs = nowSec * 1000 + 1000;
  const active = await mint(pair, nowSec);
  const day = memDay();
  let session: { accessToken: string } | undefined = { accessToken: "gho_x" };
  const auth: AuthProvider = { getSession: async () => session };
  let fetchCalls = 0;
  const fetchImpl: FetchLike = async () => { fetchCalls++; return { status: 200, json: async () => ({ ok: true, token: active, status: "active", plan: "monthly" }) }; };
  const svc = make({ publicB64, fetchImpl, now: () => nowMs, auth, dayStore: day.store });
  await svc.init();
  await svc.signIn();
  const afterSignIn = fetchCalls;
  await day.store.update("k", "2000-01-01"); // force a new day
  session = undefined;                        // silent session now unavailable
  await svc.recheckIfNewDay();
  assert.equal(fetchCalls, afterSignIn);      // refreshAuth NOT called
  assert.equal(svc.isPro(), true);            // token kept
  assert.equal(day.current(), "2000-01-01");  // NOT advanced
});
