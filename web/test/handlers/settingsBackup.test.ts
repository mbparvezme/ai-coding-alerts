import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema } from "../helpers";
import { handleSettingsBackupGet, handleSettingsBackupPut } from "../../src/server/handlers/settingsBackup";

const okGithub = async () => ({ status: 200, json: async () => ({ id: 7, login: "g", name: "G", email: "g@x.com", avatar_url: null }) });
let deps: any;
beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS settings_backups");
  await applySchema(env.DB);
  deps = { db: env.DB, githubFetch: okGithub, now: () => 1 };
});

describe("settings backup", () => {
  it("round-trips a blob for the signed-in user", async () => {
    const putRes = await handleSettingsBackupPut(new Request("http://t/settings-backup", { method: "PUT", body: JSON.stringify({ githubToken: "gho_x", blob: "{\"sound\":true}" }) }), deps);
    expect(putRes.status).toBe(200);
    const getRes = await handleSettingsBackupGet(new Request("http://t/settings-backup", { headers: { Authorization: "Bearer gho_x" } }), deps);
    expect((await getRes.json<any>()).blob).toBe("{\"sound\":true}");
  });

  it("401 without a valid github token", async () => {
    deps.githubFetch = async () => ({ status: 401, json: async () => ({}) });
    const res = await handleSettingsBackupGet(new Request("http://t/settings-backup", { headers: { Authorization: "Bearer bad" } }), deps);
    expect(res.status).toBe(401);
  });
});
