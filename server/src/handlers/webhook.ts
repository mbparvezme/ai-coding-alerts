import { verifyPaddleSignature } from "../paddle/signature";
import { parsePaddleEvent } from "../paddle/event";
import { resolvePlanDeviceLimit } from "../paddle/event";
import type { KeyDeliverer } from "../license/deliver";
import * as repo from "../license/repository";

export interface WebhookDeps {
  db: D1Database;
  webhookSecret: string;
  deliver: KeyDeliverer;
  now: () => number;
  newKey: () => string;
}

export async function handlePaddleWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  const rawBody = await request.text();
  const header = request.headers.get("Paddle-Signature") ?? "";
  if (!(await verifyPaddleSignature(rawBody, header, deps.webhookSecret))) {
    return Response.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const event = parsePaddleEvent(parsed);
  const now = deps.now();

  if (event.eventId && (await repo.hasProcessedEvent(deps.db, event.eventId))) {
    return Response.json({ ok: true, duplicate: true });
  }

  switch (event.kind) {
    case "created":
    case "activated": {
      if (!event.subscriptionId) break;
      const existing = await repo.getLicenseBySubscription(deps.db, event.subscriptionId);
      if (existing) {
        // Already provisioned — just ensure status is current (idempotent).
        await repo.updateLicenseStatus(deps.db, event.subscriptionId, event.status ?? "active", now);
        break;
      }
      const key = deps.newKey();
      await repo.insertLicense(deps.db, {
        license_key: key,
        paddle_subscription_id: event.subscriptionId,
        paddle_customer_id: event.customerId,
        paddle_transaction_id: event.transactionId,
        email: event.email,
        status: event.status ?? "active",
        plan: event.plan,
        device_limit: resolvePlanDeviceLimit(event.plan),
        created_at: now,
        updated_at: now
      });
      if (event.email) {
        await deps.deliver(event.email, key);
      }
      break;
    }
    case "updated":
    case "canceled":
    case "past_due": {
      if (event.subscriptionId && event.status) {
        await repo.updateLicenseStatus(deps.db, event.subscriptionId, event.status, now);
      }
      break;
    }
    case "transaction": {
      if (event.subscriptionId && event.transactionId) {
        await repo.setLicenseTransaction(deps.db, event.subscriptionId, event.transactionId, now);
      }
      break;
    }
    case "ignored":
      break;
  }

  if (event.eventId) {
    await repo.recordProcessedEvent(deps.db, event.eventId, now);
  }

  return Response.json({ ok: true });
}
