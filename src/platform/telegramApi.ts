import { request } from "node:https";

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
}

export type Transport = (method: string, params: Record<string, unknown>) => Promise<any>;

const TIMEOUT_MS = 5000;

function httpsTransport(token: string, requestTimeoutMs: number): Transport {
  return (method, params) =>
    new Promise((resolve, reject) => {
      const body = JSON.stringify(params);
      const req = request(
        {
          hostname: "api.telegram.org",
          path: `/bot${token}/${method}`,
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data || "{}");
              if (parsed.ok === false) {
                reject(new Error(`Telegram ${method} failed: ${parsed.error_code} ${parsed.description}`));
              } else {
                resolve(parsed.result);
              }
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.setTimeout(requestTimeoutMs, () => req.destroy(new Error(`Telegram ${method} timed out`)));
      req.on("error", reject);
      req.write(body);
      req.end();
    });
}

export interface TelegramApi {
  sendMessage(chatId: string, text: string, keyboard?: InlineButton[][]): Promise<{ message_id: number }>;
  editMessageText(chatId: string, messageId: number, text: string): Promise<void>;
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
  getUpdates(offset: number, timeoutSec: number): Promise<TelegramUpdate[]>;
}

export function createTelegramApi(token: string, transport?: Transport): TelegramApi {
  // getUpdates long-polls, so its transport needs a longer socket timeout than the poll window.
  const call = transport ?? httpsTransport(token, TIMEOUT_MS);
  const longCall = transport ?? httpsTransport(token, 60_000);
  return {
    async sendMessage(chatId, text, keyboard) {
      const params: Record<string, unknown> = { chat_id: chatId, text };
      if (keyboard) {
        params.reply_markup = { inline_keyboard: keyboard };
      }
      return call("sendMessage", params);
    },
    async editMessageText(chatId, messageId, text) {
      await call("editMessageText", { chat_id: chatId, message_id: messageId, text });
    },
    async answerCallbackQuery(callbackQueryId, text) {
      const params: Record<string, unknown> = { callback_query_id: callbackQueryId };
      if (text) {
        params.text = text;
      }
      await call("answerCallbackQuery", params);
    },
    async getUpdates(offset, timeoutSec) {
      return (await longCall("getUpdates", { offset, timeout: timeoutSec })) ?? [];
    }
  };
}
