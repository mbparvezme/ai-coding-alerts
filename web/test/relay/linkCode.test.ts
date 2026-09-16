import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, makeTestKeypair } from "../helpers";
import { signLicenseToken } from "../../src/server/lib/jwt";
import { handleRelayLinkCode } from "../../src/server/handlers/relayLinkCode";

let deps: any, signingKey: CryptoKey;
beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS telegram_link_codes; DROP TABLE IF EXISTS users");
  await applySchema(env.DB);
  await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_1', 1, 0, 0)").run();
  const kp = await makeTestKeypair();
  signingKey = kp.signingKey;
  deps = { db: env.DB, verifyKey: kp.publicKey, now: () => 1000, botUsername: "AICAbot", genCode: () => "CODE1", codeTtlMs: 600_000 };
});
const auth = async () => `Bearer ${await signLicenseToken({ sub: "acct_1", deviceId: "d1", status: "active", plan: "monthly", iat: 0, exp: 9_999_999 }, signingKey)}`;

describe("relay link-code", () => {
  it("issues a code and deep link for an authenticated Pro user", async () => {
    const res = await handleRelayLinkCode(new Request("http://t/relay/link-code", { method: "POST", headers: { Authorization: await auth() } }), deps);
    const body = await res.json<any>();
    expect(res.status).toBe(200);
    expect(body.deepLink).toBe("https://t.me/AICAbot?start=CODE1");
    const stored = await env.DB.prepare("SELECT user_id, expires_at FROM telegram_link_codes WHERE code = 'CODE1'").first<any>();
    expect(stored).toEqual({ user_id: "acct_1", expires_at: 1000 + 600_000 });
  });

  it("401 without a valid token", async () => {
    const res = await handleRelayLinkCode(new Request("http://t/relay/link-code", { method: "POST" }), deps);
    expect(res.status).toBe(401);
  });
});
