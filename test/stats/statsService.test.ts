import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStats } from "../../src/stats/StatsService";
import { Alert } from "../../src/model/Alert";

function at(hour: number, over: Partial<Alert> = {}): Alert {
  const d = new Date(2026, 0, 15, hour, 0, 0);
  return {
    id: Math.random().toString(),
    agent: "claude-code",
    type: "notification",
    message: "m",
    receivedAt: d.getTime(),
    status: "pending",
    ...over
  };
}

const now = new Date(2026, 0, 15, 23, 0, 0).getTime();

test("empty input yields zeroed stats", () => {
  const s = computeStats([], now);
  assert.deepEqual(s, {
    totalToday: 0, approved: 0, denied: 0,
    averageResponseMs: null, peakHour: null, mostCommonType: null
  });
});

test("counts today's alerts and statuses", () => {
  const s = computeStats([
    at(9, { status: "approved" }),
    at(9, { status: "denied" }),
    at(10, { status: "approved" })
  ], now);
  assert.equal(s.totalToday, 3);
  assert.equal(s.approved, 2);
  assert.equal(s.denied, 1);
  assert.equal(s.peakHour, 9);
});

test("average response time uses resolved alerts", () => {
  const base = at(9);
  const resolved: Alert = { ...base, respondedAt: base.receivedAt + 4000 };
  const s = computeStats([resolved, at(10)], now);
  assert.equal(s.averageResponseMs, 4000);
});

test("most common type wins by frequency", () => {
  const s = computeStats([
    at(9, { type: "permission" }),
    at(9, { type: "permission" }),
    at(10, { type: "notification" })
  ], now);
  assert.equal(s.mostCommonType, "permission");
});

test("alerts from other days are excluded from today counts", () => {
  const yesterday = at(9);
  yesterday.receivedAt = new Date(2026, 0, 14, 9).getTime();
  const s = computeStats([yesterday], now);
  assert.equal(s.totalToday, 0);
});
