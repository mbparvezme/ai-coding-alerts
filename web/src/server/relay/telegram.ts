export interface InlineButton {
  text: string;
  callback_data: string;
}

export type TelegramTransport = (method: string, params: Record<string, unknown>) => Promise<any>;

export interface TelegramClient {
  sendMessage(chatId: string, text: string, keyboard?: InlineButton[][]): Promise<{ message_id: number }>;
  editMessageText(chatId: string, messageId: number, text: string): Promise<void>;
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
}

function fetchTransport(token: string): TelegramTransport {
  return async (method, params) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params)
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; description?: string };
    if (data.ok === false) throw new Error(`telegram ${method}: ${data.description ?? "failed"}`);
    return data.result;
  };
}

export function createTelegramClient(token: string, transport?: TelegramTransport): TelegramClient {
  const call = transport ?? fetchTransport(token);
  return {
    async sendMessage(chatId, text, keyboard) {
      const params: Record<string, unknown> = { chat_id: chatId, text };
      if (keyboard) params.reply_markup = { inline_keyboard: keyboard };
      return call("sendMessage", params);
    },
    async editMessageText(chatId, messageId, text) {
      await call("editMessageText", { chat_id: chatId, message_id: messageId, text });
    },
    async answerCallbackQuery(callbackQueryId, text) {
      const params: Record<string, unknown> = { callback_query_id: callbackQueryId };
      if (text) params.text = text;
      await call("answerCallbackQuery", params);
    }
  };
}
