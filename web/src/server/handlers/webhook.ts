import { verifyPaddleSignature } from "../paddle/signature";
import { parsePaddleEvent } from "../paddle/event";
import * as repo from "../account/repository";

export interface WebhookDeps {
  db: D1Database;
  webhookSecret: string;
  now: () => number;
}

export async function handleWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  const raw = await request.text();
  const signatureHeader = request.headers.get("Paddle-Signature") ?? "";

  const valid = await verifyPaddleSignature(raw, signatureHeader, deps.webhookSecret);
  if (!valid) {
    return Response.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: true, ignored: true }, { status: 200 });
  }
  const evt = parsePaddleEvent(body);
  if (!evt) {
    return Response.json({ ok: true, ignored: true }, { status: 200 });
  }

  if (await repo.hasProcessedEvent(deps.db, evt.eventId)) {
    return Response.json({ ok: true, duplicate: true }, { status: 200 });
  }

  if (evt.accountId) {
    const user = await repo.getUserById(deps.db, evt.accountId);
    if (user) {
      const nowMs = deps.now();
      await repo.upsertSubscription(deps.db, {
        paddle_subscription_id: evt.subscriptionId,
        user_id: evt.accountId,
        status: evt.status,
        plan: evt.plan ?? "",
        created_at: nowMs,
        updated_at: nowMs
      });
      if (evt.customerId) {
        await repo.setPaddleCustomerId(deps.db, evt.accountId, evt.customerId, nowMs);
      }
    }
  }

  await repo.recordProcessedEvent(deps.db, evt.eventId, deps.now());

  return Response.json({ ok: true }, { status: 200 });
}
