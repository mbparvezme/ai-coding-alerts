import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeCallback, parseCallback } from "../../src/permission/callbackData";

test("round-trips id and choice", () => {
  const data = encodeCallback("abc-123", "approve");
  assert.equal(data, "v1:abc-123:approve");
  assert.deepEqual(parseCallback(data), { id: "abc-123", choice: "approve" });
});

test("parses every choice", () => {
  for (const c of ["approve", "deny", "remember", "mute"] as const) {
    assert.deepEqual(parseCallback(encodeCallback("i", c)), { id: "i", choice: c });
  }
});

test("rejects malformed or unknown data", () => {
  assert.equal(parseCallback("v1:i:nope"), null);
  assert.equal(parseCallback("v2:i:approve"), null);
  assert.equal(parseCallback("garbage"), null);
  assert.equal(parseCallback("v1::approve"), null);
});
