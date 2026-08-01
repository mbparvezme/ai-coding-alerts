import { test } from "node:test";
import assert from "node:assert/strict";
import { createTelegramApi } from "../../src/platform/telegramApi";

function fakeTransport() {
  const calls: Array<{ method: string; params: any }> = [];
  const t = async (method: string, params: any) => {
    calls.push({ method, params });
    if (method === "sendMessage") return { message_id: 42 };
    if (method === "getUpdates") return [{ update_id: 7, callback_query: { id: "q", data: "v1:i:approve" } }];
    return true;
  };
  return { calls, t };
}

test("sendMessage passes chat_id, text, and inline keyboard", async () => {
  const { calls, t } = fakeTransport();
  const api = createTelegramApi("TOK", t);
  const res = await api.sendMessage("C", "hi", [[{ text: "Approve", callback_data: "v1:i:approve" }]]);
  assert.equal(res.message_id, 42);
  assert.equal(calls[0].method, "sendMessage");
  assert.equal(calls[0].params.chat_id, "C");
  assert.equal(calls[0].params.text, "hi");
  assert.deepEqual(calls[0].params.reply_markup, { inline_keyboard: [[{ text: "Approve", callback_data: "v1:i:approve" }]] });
});

test("getUpdates forwards offset and timeout and returns updates", async () => {
  const { calls, t } = fakeTransport();
  const api = createTelegramApi("TOK", t);
  const updates = await api.getUpdates(100, 25);
  assert.equal(calls[0].params.offset, 100);
  assert.equal(calls[0].params.timeout, 25);
  assert.equal(updates[0].update_id, 7);
});

test("editMessageText and answerCallbackQuery send the right params", async () => {
  const { calls, t } = fakeTransport();
  const api = createTelegramApi("TOK", t);
  await api.editMessageText("C", 42, "done");
  await api.answerCallbackQuery("q", "Already handled");
  assert.deepEqual(calls[0], { method: "editMessageText", params: { chat_id: "C", message_id: 42, text: "done" } });
  assert.deepEqual(calls[1], { method: "answerCallbackQuery", params: { callback_query_id: "q", text: "Already handled" } });
});
