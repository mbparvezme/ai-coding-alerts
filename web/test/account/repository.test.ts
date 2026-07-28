import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema } from "../helpers";
import * as repo from "../../src/server/account/repository";

const identity = { githubId: 42, email: "a@b.com", name: "Ada", username: "ada", avatarUrl: "http://x/y.png" };

beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS subscriptions; DROP TABLE IF EXISTS devices; DROP TABLE IF EXISTS settings_backups; DROP TABLE IF EXISTS processed_events");
  await applySchema(env.DB);
});

describe("user upsert", () => {
  it("inserts a new user then updates on second upsert (same github_id, one row)", async () => {
    const u1 = await repo.upsertUserByGithub(env.DB, identity, 1000);
    expect(u1.id).toMatch(/^acct_/);
    const u2 = await repo.upsertUserByGithub(env.DB, { ...identity, name: "Ada L" }, 2000);
    expect(u2.id).toBe(u1.id);
    expect(u2.name).toBe("Ada L");
    expect(await repo.getUserByGithubId(env.DB, 42)).not.toBeNull();
  });

  it("defaults marketing_consent to 0", async () => {
    const u = await repo.upsertUserByGithub(env.DB, identity, 1000);
    expect(u.marketing_consent).toBe(0);
  });
});

describe("devices", () => {
  it("counts distinct devices and is idempotent per device", async () => {
    const u = await repo.upsertUserByGithub(env.DB, identity, 1000);
    await repo.upsertDevice(env.DB, u.id, "d1", 1000);
    await repo.upsertDevice(env.DB, u.id, "d1", 2000); // same device -> no new slot
    await repo.upsertDevice(env.DB, u.id, "d2", 1000);
    expect(await repo.countDevices(env.DB, u.id)).toBe(2);
    await repo.deleteDevice(env.DB, u.id, "d1");
    expect(await repo.countDevices(env.DB, u.id)).toBe(1);
  });
});

describe("subscriptions", () => {
  it("upserts and reads active subscription", async () => {
    const u = await repo.upsertUserByGithub(env.DB, identity, 1000);
    await repo.upsertSubscription(env.DB, { paddle_subscription_id: "sub_1", user_id: u.id, status: "active", plan: "yearly", created_at: 1, updated_at: 1 });
    expect((await repo.getActiveSubscription(env.DB, u.id))?.plan).toBe("yearly");
  });
});
