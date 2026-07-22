import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { applySchema } from "./helpers";

describe("test harness", () => {
  beforeAll(async () => {
    await applySchema(env.DB as D1Database);
  });

  it("has a working D1 binding with the licenses table", async () => {
    const row = await (env.DB as D1Database)
      .prepare("SELECT count(*) AS n FROM licenses")
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("can generate an Ed25519 keypair in the worker runtime", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify"
    ])) as CryptoKeyPair;
    expect(pair.privateKey.type).toBe("private");
  });
});
