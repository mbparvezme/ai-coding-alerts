import { test, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema } from "../../../test/helpers";
import { upsertUserByGithub, upsertDevice, putSettingsBackup } from "@/server/account/repository";
import { listDevices, getSettingsBackupMeta } from "@/server/account/repository";
import { getDashboardData } from "./loader";

beforeEach(async () => {
  await env.DB.exec(
    "DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS subscriptions; DROP TABLE IF EXISTS devices; DROP TABLE IF EXISTS settings_backups; DROP TABLE IF EXISTS processed_events"
  );
  await applySchema(env.DB);
});

async function seedUser() {
  const u = await upsertUserByGithub(env.DB, { githubId: 5, email: "e@x.co", name: "E", username: "e", avatarUrl: null }, 1000);
  return u.id;
}

test("listDevices returns rows for the account", async () => {
  const id = await seedUser();
  await upsertDevice(env.DB, id, "dev-a", 1000);
  await upsertDevice(env.DB, id, "dev-b", 2000);
  const devices = await listDevices(env.DB, id);
  expect(devices.map((d) => d.device_id).sort()).toEqual(["dev-a", "dev-b"]);
});

test("getSettingsBackupMeta returns size + updatedAt", async () => {
  const id = await seedUser();
  await putSettingsBackup(env.DB, id, '{"k":1}', 4242);
  const meta = await getSettingsBackupMeta(env.DB, id);
  expect(meta).toEqual({ updatedAt: 4242, bytes: 7 });
});

test("getDashboardData composes user, devices, and backup", async () => {
  const id = await seedUser();
  await upsertDevice(env.DB, id, "dev-a", 1000);
  const data = await getDashboardData(env.DB, id);
  expect(data?.user.id).toBe(id);
  expect(data?.devices).toHaveLength(1);
  expect(data?.subscription).toBeNull();
});
