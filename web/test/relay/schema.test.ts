import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema } from "../helpers";

beforeEach(async () => {
  await env.DB.exec(
    "DROP TABLE IF EXISTS relay_requests; DROP TABLE IF EXISTS telegram_link_codes; DROP TABLE IF EXISTS telegram_links"
  );
  await applySchema(env.DB);
});

describe("relay schema", () => {
  it("creates the three relay tables and enforces chat_id uniqueness", async () => {
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
