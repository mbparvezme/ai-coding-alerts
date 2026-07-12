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

test("desired hooks cover the three events with kinds", () => {
  const hooks = desiredHooks("linux", "/h/.ai-coding-alerts");
  assert.deepEqual(hooks.map((h) => h.event), ["Notification", "PreToolUse", "Stop"]);
  assert.equal(hooks[1].matcher, "Bash|Write|Edit|NotebookEdit");
  assert.ok(hooks[0].command.endsWith(" popup"));
  assert.ok(hooks[2].command.endsWith(" finished"));
});
