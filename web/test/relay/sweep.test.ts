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

describe("relay lazy expiry sweep", () => {
  it("deletes only relay_requests whose expires_at has passed, leaving live rows intact", async () => {
    await repo.createRelayRequest(env.DB, {
      request_id: "expired_1",
      user_id: "acct_1",
      device_id: "d1",
      status: "pending",
      tg_message_id: null,
      created_at: 0,
      expires_at: 100
    });
    await repo.createRelayRequest(env.DB, {
      request_id: "live_1",
      user_id: "acct_1",
      device_id: "d1",
      status: "pending",
      tg_message_id: null,
      created_at: 0,
      expires_at: 1000
    });

    const deleted = await repo.sweepExpiredRelayRequests(env.DB, 500);
    expect(deleted).toBe(1);

    expect(await repo.getRelayRequest(env.DB, "expired_1")).toBeNull();
    expect((await repo.getRelayRequest(env.DB, "live_1"))?.request_id).toBe("live_1");
  });

  it("does not delete a resolved relay_request before its expires_at (resolve must never trigger deletion)", async () => {
    await repo.createRelayRequest(env.DB, {
      request_id: "resolved_1",
      user_id: "acct_1",
      device_id: "d1",
      status: "pending",
      tg_message_id: null,
      created_at: 0,
      expires_at: 1000
    });
    expect(await repo.resolveRelayRequest(env.DB, "resolved_1", "allow", 10)).toBe(true);

    const deleted = await repo.sweepExpiredRelayRequests(env.DB, 500);
    expect(deleted).toBe(0);
    expect((await repo.getRelayRequest(env.DB, "resolved_1"))?.status).toBe("allow");
  });

  it("deletes only telegram_link_codes whose expires_at has passed, leaving live codes intact", async () => {
    await repo.createLinkCode(env.DB, "expired_code", "acct_1", 100);
    await repo.createLinkCode(env.DB, "live_code", "acct_1", 1000);

    const deleted = await repo.sweepExpiredLinkCodes(env.DB, 500);
    expect(deleted).toBe(1);

    const expiredRow = await env.DB.prepare("SELECT code FROM telegram_link_codes WHERE code = 'expired_code'").first();
    const liveRow = await env.DB.prepare("SELECT code FROM telegram_link_codes WHERE code = 'live_code'").first();
    expect(expiredRow).toBeNull();
    expect(liveRow).not.toBeNull();
  });
});
