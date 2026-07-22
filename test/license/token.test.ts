import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { decodeToken, importPublicKey, verifyToken } from "../../src/license/token";

const subtle = webcrypto.subtle;
const b64url = (u8: Uint8Array) =>
  Buffer.from(u8).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

async function makeToken(payload: object): Promise<{ token: string; publicB64: string }> {
  const pair = (await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as webcrypto.CryptoKeyPair;
  const header = b64url(Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const input = `${header}.${body}`;
  const sig = new Uint8Array(await subtle.sign({ name: "Ed25519" }, pair.privateKey, Buffer.from(input)));
  const raw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  return { token: `${input}.${b64url(sig)}`, publicB64: Buffer.from(raw).toString("base64") };
}

const payload = { sub: "h", deviceId: "d", status: "active", plan: "monthly", iat: 100, exp: 200 };

test("decodeToken parses claims without verifying", () => {
  assert.equal(decodeToken("aaa.bbb")?.sub, undefined); // malformed base64 body -> null
  assert.equal(decodeToken("not-a-token"), null);
});

test("verifyToken returns the payload for a valid signature", async () => {
  const { token, publicB64 } = await makeToken(payload);
  const key = await importPublicKey(publicB64);
  const result = await verifyToken(token, key);
  assert.deepEqual(result, payload);
});

test("verifyToken returns null for a tampered payload", async () => {
  const { token, publicB64 } = await makeToken(payload);
  const key = await importPublicKey(publicB64);
  const [h, , s] = token.split(".");
  const forgedBody = Buffer.from(JSON.stringify({ ...payload, status: "hacked" }))
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  assert.equal(await verifyToken(`${h}.${forgedBody}.${s}`, key), null);
});

test("verifyToken returns null for a token signed by a different key", async () => {
  const { token } = await makeToken(payload);
  const other = await makeToken(payload);
  const key = await importPublicKey(other.publicB64);
  assert.equal(await verifyToken(token, key), null);
});
