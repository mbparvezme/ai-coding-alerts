import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema } from "../helpers";
import { handleSuccessPage } from "../../src/handlers/successPage";
import * as repo from "../../src/license/repository";

const db = () => env.DB as D1Database;

describe("handleSuccessPage", () => {
  beforeEach(async () => {
    await applySchema(db());
    await db().prepare("DELETE FROM licenses").run();
  });

  it("400 when txn is missing", async () => {
    const res = await handleSuccessPage(new URL("https://x/license"), db());
    expect(res.status).toBe(400);
  });

  it("shows the license key for a known transaction", async () => {
    await repo.insertLicense(db(), {
      license_key: "ACA-SHOWN", paddle_subscription_id: "s", paddle_customer_id: "c",
      paddle_transaction_id: "txn_1", email: "e@x.com", status: "active", plan: "monthly",
      device_limit: 3, created_at: 1, updated_at: 1
    });
    const res = await handleSuccessPage(new URL("https://x/license?txn=txn_1"), db());
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("ACA-SHOWN");
  });

  it("shows an auto-refreshing pending page when the webhook has not arrived yet", async () => {
    const res = await handleSuccessPage(new URL("https://x/license?txn=unknown"), db());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("http-equiv=\"refresh\"");
    expect(html).not.toContain("ACA-");
  });
});
