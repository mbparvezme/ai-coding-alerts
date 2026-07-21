import { test } from "node:test";
import assert from "node:assert/strict";
import { candidatePorts } from "../../src/ingress/portFallback";

test("lists the preferred port first, then ascending fallbacks", () => {
  assert.deepEqual(candidatePorts(51789, 3), [51789, 51790, 51791]);
});

test("never exceeds the maximum port number", () => {
  assert.deepEqual(candidatePorts(65534, 10), [65534, 65535]);
});
