import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema, makeTestKeypair } from "../helpers";
import { handleValidate } from "../../src/handlers/validate";
import { handleActivate, type LicenseDeps } from "../../src/handlers/activate";
import * as repo from "../../src/license/repository";

const db = () => env.DB as D1Database;

async function deps(now = 2_000_000): Promise<LicenseDeps> {
  const kp = await makeTestKeypair();
  const { importSigningKey } = await import("../../src/lib/jwt");
  return { db: db(), signingKey: await importSigningKey(kp.privatePkcs8B64), now: () => now };
}
const rq = (b: unknown, p: string) => new Request(`https://x/license/${p}`, { method: "POST", body: JSON.stringify(b) });

async function seed(status = "active"): Promise<void> {
  await repo.insertLicense(db(), {
    license_key: "ACA-K", paddle_subscription_id: "s", paddle_customer_id: "c",
    paddle_transaction_id: null, email: "e@x.com", status, plan: "monthly",
    device_limit: 3, created_at: 1, updated_at: 1
  });
}

describe("handleValidate", () => {
  beforeEach(async () => {
    await applySchema(db());
    await db().prepare("DELETE FROM activations").run();
    await db().prepare("DELETE FROM licenses").run();
  });

  it("returns a fresh token and updates last_seen for an activated device", async () => {
    await seed();
    await handleActivate(rq({ licenseKey: "ACA-K", deviceId: "d1" }, "activate"), await deps(1_000_000));
    const res = await handleValidate(rq({ licenseKey: "ACA-K", deviceId: "d1" }, "validate"), await deps(9_000_000));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; token: string };
    expect(body.ok).toBe(true);
    expect(body.token.split(".")).toHaveLength(3);
    const seen = await db().prepare("SELECT last_seen_at FROM activations WHERE license_key='ACA-K' AND device_id='d1'").first<{ last_seen_at: number }>();
    expect(seen?.last_seen_at).toBe(9_000_000);
  });

  it("409 not_activated when the device is not (or no longer) activated", async () => {
    await seed();
    const res = await handleValidate(rq({ licenseKey: "ACA-K", deviceId: "ghost" }, "validate"), await deps());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("not_activated");
  });

  it("403 inactive when the subscription was canceled", async () => {
    await seed();
    await handleActivate(rq({ licenseKey: "ACA-K", deviceId: "d1" }, "activate"), await deps());
    await repo.updateLicenseStatus(db(), "s", "canceled", 5);
    const res = await handleValidate(rq({ licenseKey: "ACA-K", deviceId: "d1" }, "validate"), await deps());
    expect(res.status).toBe(403);
  });

  it("404 for an unknown key", async () => {
    const res = await handleValidate(rq({ licenseKey: "nope", deviceId: "d1" }, "validate"), await deps());
    expect(res.status).toBe(404);
  });
});
