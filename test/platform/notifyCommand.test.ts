import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNotifyCommand } from "../../src/platform/notifyCommand";

test("macOS uses terminal-notifier", () => {
  const c = buildNotifyCommand("darwin", "Title", "Body");
  assert.equal(c.command, "terminal-notifier");
  assert.ok(c.args.includes("Title"));
  assert.ok(c.args.includes("Body"));
});

test("linux uses notify-send with critical urgency", () => {
  const c = buildNotifyCommand("linux", "Title", "Body");
  assert.equal(c.command, "notify-send");
  assert.ok(c.args.includes("-u"));
  assert.ok(c.args.includes("critical"));
});

test("windows uses BurntToast via powershell", () => {
  const c = buildNotifyCommand("win32", "Title", "Body");
  assert.equal(c.command, "powershell");
  assert.ok(c.args.join(" ").includes("New-BurntToastNotification"));
  assert.ok(c.args.join(" ").includes("Body"));
});
