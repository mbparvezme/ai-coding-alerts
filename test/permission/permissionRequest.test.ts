import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPermissionInfo } from "../../src/permission/permissionRequest";

test("extracts tool and command from a PermissionRequest payload", () => {
  const info = extractPermissionInfo({
    hook_event_name: "PermissionRequest",
    tool_name: "Bash",
    tool_input: { command: "npm run test", description: "run tests" }
  });
  assert.deepEqual(info, { agent: "claude-code", tool: "Bash", command: "npm run test" });
});

test("falls back to description then empty when command absent", () => {
  assert.equal(
    extractPermissionInfo({ hook_event_name: "PermissionRequest", tool_name: "Edit", tool_input: { description: "edit file" } })?.command,
    "edit file"
  );
  assert.equal(
    extractPermissionInfo({ hook_event_name: "PermissionRequest", tool_name: "Read" })?.command,
    ""
  );
});

test("returns null for non-PermissionRequest payloads", () => {
  assert.equal(extractPermissionInfo({ hook_event_name: "Stop" }), null);
  assert.equal(extractPermissionInfo("nope"), null);
});
