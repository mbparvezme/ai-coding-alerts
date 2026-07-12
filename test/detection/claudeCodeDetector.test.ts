import { test } from "node:test";
import assert from "node:assert/strict";
import { ClaudeCodeDetector } from "../../src/detection/ClaudeCodeDetector";

const detector = new ClaudeCodeDetector();

test("canHandle accepts a Notification hook payload", () => {
  assert.equal(detector.canHandle({ hook_event_name: "Notification", message: "x" }), true);
});

test("canHandle rejects unrelated payloads", () => {
  assert.equal(detector.canHandle({ hook_event_name: "SessionStart" }), false);
  assert.equal(detector.canHandle(null), false);
  assert.equal(detector.canHandle("nope"), false);
});

test("parse maps message and sets agent/type", () => {
  const alert = detector.parse({ hook_event_name: "Notification", message: "Waiting for permission" });
  assert.equal(alert.agent, "claude-code");
  assert.equal(alert.type, "notification");
  assert.equal(alert.message, "Waiting for permission");
  assert.equal(alert.status, "pending");
});

test("parse falls back to a default message when absent", () => {
  const alert = detector.parse({ hook_event_name: "Notification" });
  assert.equal(alert.message, "Claude Code needs your attention");
});

test("canHandle accepts a Stop hook payload", () => {
  assert.equal(detector.canHandle({ hook_event_name: "Stop" }), true);
});

test("parse maps Stop to a completion alert with truncated message", () => {
  const alert = detector.parse({ hook_event_name: "Stop", last_assistant_message: "x".repeat(200) });
  assert.equal(alert.type, "completion");
  assert.equal(alert.message.length, 140);
  assert.ok(alert.message.endsWith("…"));
});

test("parse maps Stop without message to a default", () => {
  const alert = detector.parse({ hook_event_name: "Stop" });
  assert.equal(alert.message, "Claude Code finished responding");
});

test("canHandle accepts a PreToolUse hook payload", () => {
  assert.equal(detector.canHandle({ hook_event_name: "PreToolUse", tool_name: "Bash" }), true);
});

test("parse maps PreToolUse to a permission alert with tool detail", () => {
  const alert = detector.parse({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "npm install", description: "Install dependencies" }
  });
  assert.equal(alert.type, "permission");
  assert.equal(alert.message, "Bash: Install dependencies");
});

test("parse falls back to the command when PreToolUse has no description", () => {
  const alert = detector.parse({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "npm install" }
  });
  assert.equal(alert.message, "Bash: npm install");
});

test("parse maps PreToolUse without input to a default message", () => {
  const alert = detector.parse({ hook_event_name: "PreToolUse", tool_name: "Write" });
  assert.equal(alert.message, "Claude Code wants to use Write");
});

test("parse maps PermissionRequest to a permission alert", () => {
  const alert = detector.parse({
    hook_event_name: "PermissionRequest",
    tool_name: "Bash",
    tool_input: { command: "npm install" }
  });
  assert.equal(alert.type, "permission");
  assert.equal(alert.message, "Bash: npm install");
});

test("parse maps PostToolUse to an activity signal", () => {
  const alert = detector.parse({ hook_event_name: "PostToolUse", tool_name: "Bash" });
  assert.equal(alert.type, "activity");
});

test("parse maps PostToolUseFailure to an activity signal", () => {
  const alert = detector.parse({ hook_event_name: "PostToolUseFailure", tool_name: "Bash" });
  assert.equal(alert.type, "activity");
});
