import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema, makeTestKeypair } from "../helpers";
import { handleDeactivate } from "../../src/handlers/deactivate";
import { handleActivate, type LicenseDeps } from "../../src/handlers/activate";
import * as repo from "../../src/license/repository";

const db = () => env.DB as D1Database;
async function deps(): Promise<LicenseDeps> {
  const kp = await makeTestKeypair();
  const { importSigningKey } = await import("../../src/lib/jwt");
  return { db: db(), signingKey: await importSigningKey(kp.privatePkcs8B64), now: () => 1000 };
}
const rq = (b: unknown, p: string) => new Request(`https://x/license/${p}`, { method: "POST", body: JSON.stringify(b) });

describe("handleDeactivate", () => {
  beforeEach(async () => {
    await applySchema(db());
    await db().prepare("DELETE FROM activations").run();
    await db().prepare("DELETE FROM licenses").run();
    await repo.insertLicense(db(), {
      license_key: "ACA-K", paddle_subscription_id: "s", paddle_customer_id: "c",
      paddle_transaction_id: null, email: "e@x.com", status: "active", plan: "monthly",
      device_limit: 3, created_at: 1, updated_at: 1
    });
  });

  it("frees a device slot", async () => {
    await handleActivate(rq({ licenseKey: "ACA-K", deviceId: "d1" }, "activate"), await deps());
    expect(await repo.countActivations(db(), "ACA-K")).toBe(1);
    const res = await handleDeactivate(rq({ licenseKey: "ACA-K", deviceId: "d1" }, "deactivate"), await deps());
    expect(res.status).toBe(200);
    expect(await repo.countActivations(db(), "ACA-K")).toBe(0);
  });

  it("is idempotent for an unknown device", async () => {
    const res = await handleDeactivate(rq({ licenseKey: "ACA-K", deviceId: "ghost" }, "deactivate"), await deps());
    expect(res.status).toBe(200);
  });

  it("400 when fields are missing", async () => {
    const res = await handleDeactivate(rq({ licenseKey: "ACA-K" }, "deactivate"), await deps());
    expect(res.status).toBe(400);
  });
});
