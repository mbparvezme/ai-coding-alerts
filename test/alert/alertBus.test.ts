import { test } from "node:test";
import assert from "node:assert/strict";
import { AlertBus } from "../../src/alert/AlertBus";
import { Reactor } from "../../src/alert/Reactor";
import { createAlert } from "../../src/model/Alert";

const alert = createAlert({ agent: "a", type: "t", message: "m" });

test("emit invokes every reactor", async () => {
  const seen: string[] = [];
  const r = (name: string): Reactor => ({ react: () => { seen.push(name); } });
  await new AlertBus([r("one"), r("two")]).emit(alert);
  assert.deepEqual(seen, ["one", "two"]);
});

test("a throwing reactor does not block the others", async () => {
  const seen: string[] = [];
  const errors: unknown[] = [];
  const bad: Reactor = { react: () => { throw new Error("boom"); } };
  const good: Reactor = { react: () => { seen.push("good"); } };
  await new AlertBus([bad, good], (_r, e) => errors.push(e)).emit(alert);
  assert.deepEqual(seen, ["good"]);
  assert.equal(errors.length, 1);
});

test("a rejecting async reactor is caught", async () => {
  const errors: unknown[] = [];
  const bad: Reactor = { react: async () => { throw new Error("async boom"); } };
  await new AlertBus([bad], (_r, e) => errors.push(e)).emit(alert);
  assert.equal(errors.length, 1);
});
