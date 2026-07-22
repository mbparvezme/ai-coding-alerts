import { describe, it, expect } from "vitest";
import { verifyPaddleSignature } from "../../src/paddle/signature";

const secret = "whsec_test";
const body = '{"event_type":"subscription.created"}';

async function sign(ts: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${rawBody}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifyPaddleSignature", () => {
  it("accepts a correctly computed signature", async () => {
    const h1 = await sign("1700000000", body);
    expect(await verifyPaddleSignature(body, `ts=1700000000;h1=${h1}`, secret)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const h1 = await sign("1700000000", body);
    expect(await verifyPaddleSignature(body + "x", `ts=1700000000;h1=${h1}`, secret)).toBe(false);
  });

  it("rejects a malformed header", async () => {
    expect(await verifyPaddleSignature(body, "garbage", secret)).toBe(false);
  });

  it("rejects the wrong secret", async () => {
    const h1 = await sign("1700000000", body);
    expect(await verifyPaddleSignature(body, `ts=1700000000;h1=${h1}`, "wrong")).toBe(false);
  });
});
