import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema } from "../helpers";

beforeEach(async () => {
  await env.DB.exec(
    "DROP TABLE IF EXISTS relay_requests; DROP TABLE IF EXISTS telegram_link_codes; DROP TABLE IF EXISTS telegram_links; DROP TABLE IF EXISTS users"
  );
  await applySchema(env.DB);
});

describe("relay schema", () => {
  it("creates the three relay tables and enforces chat_id uniqueness", async () => {
    await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_1', 1, 0, 0)").run();
    await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_2', 2, 0, 0)").run();
    await env.DB.prepare("INSERT INTO telegram_links (user_id, chat_id, linked_at) VALUES (?,?,?)")
      .bind("acct_1", "555", 1).run();
    await expect(
      env.DB.prepare("INSERT INTO telegram_links (user_id, chat_id, linked_at) VALUES (?,?,?)")
        .bind("acct_2", "555", 1).run()
    ).rejects.toThrow();
    await env.DB.prepare("INSERT INTO relay_requests (request_id, user_id, device_id, status, created_at, expires_at) VALUES (?,?,?,?,?,?)")
      .bind("req_1", "acct_1", "dev_1", "pending", 1, 100).run();
    const row = await env.DB.prepare("SELECT status FROM relay_requests WHERE request_id = ?").bind("req_1").first<{ status: string }>();
    expect(row?.status).toBe("pending");
  });
});
