import { test } from "node:test";
import assert from "node:assert/strict";
import { Escalator } from "../../src/alert/Escalator";

function fakeClock() {
  const tasks = new Map<number, () => void>();
  let seq = 0;
  return {
    schedule: (fn: () => void) => { const id = ++seq; tasks.set(id, fn); return id; },
    cancel: (h: unknown) => { tasks.delete(h as number); },
    flush: () => { const [id, fn] = [...tasks][0] ?? []; if (id !== undefined) { tasks.delete(id as number); (fn as () => void)(); } },
    pending: () => tasks.size
  };
}

const config = (repeatMs: number, maxRepeats: number) => ({ repeatMs: () => repeatMs, maxRepeats: () => maxRepeats });

test("re-rings up to the max, then stops", () => {
  const clock = fakeClock();
  let rings = 0;
  const esc = new Escalator(config(1000, 3), clock.schedule, clock.cancel);
  esc.begin(() => { rings += 1; });
  clock.flush();
  clock.flush();
  clock.flush();
  assert.equal(rings, 3);
  assert.equal(clock.pending(), 0);
});

test("cancel stops further rings", () => {
  const clock = fakeClock();
  let rings = 0;
  const esc = new Escalator(config(1000, 5), clock.schedule, clock.cancel);
  esc.begin(() => { rings += 1; });
  clock.flush();
  esc.cancel();
  clock.flush();
  assert.equal(rings, 1);
  assert.equal(clock.pending(), 0);
});

test("disabled when repeats or interval is zero", () => {
  const clock = fakeClock();
  new Escalator(config(0, 3), clock.schedule, clock.cancel).begin(() => {});
  new Escalator(config(1000, 0), clock.schedule, clock.cancel).begin(() => {});
  assert.equal(clock.pending(), 0);
});

test("begin supersedes a running escalation", () => {
  const clock = fakeClock();
  let a = 0;
  let b = 0;
  const esc = new Escalator(config(1000, 3), clock.schedule, clock.cancel);
  esc.begin(() => { a += 1; });
  esc.begin(() => { b += 1; });
  clock.flush();
  clock.flush();
  clock.flush();
  assert.equal(a, 0);
  assert.equal(b, 3);
});
