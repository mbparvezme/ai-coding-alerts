import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema } from "../helpers";
import { handlePaddleWebhook, type WebhookDeps } from "../../src/handlers/webhook";
import * as repo from "../../src/license/repository";

const db = () => env.DB as D1Database;
const SECRET = "whsec_test";

async function signedRequest(bodyObj: unknown): Promise<Request> {
  const body = JSON.stringify(bodyObj);
  const ts = "1700000000";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${body}`));
  const h1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("https://x/webhooks/paddle", {
    method: "POST",
    headers: { "Paddle-Signature": `ts=${ts};h1=${h1}` },
    body
  });
}

function deps(over: Partial<WebhookDeps> = {}): WebhookDeps {
  const delivered: Array<{ email: string; key: string }> = [];
  const d: WebhookDeps = {
    db: db(),
    webhookSecret: SECRET,
    deliver: async (email, key) => { delivered.push({ email, key }); },
    now: () => 1000,
    newKey: () => "ACA-NEWKEY",
    ...over
  };
  (d as WebhookDeps & { _delivered: typeof delivered })._delivered = delivered;
  return d;
}

describe("handlePaddleWebhook", () => {
  beforeEach(async () => {
    await applySchema(db());
    await db().prepare("DELETE FROM activations").run();
    await db().prepare("DELETE FROM licenses").run();
    await db().prepare("DELETE FROM processed_events").run();
  });

  it("rejects an invalid signature with 401", async () => {
    const req = new Request("https://x/webhooks/paddle", {
      method: "POST",
      headers: { "Paddle-Signature": "ts=1;h1=bad" },
      body: "{}"
    });
    const res = await handlePaddleWebhook(req, deps());
    expect(res.status).toBe(401);
  });

  it("on subscription.created mints a key, stores an active license, and delivers", async () => {
    const d = deps();
    const req = await signedRequest({
      event_type: "subscription.created",
      data: { id: "sub_1", customer_id: "ctm_1", email: "b@c.com", status: "active", items: [{ price: { billing_cycle: { interval: "month" } } }] }
    });
    const res = await handlePaddleWebhook(req, d);
    expect(res.status).toBe(200);

    const row = await repo.getLicenseByKey(db(), "ACA-NEWKEY");
    expect(row?.status).toBe("active");
    expect(row?.plan).toBe("monthly");
    expect(row?.device_limit).toBe(3);
    expect((d as unknown as { _delivered: Array<{ email: string; key: string }> })._delivered).toEqual([
      { email: "b@c.com", key: "ACA-NEWKEY" }
    ]);
  });

  it("is idempotent — a duplicate subscription.created does not create a second license", async () => {
    const req1 = await signedRequest({ event_type: "subscription.created", data: { id: "sub_1", customer_id: "c", status: "active", items: [{ price: { billing_cycle: { interval: "month" } } }] } });
    await handlePaddleWebhook(req1, deps());
    const req2 = await signedRequest({ event_type: "subscription.created", data: { id: "sub_1", customer_id: "c", status: "active", items: [{ price: { billing_cycle: { interval: "month" } } }] } });
    const res2 = await handlePaddleWebhook(req2, deps({ newKey: () => "ACA-SECOND" }));
    expect(res2.status).toBe(200);
    const count = await db().prepare("SELECT count(*) AS n FROM licenses WHERE paddle_subscription_id='sub_1'").first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("on subscription.canceled flips the stored status", async () => {
    await handlePaddleWebhook(await signedRequest({ event_type: "subscription.created", data: { id: "sub_1", customer_id: "c", status: "active", items: [{ price: { billing_cycle: { interval: "month" } } }] } }), deps());
    const res = await handlePaddleWebhook(await signedRequest({ event_type: "subscription.canceled", data: { id: "sub_1", status: "canceled" } }), deps());
    expect(res.status).toBe(200);
    expect((await repo.getLicenseByKey(db(), "ACA-NEWKEY"))?.status).toBe("canceled");
  });

  it("on transaction.completed links the transaction id for the success page", async () => {
    await handlePaddleWebhook(await signedRequest({ event_type: "subscription.created", data: { id: "sub_1", customer_id: "c", status: "active", items: [{ price: { billing_cycle: { interval: "month" } } }] } }), deps());
    await handlePaddleWebhook(await signedRequest({ event_type: "transaction.completed", data: { id: "txn_1", subscription_id: "sub_1" } }), deps());
    expect((await repo.getLicenseByTransaction(db(), "txn_1"))?.license_key).toBe("ACA-NEWKEY");
  });

  it("replay protection — a replayed event_id does not reprocess (e.g. reactivate a canceled license)", async () => {
    const createdBody = {
      event_type: "subscription.created",
      event_id: "evt_created_1",
      data: { id: "sub_1", customer_id: "c", status: "active", items: [{ price: { billing_cycle: { interval: "month" } } }] }
    };
    const createdReq = await signedRequest(createdBody);
    const createdRes = await handlePaddleWebhook(createdReq, deps());
    expect(createdRes.status).toBe(200);
    expect((await repo.getLicenseByKey(db(), "ACA-NEWKEY"))?.status).toBe("active");

    // Cancel the subscription.
    await handlePaddleWebhook(
      await signedRequest({ event_type: "subscription.canceled", event_id: "evt_canceled_1", data: { id: "sub_1", status: "canceled" } }),
      deps()
    );
    expect((await repo.getLicenseByKey(db(), "ACA-NEWKEY"))?.status).toBe("canceled");

    // Paddle retries the OLD subscription.created event (same event_id, same body).
    const replayReq = await signedRequest(createdBody);
    const replayRes = await handlePaddleWebhook(replayReq, deps({ newKey: () => "ACA-SHOULD-NOT-MINT" }));
    expect(replayRes.status).toBe(200);
    expect((await replayRes.json()) as { duplicate?: boolean }).toMatchObject({ duplicate: true });

    // Status must stay canceled — the replayed created event must NOT reactivate it.
    expect((await repo.getLicenseByKey(db(), "ACA-NEWKEY"))?.status).toBe("canceled");
    // No second license was minted.
    const count = await db().prepare("SELECT count(*) AS n FROM licenses WHERE paddle_subscription_id='sub_1'").first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("payloads without an event_id are processed normally (dedupe skipped, existing behavior unchanged)", async () => {
    const req1 = await signedRequest({ event_type: "subscription.created", data: { id: "sub_2", customer_id: "c", status: "active", items: [{ price: { billing_cycle: { interval: "month" } } }] } });
    const res1 = await handlePaddleWebhook(req1, deps());
    expect(res1.status).toBe(200);
    expect((await res1.json()) as { duplicate?: boolean }).not.toMatchObject({ duplicate: true });
  });
});
