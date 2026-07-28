import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema } from "../helpers";
import { handleWebhook } from "../../src/server/handlers/webhook";
import * as repo from "../../src/server/account/repository";
import { signBody } from "../paddle/signHelper"; // small helper mirroring v1's webhook test

async function post(body: unknown, secret: string, now: number) {
  const raw = JSON.stringify(body);
  const sig = await signBody(raw, secret, now);
  return new Request("http://t/webhooks/paddle", { method: "POST", headers: { "Paddle-Signature": sig }, body: raw });
}

let userId: string;
beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS subscriptions; DROP TABLE IF EXISTS processed_events");
  await applySchema(env.DB);
  const u = await repo.upsertUserByGithub(env.DB, { githubId: 7, email: "g@x.com", name: "G", username: "g", avatarUrl: null }, 1);
  userId = u.id;
});

const deps = { db: env.DB, webhookSecret: "whsec_test", now: () => 1000 } as any;
const evt = (id: string, type: string, status: string) => ({ event_id: id, event_type: type, data: { id: "sub_1", customer_id: "ctm_1", status, custom_data: { accountId: userId }, items: [{ price: { billing_cycle: { interval: "year" } } }] } });

describe("handleWebhook", () => {
  it("links a new active subscription to the account and stores the customer id", async () => {
    const res = await handleWebhook(await post(evt("evt_1", "subscription.activated", "active"), "whsec_test", 1000), { ...deps, db: env.DB });
    expect(res.status).toBe(200);
    expect((await repo.getActiveSubscription(env.DB, userId))?.status).toBe("active");
    expect((await repo.getUserById(env.DB, userId))?.paddle_customer_id).toBe("ctm_1");
  });

  it("dedupes a replayed event id", async () => {
    await handleWebhook(await post(evt("evt_2", "subscription.activated", "active"), "whsec_test", 1000), { ...deps, db: env.DB });
    await handleWebhook(await post(evt("evt_2", "subscription.canceled", "canceled"), "whsec_test", 1000), { ...deps, db: env.DB });
    expect((await repo.getActiveSubscription(env.DB, userId))?.status).toBe("active"); // replay ignored
  });

  it("rejects a bad signature with 401", async () => {
    const res = await handleWebhook(await post(evt("evt_3", "subscription.activated", "active"), "wrong_secret", 1000), { ...deps, db: env.DB });
    expect(res.status).toBe(401);
  });

  it("returns 200 ignored on a signed but non-JSON body", async () => {
    const raw = "not json";
    const sig = await signBody(raw, "whsec_test", 1000);
    const req = new Request("http://t/webhooks/paddle", { method: "POST", headers: { "Paddle-Signature": sig }, body: raw });
    const res = await handleWebhook(req, { ...deps, db: env.DB });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: true });
  });
});
