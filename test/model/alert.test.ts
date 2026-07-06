import { test } from "node:test";
import assert from "node:assert/strict";
import { createAlert } from "../../src/model/Alert";
import { newId } from "../../src/util/id";

test("createAlert defaults status to pending and generates an id", () => {
  const a = createAlert({ agent: "claude-code", type: "permission", message: "hi" });
  assert.equal(a.status, "pending");
  assert.equal(a.agent, "claude-code");
  assert.ok(a.id.length > 0);
  assert.ok(a.receivedAt <= Date.now());
});

test("createAlert honours an explicit receivedAt", () => {
  const a = createAlert({ agent: "x", type: "y", message: "z", receivedAt: 123 });
  assert.equal(a.receivedAt, 123);
});

test("newId values are unique", () => {
  assert.notEqual(newId(), newId());
});
