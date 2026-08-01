import { test } from "node:test";
import assert from "node:assert/strict";
import { TelegramPoller } from "../../src/permission/TelegramPoller";
import { TelegramUpdate } from "../../src/platform/telegramApi";

function harness(scripted: TelegramUpdate[][]) {
  let call = 0;
  let offset = 0;
  const seen: any[] = [];
  let active = true;
  const deps = {
    getUpdates: async (o: number) => {
      seen.push({ kind: "poll", offset: o });
      const batch = scripted[call] ?? [];
      call += 1;
      if (call >= scripted.length) active = false; // stop after the scripted batches
      return batch;
    },
    chatId: () => "555",
    onCallback: async (cb: any) => { seen.push({ kind: "cb", ...cb }); },
    loadOffset: () => offset,
    saveOffset: (n: number) => (offset = n),
    isActive: () => active,
    sleep: async () => {}
  };
  return { deps, seen, getOffset: () => offset };
}

test("dispatches matching callbacks and advances offset past all updates", async () => {
  const updates: TelegramUpdate[] = [
    { update_id: 10, callback_query: { id: "q1", data: "v1:i:approve", message: { message_id: 1, chat: { id: 555 } } } },
    { update_id: 11, callback_query: { id: "q2", data: "v1:j:deny", message: { message_id: 2, chat: { id: 999 } } } }
  ];
  const { deps, seen, getOffset } = harness([updates]);
  const poller = new TelegramPoller(deps);
  poller.start();
  await new Promise((r) => setTimeout(r, 10));
  const callbacks = seen.filter((s) => s.kind === "cb");
  assert.equal(callbacks.length, 1);
  assert.equal(callbacks[0].callbackQueryId, "q1");
  assert.equal(getOffset(), 12); // max update_id + 1, even though q2 was foreign
});

test("recovers from a getUpdates error via backoff", async () => {
  let call = 0;
  let active = true;
  const seen: any[] = [];
  const poller = new TelegramPoller({
    getUpdates: async () => {
      call += 1;
      if (call === 1) throw new Error("409 Conflict");
      active = false;
      return [{ update_id: 5, callback_query: { id: "q", data: "v1:i:approve", message: { message_id: 1, chat: { id: 1 } } } }];
    },
    chatId: () => "1",
    onCallback: async (cb) => { seen.push(cb); },
    loadOffset: () => 0,
    saveOffset: () => {},
    isActive: () => active,
    sleep: async () => {}
  });
  poller.start();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(seen.length, 1);
});
