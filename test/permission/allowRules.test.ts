import { test } from "node:test";
import assert from "node:assert/strict";
import { AllowRules, PermissionInfo } from "../../src/permission/AllowRules";

const info = (command: string): PermissionInfo => ({ agent: "claude-code", tool: "Bash", command });

test("matches only after remember, and normalizes whitespace", () => {
  const rules = new AllowRules();
  assert.equal(rules.matches(info("npm run test")), false);
  rules.remember(info("npm   run   test"));
  assert.equal(rules.matches(info("npm run test")), true);
});

test("different tool or command does not match", () => {
  const rules = new AllowRules();
  rules.remember(info("npm run test"));
  assert.equal(rules.matches(info("npm run build")), false);
  assert.equal(rules.matches({ agent: "claude-code", tool: "Write", command: "npm run test" }), false);
});

test("clear forgets everything", () => {
  const rules = new AllowRules();
  rules.remember(info("ls"));
  rules.clear();
  assert.equal(rules.matches(info("ls")), false);
});
