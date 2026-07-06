import { test } from "node:test";
import assert from "node:assert/strict";
import { SoundPlayer } from "../../src/reactors/SoundPlayer";
import { Command } from "../../src/platform/Platform";
import { createAlert } from "../../src/model/Alert";

const alert = createAlert({ agent: "a", type: "t", message: "m" });

test("react runs the resolved sound command", async () => {
  const runs: Command[] = [];
  const player = new SoundPlayer("darwin", { resolvePath: () => "/s/ping.wav" }, (c) => runs.push(c));
  await player.react(alert);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].command, "afplay");
});

test("react is a no-op when no path resolves", async () => {
  const runs: Command[] = [];
  const player = new SoundPlayer("darwin", { resolvePath: () => null }, (c) => runs.push(c));
  await player.react(alert);
  assert.equal(runs.length, 0);
});

test("play() replays the current sound", () => {
  const runs: Command[] = [];
  const player = new SoundPlayer("linux", { resolvePath: () => "/s/ping.wav" }, (c) => runs.push(c));
  player.play();
  assert.equal(runs[0].command, "ffplay");
});
