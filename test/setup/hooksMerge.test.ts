import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeHooks } from "../../src/setup/hooksMerge";
import { desiredHooks } from "../../src/setup/hookCommands";

const desired = desiredHooks("win32", "C:/u/.ai-coding-alerts");

test("installs hooks into empty settings", () => {
  const { settings, changed } = mergeHooks({}, desired);
  assert.equal(changed, true);
  const hooks = settings.hooks as Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
  assert.equal(hooks.Notification.length, 1);
  assert.equal(hooks.PostToolUse[0].matcher, "Bash|Write|Edit|NotebookEdit");
  assert.ok(hooks.Stop[0].hooks[0].command.includes("alert-hook.cmd"));
});

test("second merge changes nothing", () => {
  const first = mergeHooks({}, desired);
  const second = mergeHooks(first.settings, desired);
  assert.equal(second.changed, false);
});

test("keeps unrelated settings and foreign hooks", () => {
  const original = {
    model: "opus",
    hooks: {
      Stop: [{ hooks: [{ type: "command", command: "say done" }] }],
      SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }]
    }
  };
  const { settings } = mergeHooks(original, desired);
  assert.equal(settings.model, "opus");
  const hooks = settings.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
  assert.equal(hooks.SessionStart[0].hooks[0].command, "echo hi");
  assert.equal(hooks.Stop.length, 2);
  assert.equal(hooks.Stop[0].hooks[0].command, "say done");
});

test("removes our hooks from events no longer desired", () => {
  const original = {
    hooks: {
      PreToolUse: [
        { matcher: "Bash", hooks: [{ type: "command", command: 'cmd /c "C:\\u\\.ai-coding-alerts\\alert-hook.cmd" popup' }] }
      ]
    }
  };
  const { settings } = mergeHooks(original, desired);
  const hooks = settings.hooks as Record<string, unknown>;
  assert.equal(hooks.PreToolUse, undefined);
});

test("replaces stale curl and old script hooks instead of duplicating", () => {
  const original = {
    hooks: {
      Stop: [{ hooks: [{ type: "command", command: 'curl -s -X POST http://127.0.0.1:51789/alert -d @-' }] }],
      Notification: [{ hooks: [{ type: "command", command: 'cmd /c "D:\\old\\alert-hook.cmd" popup' }] }]
    }
  };
  const { settings } = mergeHooks(original, desired);
  const hooks = settings.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
  assert.equal(hooks.Stop.length, 1);
  assert.ok(hooks.Stop[0].hooks[0].command.includes(".ai-coding-alerts"));
  assert.equal(hooks.Notification.length, 1);
  assert.ok(hooks.Notification[0].hooks[0].command.includes(".ai-coding-alerts"));
});

test("recognizes and replaces a stale permission-hook entry", () => {
  const settings = { hooks: { PermissionRequest: [{ hooks: [{ type: "command", command: '"/x/permission-hook.sh"' }] }] } };
  const desired = [{ event: "PermissionRequest", command: '"/new/permission-hook.sh"' }];
  const merged = mergeHooks(settings, desired);
  const entries = (merged.settings.hooks as any).PermissionRequest;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].hooks[0].command, '"/new/permission-hook.sh"');
});
