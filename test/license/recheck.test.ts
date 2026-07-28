import { test } from "node:test";
import assert from "node:assert/strict";
import { localDayKey, shouldRecheckToday } from "../../src/license/recheck";

test("localDayKey formats YYYY-MM-DD from local time", () => {
  const key = localDayKey(new Date(2026, 6, 26, 10, 0, 0).getTime()); // month is 0-based -> July
  assert.equal(key, "2026-07-26");
});

test("localDayKey zero-pads single-digit month and day", () => {
  const key = localDayKey(new Date(2026, 0, 3, 8, 0, 0).getTime()); // Jan 3
  assert.equal(key, "2026-01-03");
});

test("recheck fires once when the local day changes", () => {
  const today = localDayKey(Date.now());
  assert.equal(shouldRecheckToday(null, Date.now()), true);      // never checked
  assert.equal(shouldRecheckToday(today, Date.now()), false);    // already checked today
  assert.equal(shouldRecheckToday("2000-01-01", Date.now()), true); // stale day
});
