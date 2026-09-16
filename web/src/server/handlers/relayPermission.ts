import { authenticateRelay } from "../relay/relayAuth";
import { getTelegramLink, createRelayRequest, setRelayMessageId, countPendingRelay, sweepExpiredRelayRequests } from "../relay/repository";
import type { TelegramClient } from "../relay/telegram";

export interface RelayPermissionDeps {
  db: D1Database;
  verifyKey: CryptoKey;
  now: () => number;
  telegram: TelegramClient;
  genRequestId: () => string;
  maxPending: number;
}

const MAX_CMD = 200;

export async function handleRelayPermission(request: Request, deps: RelayPermissionDeps): Promise<Response> {
  const now = deps.now();
  const id = await authenticateRelay(request, deps.verifyKey, now);
  if (!id) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // Lazy expiry sweep: opportunistic housekeeping only, never allowed to affect the response.
  await sweepExpiredRelayRequests(deps.db, now).catch(() => {});

  const body = (await request.json().catch(() => null)) as { tool?: string; command?: string; ttlSec?: number } | null;
  if (!body || typeof body.ttlSec !== "number" || body.ttlSec <= 0) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const link = await getTelegramLink(deps.db, id.accountId);
  if (!link) return Response.json({ ok: false, error: "not_linked" }, { status: 409 });

  if ((await countPendingRelay(deps.db, id.accountId, now)) >= deps.maxPending) {
    return Response.json({ ok: false, error: "too_many" }, { status: 429 });
  }

  const requestId = deps.genRequestId();
  const expiresAt = now + body.ttlSec * 1000;
  await createRelayRequest(deps.db, {
    request_id: requestId,
    user_id: id.accountId,
    device_id: id.deviceId,
    status: "pending",
    tg_message_id: null,
    created_at: now,
    expires_at: expiresAt
  });

  const tool = (body.tool ?? "a tool").slice(0, 60);
  const command = (body.command ?? "").slice(0, MAX_CMD);
  const text = command ? `🔔 Permission needed\n${tool}: ${command}` : `🔔 Permission needed\n${tool}`;
  try {
    const { message_id } = await deps.telegram.sendMessage(link.chat_id, text, [
      [
        { text: "✅ Approve", callback_data: `v1:${requestId}:approve` },
        { text: "⛔ Deny", callback_data: `v1:${requestId}:deny` }
      ]
    ]);
    await setRelayMessageId(deps.db, requestId, message_id);
  } catch {
    // Message send failed: leave the row pending; the device poll will read it and
    // time out to the native prompt. Fail-safe, never fail-open.
  }
  return Response.json({ ok: true, requestId, expiresAt });
}
