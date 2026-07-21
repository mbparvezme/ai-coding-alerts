import { test } from "node:test";
import assert from "node:assert/strict";
import { TelegramNotifier, formatTelegramMessage } from "../../src/reactors/TelegramNotifier";
import { createAlert } from "../../src/model/Alert";

const on = { enabled: true, botToken: "T", chatId: "C" };

function recorder() {
  const sent: Array<{ token: string; chat: string; text: string }> = [];
  const notifier = (settings: () => typeof on, muted = () => false) =>
    new TelegramNotifier(settings, (token, chat, text) => { sent.push({ token, chat, text }); }, muted);
  return { sent, notifier };
}

test("formats a labelled message per alert type", () => {
  assert.ok(formatTelegramMessage(createAlert({ agent: "a", type: "completion", message: "done" })).startsWith("✅ Finished"));
  assert.ok(formatTelegramMessage(createAlert({ agent: "a", type: "permission", message: "run" })).includes("run"));
});

test("sends when enabled with token and chat id", async () => {
  const { sent, notifier } = recorder();
  await notifier(() => on).react(createAlert({ agent: "a", type: "permission", message: "m" }));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].token, "T");
  assert.equal(sent[0].chat, "C");
});

test("does not send when disabled or credentials are missing", async () => {
  const { sent, notifier } = recorder();
  await notifier(() => ({ ...on, enabled: false })).react(createAlert({ agent: "a", type: "permission", message: "m" }));
  await notifier(() => ({ ...on, botToken: "" })).react(createAlert({ agent: "a", type: "permission", message: "m" }));
  await notifier(() => ({ ...on, chatId: "  " })).react(createAlert({ agent: "a", type: "permission", message: "m" }));
  assert.equal(sent.length, 0);
});

test("does not send while muted", async () => {
  const { sent, notifier } = recorder();
  await notifier(() => on, () => true).react(createAlert({ agent: "a", type: "permission", message: "m" }));
  assert.equal(sent.length, 0);
});
