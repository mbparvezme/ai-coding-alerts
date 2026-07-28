import { test } from "node:test";
import assert from "node:assert/strict";
import { requirePro } from "../../src/license/requirePro";

test("requirePro calls the upsell and returns false when not pro", () => {
  const upsold: string[] = [];
  const ok = requirePro({ isPro: () => false }, "remoteActions", (f) => upsold.push(f));
  assert.equal(ok, false);
  assert.deepEqual(upsold, ["remoteActions"]);
});

test("requirePro returns true and does not upsell when pro", () => {
  const upsold: string[] = [];
  const ok = requirePro({ isPro: () => true }, "remoteActions", (f) => upsold.push(f));
  assert.equal(ok, true);
  assert.deepEqual(upsold, []);
});
