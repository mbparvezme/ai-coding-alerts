import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSoundCommand } from "../../src/platform/soundCommand";

test("macOS uses afplay", () => {
  const c = buildSoundCommand("darwin", "/a/b.wav");
  assert.equal(c.command, "afplay");
  assert.deepEqual(c.args, ["/a/b.wav"]);
});

test("linux uses ffplay with quiet auto-exit flags", () => {
  const c = buildSoundCommand("linux", "/a/b.wav");
  assert.equal(c.command, "ffplay");
  assert.ok(c.args.includes("-autoexit"));
  assert.ok(c.args.includes("/a/b.wav"));
});

test("windows uses powershell MediaPlayer with the file path embedded", () => {
  const c = buildSoundCommand("win32", "C:\\a\\b.wav");
  assert.equal(c.command, "powershell");
  assert.ok(c.args.join(" ").includes("C:\\a\\b.wav"));
  assert.ok(c.args.join(" ").includes("MediaPlayer"));
});
