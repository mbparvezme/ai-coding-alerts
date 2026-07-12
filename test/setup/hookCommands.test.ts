import { test } from "node:test";
import assert from "node:assert/strict";
import { desiredHooks, hookCommand } from "../../src/setup/hookCommands";

test("windows command wraps the cmd script with backslashes", () => {
  const cmd = hookCommand("win32", "C:/Users/me/.ai-coding-alerts", "popup");
  assert.equal(cmd, 'cmd /c "C:\\Users\\me\\.ai-coding-alerts\\alert-hook.cmd" popup');
});

test("unix command calls the shell script", () => {
  const cmd = hookCommand("darwin", "/home/me/.ai-coding-alerts", "finished");
  assert.equal(cmd, '"/home/me/.ai-coding-alerts/alert-hook.sh" finished');
});

test("desired hooks cover the five events with kinds", () => {
  const hooks = desiredHooks("linux", "/h/.ai-coding-alerts");
  assert.deepEqual(
    hooks.map((h) => h.event),
    ["Notification", "PermissionRequest", "PreToolUse", "PostToolUse", "Stop"]
  );
  assert.equal(hooks[2].matcher, "Bash|Write|Edit|NotebookEdit");
  assert.equal(hooks[3].matcher, "Bash|Write|Edit|NotebookEdit");
  assert.ok(hooks[0].command.endsWith(" popup"));
  assert.ok(hooks[1].command.endsWith(" popup"));
  assert.ok(hooks[3].command.endsWith(" activity"));
  assert.ok(hooks[4].command.endsWith(" finished"));
});
