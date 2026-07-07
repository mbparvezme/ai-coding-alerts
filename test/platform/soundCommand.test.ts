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

function decodeScript(c: { args: string[] }): string {
  return Buffer.from(c.args[c.args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le");
}

test("windows plays wav via powershell SoundPlayer, quote-safe encoded", () => {
  const c = buildSoundCommand("win32", "C:\\a\\b.wav");
  assert.equal(c.command, "powershell");
  assert.ok(c.args.includes("-EncodedCommand"));
  const script = decodeScript(c);
  assert.ok(script.includes("C:\\a\\b.wav"));
  assert.ok(script.includes("SoundPlayer"));
});

test("windows plays non-wav via winmm MCI, quote-safe encoded", () => {
  const c = buildSoundCommand("win32", "C:\\a\\b.mp3");
  assert.equal(c.command, "powershell");
  const script = decodeScript(c);
  assert.ok(script.includes("C:\\a\\b.mp3"));
  assert.ok(script.includes("mciSendString"));
});
