import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema } from "../helpers";
import * as repo from "../../src/license/repository";

const db = () => env.DB as D1Database;

function sampleRow(overrides: Partial<repo.LicenseRow> = {}): repo.LicenseRow {
  return {
    license_key: "ACA-KEY1",
    paddle_subscription_id: "sub_1",
    paddle_customer_id: "ctm_1",
    paddle_transaction_id: null,
    email: "a@b.com",
    status: "active",
    plan: "monthly",
    device_limit: 3,
    created_at: 1000,
    updated_at: 1000,
    ...overrides
  };
}

describe("repository", () => {
  beforeEach(async () => {
    await applySchema(db());
    await db().prepare("DELETE FROM activations").run();
    await db().prepare("DELETE FROM licenses").run();
  });

  it("inserts and reads a license by key, subscription, and transaction", async () => {
    await repo.insertLicense(db(), sampleRow({ paddle_transaction_id: "txn_1" }));
    expect((await repo.getLicenseByKey(db(), "ACA-KEY1"))?.email).toBe("a@b.com");
    expect((await repo.getLicenseBySubscription(db(), "sub_1"))?.license_key).toBe("ACA-KEY1");
    expect((await repo.getLicenseByTransaction(db(), "txn_1"))?.license_key).toBe("ACA-KEY1");
    expect(await repo.getLicenseByKey(db(), "nope")).toBeNull();
  });

  it("updates status by subscription id", async () => {
    await repo.insertLicense(db(), sampleRow());
    await repo.updateLicenseStatus(db(), "sub_1", "canceled", 2000);
    const row = await repo.getLicenseByKey(db(), "ACA-KEY1");
    expect(row?.status).toBe("canceled");
    expect(row?.updated_at).toBe(2000);
  });

  it("sets the transaction id by subscription id", async () => {
    await repo.insertLicense(db(), sampleRow());
    await repo.setLicenseTransaction(db(), "sub_1", "txn_9", 3000);
    expect((await repo.getLicenseByTransaction(db(), "txn_9"))?.license_key).toBe("ACA-KEY1");
  });

  it("counts, upserts (idempotent), and deletes activations", async () => {
    await repo.insertLicense(db(), sampleRow());
    expect(await repo.countActivations(db(), "ACA-KEY1")).toBe(0);

    await repo.upsertActivation(db(), "ACA-KEY1", "dev-1", 1000);
    await repo.upsertActivation(db(), "ACA-KEY1", "dev-1", 1500); // same device, no new row
    expect(await repo.countActivations(db(), "ACA-KEY1")).toBe(1);
    expect(await repo.getActivation(db(), "ACA-KEY1", "dev-1")).toBe(true);

    await repo.upsertActivation(db(), "ACA-KEY1", "dev-2", 1000);
    expect(await repo.countActivations(db(), "ACA-KEY1")).toBe(2);

    await repo.deleteActivation(db(), "ACA-KEY1", "dev-1");
    expect(await repo.countActivations(db(), "ACA-KEY1")).toBe(1);
    expect(await repo.getActivation(db(), "ACA-KEY1", "dev-1")).toBe(false);
  });

  it("touchLastSeen updates the timestamp", async () => {
    await repo.insertLicense(db(), sampleRow());
    await repo.upsertActivation(db(), "ACA-KEY1", "dev-1", 1000);
    await repo.touchLastSeen(db(), "ACA-KEY1", "dev-1", 5000);
    const row = await db()
      .prepare("SELECT last_seen_at FROM activations WHERE license_key=? AND device_id=?")
      .bind("ACA-KEY1", "dev-1")
      .first<{ last_seen_at: number }>();
    expect(row?.last_seen_at).toBe(5000);
  });
});
