import { test } from "node:test";
import assert from "node:assert/strict";
import { createManagedBroker } from "../../src/permission/managedBroker";
import { PendingDecisionStore } from "../../src/permission/PendingDecisionStore";

const payload = { hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "npm test" } };
const tick = () => new Promise((r) => setImmediate(r));

function setup(relay: any) {
  const store = new PendingDecisionStore({ idGen: (() => { let n = 0; return () => `id${++n}`; })() });
  const prompts: any[] = [];
  const broker = createManagedBroker({
    store, relay,
    ttlMs: () => 300000,
    messageFor: () => "Bash: npm test",
    showPcPrompt: (_t, _r) => { prompts.push(_r); return () => prompts.push("dismissed"); },
    sleep: async () => {},
    pollMs: 1,
    log: () => {}
  });
  return { store, broker, prompts };
}

test("polls the relay and resolves allow", async () => {
  let polls = 0;
  const relay = {
    createPermission: async () => ({ ok: true, requestId: "req_1" }),
    getDecision: async () => (++polls >= 2 ? "allow" : "pending")
  };
  const { store, broker } = setup(relay);
  const { id } = await broker.create(payload);
  assert.equal(store.status(id), "pending");
  for (let i = 0; i < 5 && store.status(id) === "pending"; i++) await tick();
  assert.equal(store.status(id), "allow");
});

test("notLinked leaves the decision to expire (never fails open)", async () => {
  const relay = { createPermission: async () => ({ ok: false, notLinked: true }), getDecision: async () => "pending" };
  const { store, broker } = setup(relay);
  const { id } = await broker.create(payload);
  for (let i = 0; i < 3; i++) await tick();
  assert.equal(store.status(id), "pending"); // never resolved to allow; will expire -> native
});
