import { test } from "node:test";
import assert from "node:assert/strict";
import { PendingDecisionStore } from "../../src/permission/PendingDecisionStore";

function fixedClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("create → pending, resolve → decision, second resolve is a no-op", () => {
  let n = 0;
  const store = new PendingDecisionStore({ idGen: () => `id${++n}` });
  const id = store.create(5000);
  assert.equal(id, "id1");
  assert.equal(store.status(id), "pending");
  assert.equal(store.resolve(id, "allow"), true);
  assert.equal(store.status(id), "allow");
  assert.equal(store.resolve(id, "deny"), false);
  assert.equal(store.status(id), "allow");
});

test("expires after ttl and cannot be resolved", () => {
  const clock = fixedClock();
  const store = new PendingDecisionStore({ now: clock.now, idGen: () => "x" });
  const id = store.create(1000);
  clock.advance(1000);
  assert.equal(store.status(id), "expired");
  assert.equal(store.resolve(id, "allow"), false);
});

test("unknown id reads as expired", () => {
  const store = new PendingDecisionStore();
  assert.equal(store.status("missing"), "expired");
});

test("onChange fires on resolve; pendingCount reflects open decisions", () => {
  let fired = 0;
  const store = new PendingDecisionStore({ idGen: () => `id${store.pendingCount()}` });
  const off = store.onChange(() => (fired += 1));
  const id = store.create(5000);
  assert.equal(store.pendingCount(), 1);
  store.resolve(id, "deny");
  assert.equal(fired, 1);
  assert.equal(store.pendingCount(), 0);
  off();
  store.create(5000);
  store.resolve(store.create(5000), "allow");
  assert.equal(fired, 1);
});
