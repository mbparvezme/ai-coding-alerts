import { test } from "node:test";
import assert from "node:assert/strict";
import { DetectorRegistry } from "../../src/detection/DetectorRegistry";
import { AgentDetector } from "../../src/detection/AgentDetector";
import { createAlert } from "../../src/model/Alert";

function stub(agent: string, matches: boolean): AgentDetector {
  return {
    agent,
    canHandle: () => matches,
    parse: () => createAlert({ agent, type: "t", message: "m" })
  };
}

test("detect returns the first matching detector's alert", () => {
  const registry = new DetectorRegistry([stub("a", false), stub("b", true), stub("c", true)]);
  const alert = registry.detect({});
  assert.equal(alert?.agent, "b");
});

test("detect returns undefined when nothing matches", () => {
  const registry = new DetectorRegistry([stub("a", false)]);
  assert.equal(registry.detect({}), undefined);
});
