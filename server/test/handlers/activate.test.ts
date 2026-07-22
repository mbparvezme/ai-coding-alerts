import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema, makeTestKeypair } from "../helpers";
import { handleActivate, type LicenseDeps } from "../../src/handlers/activate";
import * as repo from "../../src/license/repository";

const db = () => env.DB as D1Database;

async function deps(): Promise<LicenseDeps> {
  const kp = await makeTestKeypair();
  const { importSigningKey } = await import("../../src/lib/jwt");
  return { db: db(), signingKey: await importSigningKey(kp.privatePkcs8B64), now: () => 1_700_000 };
}

function req(body: unknown): Request {
  return new Request("https://x/license/activate", { method: "POST", body: JSON.stringify(body) });
}

async function seed(status = "active", device_limit = 3): Promise<void> {
  await repo.insertLicense(db(), {
    license_key: "ACA-K", paddle_subscription_id: "s", paddle_customer_id: "c",
    paddle_transaction_id: null, email: "e@x.com", status, plan: "monthly",
    device_limit, created_at: 1, updated_at: 1
  });
}

describe("handleActivate", () => {
  beforeEach(async () => {
    await applySchema(db());
    await db().prepare("DELETE FROM activations").run();
    await db().prepare("DELETE FROM licenses").run();
  });

  it("400 when licenseKey or deviceId is missing", async () => {
    expect((await handleActivate(req({ licenseKey: "ACA-K" }), await deps())).status).toBe(400);
  });

  it("404 for an unknown key", async () => {
    expect((await handleActivate(req({ licenseKey: "nope", deviceId: "d1" }), await deps())).status).toBe(404);
  });

  it("403 for an inactive subscription", async () => {
    await seed("canceled");
    expect((await handleActivate(req({ licenseKey: "ACA-K", deviceId: "d1" }), await deps())).status).toBe(403);
  });

  it("activates a device and returns a token with active status", async () => {
    await seed();
    const res = await handleActivate(req({ licenseKey: "ACA-K", deviceId: "d1" }), await deps());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; token: string; status: string; deviceLimit: number };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("active");
    expect(body.deviceLimit).toBe(3);
    expect(body.token.split(".")).toHaveLength(3);
    expect(await repo.getActivation(db(), "ACA-K", "d1")).toBe(true);
  });

  it("re-activating the same device is idempotent (still 200, count stays 1)", async () => {
    await seed();
    await handleActivate(req({ licenseKey: "ACA-K", deviceId: "d1" }), await deps());
    const res = await handleActivate(req({ licenseKey: "ACA-K", deviceId: "d1" }), await deps());
    expect(res.status).toBe(200);
    expect(await repo.countActivations(db(), "ACA-K")).toBe(1);
  });

  it("409 when a new device exceeds the limit", async () => {
    await seed("active", 1);
    await handleActivate(req({ licenseKey: "ACA-K", deviceId: "d1" }), await deps());
    const res = await handleActivate(req({ licenseKey: "ACA-K", deviceId: "d2" }), await deps());
    expect(res.status).toBe(409);
  });
});
