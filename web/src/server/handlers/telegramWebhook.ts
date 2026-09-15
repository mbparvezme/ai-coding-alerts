import {
  getRelayRequest,
  resolveRelayRequest,
  getTelegramLink,
  getTelegramLinkByChat,
  upsertTelegramLink,
  consumeLinkCode
} from "../relay/repository";
import type { TelegramClient } from "../relay/telegram";

export interface TelegramWebhookDeps {
  db: D1Database;
  now: () => number;
  telegram: TelegramClient;
  webhookSecret: string;
}

interface Update {
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } };
  message?: { text?: string; chat: { id: number } };
}

function parseCallback(data: string): { requestId: string; choice: "approve" | "deny" } | null {
  const parts = data.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  if (parts[2] !== "approve" && parts[2] !== "deny") return null;
  if (!parts[1]) return null;
  return { requestId: parts[1], choice: parts[2] };
}

export async function handleTelegramWebhook(request: Request, deps: TelegramWebhookDeps): Promise<Response> {
  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== deps.webhookSecret) {
    return new Response("unauthorized", { status: 401 });
  }
  const update = (await request.json().catch(() => null)) as Update | null;
  if (!update) return new Response("ok");
  const now = deps.now();

  const cq = update.callback_query;
  if (cq?.data && cq.message) {
    const parsed = parseCallback(cq.data);
    if (parsed) {
      const row = await getRelayRequest(deps.db, parsed.requestId);
      const link = row ? await getTelegramLink(deps.db, row.user_id) : null;
      if (row && link && link.chat_id === String(cq.message.chat.id)) {
        const ok = await resolveRelayRequest(deps.db, parsed.requestId, parsed.choice === "approve" ? "allow" : "deny", now);
        const label = parsed.choice === "approve" ? "✅ Approved" : "⛔ Denied";
        try { await deps.telegram.editMessageText(link.chat_id, cq.message.message_id, ok ? label : "Already handled"); } catch { /* best-effort */ }
        await deps.telegram.answerCallbackQuery(cq.id, ok ? label : "Already handled");
      } else {
        await deps.telegram.answerCallbackQuery(cq.id, "Not authorized");
      }
    }
    return new Response("ok");
  }

  const text = update.message?.text?.trim();
  if (text?.startsWith("/start ") && update.message) {
    const chatId = String(update.message.chat.id);
    const code = text.slice("/start ".length).trim();
    const consumed = await consumeLinkCode(deps.db, code, now);
    if (!consumed) {
      await deps.telegram.sendMessage(chatId, "That link expired. Generate a fresh one from AI Coding Alerts.");
      return new Response("ok");
    }
    const existing = await getTelegramLinkByChat(deps.db, chatId);
    if (existing && existing.user_id !== consumed.user_id) {
      await deps.telegram.sendMessage(chatId, "This Telegram is already linked to another AI Coding Alerts account.");
      return new Response("ok");
    }
    await upsertTelegramLink(deps.db, consumed.user_id, chatId, now);
    await deps.telegram.sendMessage(chatId, "✅ Linked — approval requests will arrive here.");
  }
  return new Response("ok");
}
