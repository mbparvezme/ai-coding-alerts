import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, makeTestKeypair } from "../helpers";
import { handleAuthGithub } from "../../src/server/handlers/authGithub";
import { verifyToken } from "../../src/server/lib/jwt";
import * as repo from "../../src/server/account/repository";
import type { GithubFetch } from "../../src/server/account/github";

const okGithub: GithubFetch = async () => ({ status: 200, json: async () => ({ id: 7, login: "grace", name: "Grace", email: "g@x.com", avatar_url: "http://a/g.png" }) });
const req = (body: unknown) => new Request("http://t/auth/github", { method: "POST", body: JSON.stringify(body) });

let deps: any;
beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS subscriptions; DROP TABLE IF EXISTS devices; DROP TABLE IF EXISTS settings_backups; DROP TABLE IF EXISTS processed_events");
  await applySchema(env.DB);
  const { signingKey, publicKey } = await makeTestKeypair();
  deps = { db: env.DB, signingKey, publicKey, githubFetch: okGithub, now: () => 1000 };
});

describe("handleAuthGithub", () => {
  it("creates the account, activates the device, returns a token with sub=accountId", async () => {
    const res = await handleAuthGithub(req({ githubToken: "gho_x", deviceId: "d1" }), deps);
    const body = await res.json<any>();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const user = await repo.getUserByGithubId(env.DB, 7);
    const payload = await verifyToken(body.token, deps.publicKey);
    expect(payload?.sub).toBe(user!.id);
    expect(payload?.status).toBe("inactive"); // no subscription yet -> free
  });

  it("free account (no subscription) still returns a token but status inactive", async () => {
    const res = await handleAuthGithub(req({ githubToken: "gho_x", deviceId: "d1" }), deps);
    expect((await res.json<any>()).status).toBe("inactive");
  });

  it("rejects a 4th device with 409", async () => {
    const u = await repo.upsertUserByGithub(env.DB, { githubId: 7, email: "g@x.com", name: "Grace", username: "grace", avatarUrl: null }, 1);
    for (const d of ["a", "b", "c"]) await repo.upsertDevice(env.DB, u.id, d, 1);
    const res = await handleAuthGithub(req({ githubToken: "gho_x", deviceId: "d4" }), deps);
    expect(res.status).toBe(409);
  });

  it("rejects an invalid github token with 401", async () => {
    deps.githubFetch = async () => ({ status: 401, json: async () => ({}) });
    const res = await handleAuthGithub(req({ githubToken: "bad", deviceId: "d1" }), deps);
    expect(res.status).toBe(401);
  });
});
