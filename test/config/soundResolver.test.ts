import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSoundPath } from "../../src/config/soundResolver";

test("built-in wav sound resolves under mediaRoot/sounds", () => {
  const p = resolveSoundPath({ sound: "ping", customSoundPath: "" }, "/ext");
  assert.equal(p, "/ext/sounds/ping.wav");
});

test("built-in mp3 sound keeps its extension", () => {
  const p = resolveSoundPath({ sound: "frog", customSoundPath: "" }, "/ext");
  assert.equal(p, "/ext/sounds/frog.mp3");
});

test("custom uses the configured path", () => {
  const p = resolveSoundPath({ sound: "custom", customSoundPath: "/my/bell.wav" }, "/ext");
  assert.equal(p, "/my/bell.wav");
});

test("custom without a path resolves to null", () => {
  assert.equal(resolveSoundPath({ sound: "custom", customSoundPath: "" }, "/ext"), null);
});

test("unknown sound resolves to null", () => {
  assert.equal(resolveSoundPath({ sound: "weird", customSoundPath: "" }, "/ext"), null);
});
