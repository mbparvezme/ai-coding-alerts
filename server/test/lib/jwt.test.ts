import { describe, it, expect } from "vitest";
import { importSigningKey, signLicenseToken, type TokenPayload } from "../../src/lib/jwt";
import { makeTestKeypair } from "../helpers";

const payload: TokenPayload = {
  sub: "hashedkey",
  deviceId: "dev-1",
  status: "active",
  plan: "monthly",
  iat: 1_700_000_000,
  exp: 1_700_604_800
};

describe("signLicenseToken", () => {
  it("produces a 3-part EdDSA JWT that verifies against the public key", async () => {
    const kp = await makeTestKeypair();
    const key = await importSigningKey(kp.privatePkcs8B64);
    const token = await signLicenseToken(payload, key);

    const parts = token.split(".");
    expect(parts).toHaveLength(3);

    const header = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
    expect(header).toEqual({ alg: "EdDSA", typ: "JWT" });

    // Verify with the raw public key.
    const rawPub = Uint8Array.from(atob(kp.publicKeyB64), (c) => c.charCodeAt(0));
    const pubKey = await crypto.subtle.importKey("raw", rawPub, { name: "Ed25519" }, false, ["verify"]);
    const sig = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    expect(await crypto.subtle.verify({ name: "Ed25519" }, pubKey, sig, signingInput)).toBe(true);
  });

  it("embeds the payload claims", async () => {
    const kp = await makeTestKeypair();
    const key = await importSigningKey(kp.privatePkcs8B64);
    const token = await signLicenseToken(payload, key);
    const body = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    expect(body).toEqual(payload);
  });
});
