import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema } from "../helpers";
import * as repo from "../../src/server/relay/repository";

beforeEach(async () => {
  await env.DB.exec(
    "DROP TABLE IF EXISTS relay_requests; DROP TABLE IF EXISTS telegram_link_codes; DROP TABLE IF EXISTS telegram_links; DROP TABLE IF EXISTS users"
  );
  await applySchema(env.DB);
  await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_1', 1, 0, 0)").run();
});

describe("relay repository", () => {
  it("links, looks up by user and chat, and unlinks", async () => {
    await repo.upsertTelegramLink(env.DB, "acct_1", "555", 10);
    expect((await repo.getTelegramLink(env.DB, "acct_1"))?.chat_id).toBe("555");
    expect((await repo.getTelegramLinkByChat(env.DB, "555"))?.user_id).toBe("acct_1");
    await repo.deleteTelegramLink(env.DB, "acct_1");
    expect(await repo.getTelegramLink(env.DB, "acct_1")).toBeNull();
  });

  it("consumes a link code once and only while unexpired", async () => {
    await repo.createLinkCode(env.DB, "code_a", "acct_1", 100);
    expect(await repo.consumeLinkCode(env.DB, "code_a", 200)).toBeNull(); // expired
    await repo.createLinkCode(env.DB, "code_b", "acct_1", 100);
    expect((await repo.consumeLinkCode(env.DB, "code_b", 50))?.user_id).toBe("acct_1");
    expect(await repo.consumeLinkCode(env.DB, "code_b", 50)).toBeNull(); // already consumed
  });

  it("resolves a relay request first-wins and not after expiry", async () => {
    await repo.createRelayRequest(env.DB, { request_id: "r1", user_id: "acct_1", device_id: "d1", status: "pending", tg_message_id: null, created_at: 0, expires_at: 100 });
    expect(await repo.countPendingRelay(env.DB, "acct_1", 10)).toBe(1);
    expect(await repo.resolveRelayRequest(env.DB, "r1", "allow", 10)).toBe(true);
    expect(await repo.resolveRelayRequest(env.DB, "r1", "deny", 10)).toBe(false); // already resolved
    expect((await repo.getRelayRequest(env.DB, "r1"))?.status).toBe("allow");

    await repo.createRelayRequest(env.DB, { request_id: "r2", user_id: "acct_1", device_id: "d1", status: "pending", tg_message_id: null, created_at: 0, expires_at: 100 });
    expect(await repo.resolveRelayRequest(env.DB, "r2", "allow", 200)).toBe(false); // expired
  });
});
