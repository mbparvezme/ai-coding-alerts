import { test } from "node:test";
import assert from "node:assert/strict";
import { CompletionDebouncer } from "../../src/alert/CompletionDebouncer";
import { Alert, createAlert } from "../../src/model/Alert";

interface Timer {
  fn: () => void;
  ms: number;
  cancelled: boolean;
}

function harness(delaySeconds: number) {
  const emitted: Alert[] = [];
  const timers: Timer[] = [];
  const debouncer = new CompletionDebouncer(
    () => delaySeconds * 1000,
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
  return { debouncer, emitted, timers };
}

const completion = () => createAlert({ agent: "a", type: "completion", message: "done" });
const permission = () => createAlert({ agent: "a", type: "permission", message: "run?" });

test("completion is held for the quiet period, then emitted", () => {
  const { debouncer, emitted, timers } = harness(10);
  debouncer.push(completion());
  assert.equal(emitted.length, 0);
  assert.equal(timers[0].ms, 10000);
  timers[0].fn();
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, "completion");
});

test("a newer completion cancels the pending one", () => {
  const { debouncer, emitted, timers } = harness(10);
  debouncer.push(completion());
  debouncer.push(completion());
  assert.equal(timers[0].cancelled, true);
  assert.equal(timers[1].cancelled, false);
  timers[1].fn();
  assert.equal(emitted.length, 1);
});

test("other activity cancels the pending completion and emits immediately", () => {
  const { debouncer, emitted, timers } = harness(10);
  debouncer.push(completion());
  debouncer.push(permission());
  assert.equal(timers[0].cancelled, true);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, "permission");
});

test("zero delay emits completions immediately", () => {
  const { debouncer, emitted, timers } = harness(0);
  debouncer.push(completion());
  assert.equal(emitted.length, 1);
  assert.equal(timers.length, 0);
});
