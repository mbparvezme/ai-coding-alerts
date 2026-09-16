import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, makeTestKeypair } from "../helpers";
import { signLicenseToken } from "../../src/server/lib/jwt";
import { handleRelayDecision } from "../../src/server/handlers/relayDecision";

let deps: any, signingKey: CryptoKey;
beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS relay_requests; DROP TABLE IF EXISTS users");
  await applySchema(env.DB);
  await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_1', 1, 0, 0)").run();
  const kp = await makeTestKeypair();
  signingKey = kp.signingKey;
  deps = { db: env.DB, verifyKey: kp.publicKey, now: () => 1000 };
});
const authReq = async (sub = "acct_1") => new Request("http://t/relay/decision/x", { headers: { Authorization: `Bearer ${await signLicenseToken({ sub, deviceId: "d1", status: "active", plan: "monthly", iat: 0, exp: 9_999_999 }, signingKey)}` } });

describe("relay decision", () => {
  it("returns the resolved status for the owning account", async () => {
    await env.DB.prepare("INSERT INTO relay_requests (request_id, user_id, device_id, status, created_at, expires_at) VALUES ('r1','acct_1','d1','allow',0,9999999999999)").run();
    const res = await handleRelayDecision(await authReq(), deps, "r1");
    expect((await res.json<any>()).status).toBe("allow");
  });

  it("reports expired for a pending-but-past-expiry row, an unknown id, and a foreign row", async () => {
    await env.DB.prepare("INSERT INTO relay_requests (request_id, user_id, device_id, status, created_at, expires_at) VALUES ('r2','acct_1','d1','pending',0,100)").run();
    await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_2', 2, 0, 0)").run();
    await env.DB.prepare("INSERT INTO relay_requests (request_id, user_id, device_id, status, created_at, expires_at) VALUES ('r3','acct_2','d1','allow',0,9999999999999)").run();
    expect((await (await handleRelayDecision(await authReq(), deps, "r2")).json<any>()).status).toBe("expired"); // past expiry
    expect((await (await handleRelayDecision(await authReq(), deps, "nope")).json<any>()).status).toBe("expired"); // unknown
    expect((await (await handleRelayDecision(await authReq(), deps, "r3")).json<any>()).status).toBe("expired"); // foreign
  });
});
