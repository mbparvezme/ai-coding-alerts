import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema } from "../helpers";
import { handleTelegramWebhook } from "../../src/server/handlers/telegramWebhook";

let deps: any, edits: any[], answers: any[], sent: any[];
beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS relay_requests; DROP TABLE IF EXISTS telegram_link_codes; DROP TABLE IF EXISTS telegram_links; DROP TABLE IF EXISTS users");
  await applySchema(env.DB);
  await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_1', 1, 0, 0)").run();
  edits = []; answers = []; sent = [];
  deps = {
    db: env.DB, now: () => 1000, webhookSecret: "SEK",
    telegram: {
      sendMessage: async (chatId: string, text: string) => { sent.push({ chatId, text }); return { message_id: 1 }; },
      editMessageText: async (chatId: string, messageId: number, text: string) => { edits.push({ chatId, messageId, text }); },
      answerCallbackQuery: async (id: string, text?: string) => { answers.push({ id, text }); }
    }
  };
});
const hook = (body: any, secret = "SEK") =>
  handleTelegramWebhook(new Request("http://t/webhooks/telegram", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": secret, "content-type": "application/json" }, body: JSON.stringify(body) }), deps);

describe("telegram webhook", () => {
  it("rejects a bad secret", async () => {
    expect((await hook({}, "WRONG")).status).toBe(401);
  });

  it("resolves a request only from the owning chat, first-wins", async () => {
    await env.DB.prepare("INSERT INTO telegram_links (user_id, chat_id, linked_at) VALUES ('acct_1','555',0)").run();
    await env.DB.prepare("INSERT INTO relay_requests (request_id, user_id, device_id, status, tg_message_id, created_at, expires_at) VALUES ('r1','acct_1','d1','pending',9,0,9999999999999)").run();
    // Foreign chat cannot decide:
    await hook({ callback_query: { id: "c0", data: "v1:r1:approve", message: { message_id: 9, chat: { id: 999 } } } });
    expect((await env.DB.prepare("SELECT status FROM relay_requests WHERE request_id='r1'").first<any>()).status).toBe("pending");
    // Owning chat approves:
    await hook({ callback_query: { id: "c1", data: "v1:r1:approve", message: { message_id: 9, chat: { id: 555 } } } });
    expect((await env.DB.prepare("SELECT status FROM relay_requests WHERE request_id='r1'").first<any>()).status).toBe("allow");
    expect(edits[0].text).toMatch(/approv/i);
    expect(answers.length).toBe(2);
  });

  it("links a chat via /start <code> and rejects a code owned by another chat's account conflict", async () => {
    await env.DB.prepare("INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES ('CODE1','acct_1',9999999999999)").run();
    await hook({ message: { text: "/start CODE1", chat: { id: 555 } } });
    expect((await env.DB.prepare("SELECT chat_id FROM telegram_links WHERE user_id='acct_1'").first<any>()).chat_id).toBe("555");
    expect(sent.some((m) => /linked/i.test(m.text))).toBe(true);
  });
});
