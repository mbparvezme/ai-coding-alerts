import { test } from "node:test";
import assert from "node:assert/strict";
import { AlertScheduler } from "../../src/alert/AlertScheduler";
import { Alert, createAlert } from "../../src/model/Alert";

interface Timer {
  fn: () => void;
  ms: number;
  cancelled: boolean;
}

function harness(popupSeconds: number, finishedSeconds: number) {
  const emitted: Alert[] = [];
  const timers: Timer[] = [];
  const scheduler = new AlertScheduler(
    { popupMs: () => popupSeconds * 1000, finishedMs: () => finishedSeconds * 1000 },
    (a) => emitted.push(a),
    (fn, ms) => {
      const timer = { fn, ms, cancelled: false };
      timers.push(timer);
      return timer;
    },
    (h) => {
      (h as Timer).cancelled = true;
    }
  );
  return { scheduler, emitted, timers };
}

const completion = () => createAlert({ agent: "a", type: "completion", message: "done" });
const permission = () => createAlert({ agent: "a", type: "permission", message: "run?" });
const activity = () => createAlert({ agent: "a", type: "activity", message: "Bash" });

test("popup is held for the grace period, then emitted", () => {
  const { scheduler, emitted, timers } = harness(3, 10);
  scheduler.push(permission());
  assert.equal(emitted.length, 0);
  assert.equal(timers[0].ms, 3000);
  timers[0].fn();
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, "permission");
});

test("activity cancels a pending popup without emitting", () => {
  const { scheduler, emitted, timers } = harness(3, 10);
  scheduler.push(permission());
  scheduler.push(activity());
  assert.equal(timers[0].cancelled, true);
  assert.equal(emitted.length, 0);
});

test("activity cancels a pending completion", () => {
  const { scheduler, emitted, timers } = harness(3, 10);
  scheduler.push(completion());
  scheduler.push(activity());
  assert.equal(timers[0].cancelled, true);
  assert.equal(emitted.length, 0);
});

test("completion is held and survives an unrelated pending popup", () => {
  const { scheduler, emitted, timers } = harness(3, 10);
  scheduler.push(completion());
  assert.equal(timers[0].ms, 10000);
  timers[0].fn();
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, "completion");
});

test("a newer completion replaces the pending one", () => {
  const { scheduler, emitted, timers } = harness(3, 10);
  scheduler.push(completion());
  scheduler.push(completion());
  assert.equal(timers[0].cancelled, true);
  timers[1].fn();
  assert.equal(emitted.length, 1);
});

test("a popup cancels a pending completion", () => {
  const { scheduler, emitted, timers } = harness(3, 10);
  scheduler.push(completion());
  scheduler.push(permission());
  assert.equal(timers[0].cancelled, true);
  timers[1].fn();
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, "permission");
});

test("zero delays emit immediately", () => {
  const { scheduler, emitted, timers } = harness(0, 0);
  scheduler.push(permission());
  scheduler.push(completion());
  assert.equal(emitted.length, 2);
  assert.equal(timers.length, 0);
});
