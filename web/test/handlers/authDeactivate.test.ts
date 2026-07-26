import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, makeTestKeypair } from "../helpers";
import { handleAuthDeactivate } from "../../src/server/handlers/authDeactivate";
import * as repo from "../../src/server/account/repository";

const okGithub = async () => ({ status: 200, json: async () => ({ id: 7, login: "grace", name: "Grace", email: "g@x.com", avatar_url: null }) });
const req = (b: unknown) => new Request("http://t/auth/deactivate", { method: "POST", body: JSON.stringify(b) });

let deps: any;
beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS devices");
  await applySchema(env.DB);
  const { signingKey } = await makeTestKeypair();
  deps = { db: env.DB, signingKey, githubFetch: okGithub, now: () => 1 };
});

describe("handleAuthDeactivate", () => {
  it("frees the device slot", async () => {
    const u = await repo.upsertUserByGithub(env.DB, { githubId: 7, email: "g@x.com", name: "Grace", username: "grace", avatarUrl: null }, 1);
    await repo.upsertDevice(env.DB, u.id, "d1", 1);
    const res = await handleAuthDeactivate(req({ githubToken: "gho_x", deviceId: "d1" }), deps);
    expect(res.status).toBe(200);
    expect(await repo.countDevices(env.DB, u.id)).toBe(0);
  });

  it("is idempotent when the device is already gone", async () => {
    await repo.upsertUserByGithub(env.DB, { githubId: 7, email: "g@x.com", name: "Grace", username: "grace", avatarUrl: null }, 1);
    expect((await handleAuthDeactivate(req({ githubToken: "gho_x", deviceId: "nope" }), deps)).status).toBe(200);
  });
});
