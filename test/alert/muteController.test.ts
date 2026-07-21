import { test } from "node:test";
import assert from "node:assert/strict";
import { MuteController } from "../../src/alert/MuteController";

test("starts unmuted", () => {
  assert.equal(new MuteController(() => 0).isMuted(), false);
});

test("muteIndefinitely stays muted regardless of time", () => {
  let now = 0;
  const mute = new MuteController(() => now);
  mute.muteIndefinitely();
  now = 10_000_000;
  assert.equal(mute.isMuted(), true);
});

test("muteFor expires after the window and auto-unmutes", () => {
  let now = 1000;
  const mute = new MuteController(() => now);
  mute.muteFor(5000);
  assert.equal(mute.isMuted(), true);
  now = 5999;
  assert.equal(mute.isMuted(), true);
  now = 6000;
  assert.equal(mute.isMuted(), false);
});

test("unmute clears an active mute", () => {
  const mute = new MuteController(() => 0);
  mute.muteIndefinitely();
  mute.unmute();
  assert.equal(mute.isMuted(), false);
});
