import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFocusCommand } from "../../src/platform/focusCommand";

test("macOS activates Visual Studio Code via osascript", () => {
  const c = buildFocusCommand("darwin");
  assert.equal(c?.command, "osascript");
  assert.ok(c?.args.join(" ").includes("Visual Studio Code"));
});

test("linux uses wmctrl to raise the window", () => {
  const c = buildFocusCommand("linux");
  assert.equal(c?.command, "wmctrl");
  assert.ok(c?.args.includes("-a"));
});

test("windows uses powershell AppActivate", () => {
  const c = buildFocusCommand("win32");
  assert.equal(c?.command, "powershell");
  assert.ok(c?.args.join(" ").includes("AppActivate"));
});
