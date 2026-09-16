import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, makeTestKeypair } from "../helpers";
import { handleAuthRefresh } from "../../src/server/handlers/authRefresh";
import { verifyToken } from "../../src/server/lib/jwt";
import * as repo from "../../src/server/account/repository";

const okGithub = async () => ({ status: 200, json: async () => ({ id: 7, login: "grace", name: "Grace", email: "g@x.com", avatar_url: null }) });
const req = (b: unknown) => new Request("http://t/auth/refresh", { method: "POST", body: JSON.stringify(b) });

let deps: any;
beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS subscriptions; DROP TABLE IF EXISTS devices; DROP TABLE IF EXISTS settings_backups; DROP TABLE IF EXISTS processed_events; DROP TABLE IF EXISTS telegram_links;");
  await applySchema(env.DB);
  const { signingKey, publicKey } = await makeTestKeypair();
  deps = { db: env.DB, signingKey, publicKey, githubFetch: okGithub, now: () => 5000 };
});

describe("handleAuthRefresh", () => {
  it("reflects an active subscription in the refreshed token", async () => {
    const u = await repo.upsertUserByGithub(env.DB, { githubId: 7, email: "g@x.com", name: "Grace", username: "grace", avatarUrl: null }, 1);
    await repo.upsertDevice(env.DB, u.id, "d1", 1);
    await repo.upsertSubscription(env.DB, { paddle_subscription_id: "sub_1", user_id: u.id, status: "active", plan: "yearly", created_at: 1, updated_at: 1 });
    const res = await handleAuthRefresh(req({ githubToken: "gho_x", deviceId: "d1" }), deps);
    const body = await res.json<any>();
    expect(body.status).toBe("active");
    expect((await verifyToken(body.token, deps.publicKey))?.status).toBe("active");
  });

  it("cancelled subscription refreshes to inactive", async () => {
    const u = await repo.upsertUserByGithub(env.DB, { githubId: 7, email: "g@x.com", name: "Grace", username: "grace", avatarUrl: null }, 1);
    await repo.upsertDevice(env.DB, u.id, "d1", 1);
    await repo.upsertSubscription(env.DB, { paddle_subscription_id: "sub_1", user_id: u.id, status: "canceled", plan: "yearly", created_at: 1, updated_at: 1 });
    expect((await (await handleAuthRefresh(req({ githubToken: "gho_x", deviceId: "d1" }), deps)).json<any>()).status).toBe("inactive");
  });

  it("404 when no account exists for the github identity", async () => {
    deps.githubFetch = async () => ({ status: 200, json: async () => ({ id: 999, login: "x", name: null, email: "z@x.com", avatar_url: null }) });
    expect((await handleAuthRefresh(req({ githubToken: "gho_x", deviceId: "d1" }), deps)).status).toBe(404);
  });

  it("reports telegramLinked once a link row exists", async () => {
    const u = await repo.upsertUserByGithub(env.DB, { githubId: 7, email: "g@x.com", name: "Grace", username: "grace", avatarUrl: null }, 1);
    await repo.upsertDevice(env.DB, u.id, "d1", 1);
    const before = await handleAuthRefresh(req({ githubToken: "gho_x", deviceId: "d1" }), deps);
    expect((await before.json<any>()).telegramLinked).toBe(false);
    await env.DB.prepare("INSERT INTO telegram_links (user_id, chat_id, linked_at) VALUES (?, '555', 0)").bind(u.id).run();
    const after = await handleAuthRefresh(req({ githubToken: "gho_x", deviceId: "d1" }), deps);
    expect((await after.json<any>()).telegramLinked).toBe(true);
  });
});
