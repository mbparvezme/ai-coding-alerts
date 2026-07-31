import { test } from "node:test";
import assert from "node:assert/strict";
import { createPermissionSystem } from "../../src/permission/permissionController";
import { PendingDecisionStore } from "../../src/permission/PendingDecisionStore";
import { AllowRules } from "../../src/permission/AllowRules";

function setup(overrides: Partial<Parameters<typeof createPermissionSystem>[0]> = {}) {
  const sent: any[] = [];
  const edits: any[] = [];
  const answered: any[] = [];
  const prompts: any[] = [];
  let n = 0;
  const store = new PendingDecisionStore({ idGen: () => `id${++n}` });
  const allowRules = new AllowRules();
  const api = () => ({
    sendMessage: async (chatId: string, text: string, keyboard: any) => { sent.push({ chatId, text, keyboard }); return { message_id: 7 }; },
    editMessageText: async (_chatId: string, messageId: number, text: string) => { edits.push({ messageId, text }); },
    answerCallbackQuery: async (id: string, text?: string) => { answered.push({ id, text }); },
    getUpdates: async () => []
  });
  const sys = createPermissionSystem({
    store, allowRules, api,
    enabled: () => true, chatId: () => "C", ttlMs: () => 300000,
    messageFor: () => "Bash: npm run test",
    showPcPrompt: (_t, _r) => { prompts.push(_r); return () => prompts.push("dismissed"); },
    muteFor: () => sent.push({ muted: true }), muteMs: () => 1000,
    log: () => {},
    ...overrides
  });
  return { sys, store, allowRules, sent, edits, answered, prompts };
}

const payload = { hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "npm run test" } };

test("normal path registers pending and sends an inline-keyboard message", async () => {
  const { sys, store, sent } = setup();
  const { id } = await sys.create(payload);
  assert.equal(store.status(id), "pending");
  await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].keyboard.length, 2); // two rows of buttons
});

test("approve callback resolves allow and edits the message", async () => {
  const { sys, store, edits, answered } = setup();
  const { id } = await sys.create(payload);
  await new Promise((r) => setImmediate(r));
  await sys.handleCallback({ callbackQueryId: "q", data: `v1:${id}:approve` });
  assert.equal(store.status(id), "allow");
  assert.equal(answered.length, 1);
  assert.ok(edits.some((e) => /approv/i.test(e.text)));
});

test("remember resolves allow and auto-approves the next identical request", async () => {
  const { sys, store, sent } = setup();
  const { id } = await sys.create(payload);
  await new Promise((r) => setImmediate(r));
  await sys.handleCallback({ callbackQueryId: "q", data: `v1:${id}:remember` });
  assert.equal(store.status(id), "allow");
  const before = sent.length;
  const second = await sys.create(payload);              // should auto-resolve, no new send
  assert.equal(store.status(second.id), "allow");
  assert.equal(sent.length, before);
});

test("disabled telegram yields an expired (unknown) id → native dialog", async () => {
  const { sys, store } = setup({ enabled: () => false });
  const { id } = await sys.create(payload);
  assert.equal(store.status(id), "expired");
});
