import { test } from "node:test";
import assert from "node:assert/strict";
import { SoundPlayer } from "../../src/reactors/SoundPlayer";
import { Command } from "../../src/platform/Platform";
import { createAlert } from "../../src/model/Alert";

test("react resolves the sound for the alert's type and runs it", async () => {
  const runs: Command[] = [];
  const types: string[] = [];
  const player = new SoundPlayer(
    "darwin",
    { resolvePath: (t) => { types.push(t); return "/s/ping.wav"; } },
    (c) => runs.push(c)
  );
  await player.react(createAlert({ agent: "a", type: "permission", message: "m" }));
  assert.deepEqual(types, ["permission"]);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].command, "afplay");
});

test("react is a no-op when no path resolves", async () => {
  const runs: Command[] = [];
  const player = new SoundPlayer("darwin", { resolvePath: () => null }, (c) => runs.push(c));
  await player.react(createAlert({ agent: "a", type: "completion", message: "m" }));
  assert.equal(runs.length, 0);
});

test("play replays the sound for the given type", () => {
  const runs: Command[] = [];
  const types: string[] = [];
  const player = new SoundPlayer(
    "linux",
    { resolvePath: (t) => { types.push(t); return "/s/ping.wav"; } },
    (c) => runs.push(c)
  );
  player.play("completion");
  assert.deepEqual(types, ["completion"]);
  assert.equal(runs[0].command, "ffplay");
});
