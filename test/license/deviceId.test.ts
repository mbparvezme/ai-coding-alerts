import { test } from "node:test";
import assert from "node:assert/strict";
import { getOrCreateDeviceId, type KeyValueStore } from "../../src/license/deviceId";

function fakeStore(initial: Record<string, unknown> = {}): KeyValueStore & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    get<T>(key: string): T | undefined { return data[key] as T | undefined; },
    update(key: string, value: unknown): Promise<void> { data[key] = value; return Promise.resolve(); }
  };
}

test("generates and persists a device id on first call", () => {
  const store = fakeStore();
  const id = getOrCreateDeviceId(store);
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(store.data["aiCodingAlerts.deviceId"], id);
});

test("returns the same id on subsequent calls", () => {
  const store = fakeStore({ "aiCodingAlerts.deviceId": "fixed-id" });
  assert.equal(getOrCreateDeviceId(store), "fixed-id");
});
