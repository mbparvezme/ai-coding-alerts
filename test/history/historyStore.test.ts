import { test } from "node:test";
import assert from "node:assert/strict";
import { HistoryStore, KeyValueStore } from "../../src/history/HistoryStore";
import { createAlert } from "../../src/model/Alert";

function memory(): KeyValueStore {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback: T) => (map.has(key) ? (map.get(key) as T) : fallback),
    update: async (key: string, value: unknown) => { map.set(key, value); }
  };
}

test("add prepends and persists alerts", () => {
  const store = new HistoryStore(memory());
  store.add(createAlert({ agent: "a", type: "t", message: "first" }));
  store.add(createAlert({ agent: "a", type: "t", message: "second" }));
  assert.deepEqual(store.list().map((a) => a.message), ["second", "first"]);
});

test("setStatus updates status and respondedAt", () => {
  const store = new HistoryStore(memory());
  const alert = createAlert({ agent: "a", type: "t", message: "m" });
  store.add(alert);
  store.setStatus(alert.id, "approved", 999);
  const updated = store.list()[0];
  assert.equal(updated.status, "approved");
  assert.equal(updated.respondedAt, 999);
});

test("change listeners fire on mutation", () => {
  const store = new HistoryStore(memory());
  let fired = 0;
  store.onDidChange(() => { fired += 1; });
  store.add(createAlert({ agent: "a", type: "t", message: "m" }));
  store.clear();
  assert.equal(fired, 2);
});

test("state survives a new store over the same backing map", () => {
  const backing = memory();
  const first = new HistoryStore(backing);
  first.add(createAlert({ agent: "a", type: "t", message: "persisted" }));
  const second = new HistoryStore(backing);
  assert.equal(second.list()[0].message, "persisted");
});
