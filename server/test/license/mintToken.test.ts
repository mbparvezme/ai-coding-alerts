import { describe, it, expect } from "vitest";
import { mintLicenseToken } from "../../src/license/mintToken";
import { sha256Hex } from "../../src/lib/encoding";
import { makeTestKeypair } from "../helpers";
import { importSigningKey } from "../../src/lib/jwt";
import type { LicenseRow } from "../../src/license/repository";

function sampleRow(overrides: Partial<LicenseRow> = {}): LicenseRow {
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

describe("mintLicenseToken", () => {
  it("signs a token whose claims match the license, device, and a 7-day TTL", async () => {
    const kp = await makeTestKeypair();
    const key = await importSigningKey(kp.privatePkcs8B64);
    const license = sampleRow();
    const nowMs = 1_700_000_000_000;

    const token = await mintLicenseToken(license, "dev-1", nowMs, key);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);

    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    expect(payload.exp - payload.iat).toBe(604800);
    expect(payload.sub).toBe(await sha256Hex(license.license_key));
    expect(payload.deviceId).toBe("dev-1");
    expect(payload.status).toBe(license.status);
    expect(payload.plan).toBe(license.plan);
    expect(payload.iat).toBe(Math.floor(nowMs / 1000));
  });
});
