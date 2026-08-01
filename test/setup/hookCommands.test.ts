import { test } from "node:test";
import assert from "node:assert/strict";
import { desiredHooks, hookCommand } from "../../src/setup/hookCommands";

test("windows command quotes the script path directly, without a cmd /c prefix", () => {
  const cmd = hookCommand("win32", "C:/Users/me/.ai-coding-alerts", "popup");
  assert.equal(cmd, '"C:\\Users\\me\\.ai-coding-alerts\\alert-hook.cmd" popup');
});

test("unix command calls the shell script", () => {
  const cmd = hookCommand("darwin", "/home/me/.ai-coding-alerts", "finished");
  assert.equal(cmd, '"/home/me/.ai-coding-alerts/alert-hook.sh" finished');
});

test("desired hooks cover the four events with kinds", () => {
  const hooks = desiredHooks("linux", "/h/.ai-coding-alerts");
  assert.deepEqual(
    hooks.map((h) => h.event),
    ["Notification", "PermissionRequest", "PostToolUse", "Stop"]
  );
  assert.equal(hooks[2].matcher, "Bash|Write|Edit|NotebookEdit");
  assert.ok(hooks[0].command.endsWith(" popup"));
  assert.ok(hooks[1].command.endsWith("permission-hook.sh\""));
  assert.ok(hooks[2].command.endsWith(" activity"));
  assert.ok(hooks[3].command.endsWith(" finished"));
});

test("PermissionRequest maps to the blocking permission hook", () => {
  const hooks = desiredHooks("linux", "/home/u/.ai-coding-alerts");
  const pr = hooks.find((h) => h.event === "PermissionRequest");
  assert.ok(pr);
  assert.match(pr!.command, /permission-hook\.sh"$/);
  assert.doesNotMatch(pr!.command, /alert-hook/);
});

test("windows permission command uses the .cmd with a quoted path and no kind arg", () => {
  assert.equal(hookCommand("win32", "C:/Users/u/.ai-coding-alerts", "permission"), `"C:\\Users\\u\\.ai-coding-alerts\\permission-hook.cmd"`);
});
