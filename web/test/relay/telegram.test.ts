import { describe, it, expect } from "vitest";
import { createTelegramClient } from "../../src/server/relay/telegram";

function fake() {
  const calls: Array<{ method: string; params: any }> = [];
  const transport = async (method: string, params: any) => {
    calls.push({ method, params });
    return method === "sendMessage" ? { message_id: 99 } : true;
  };
  return { calls, transport };
}

describe("telegram client", () => {
  it("sends chat_id, text and an inline keyboard", async () => {
    const { calls, transport } = fake();
    const tg = createTelegramClient("TOK", transport);
    const res = await tg.sendMessage("555", "hi", [[{ text: "✅ Approve", callback_data: "v1:r1:approve" }]]);
    expect(res.message_id).toBe(99);
    expect(calls[0].method).toBe("sendMessage");
    expect(calls[0].params.chat_id).toBe("555");
    expect(calls[0].params.reply_markup).toEqual({ inline_keyboard: [[{ text: "✅ Approve", callback_data: "v1:r1:approve" }]] });
  });

  it("edits a message and answers a callback", async () => {
    const { calls, transport } = fake();
    const tg = createTelegramClient("TOK", transport);
    await tg.editMessageText("555", 99, "✅ Approved");
    await tg.answerCallbackQuery("cq1", "Done");
    expect(calls[0]).toEqual({ method: "editMessageText", params: { chat_id: "555", message_id: 99, text: "✅ Approved" } });
    expect(calls[1]).toEqual({ method: "answerCallbackQuery", params: { callback_query_id: "cq1", text: "Done" } });
  });
});
