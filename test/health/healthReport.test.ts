import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHealthReport } from "../../src/health/healthReport";

test("all green when listening and hooks are current", () => {
  const report = buildHealthReport({ listening: true, port: 51789, hooksStatus: "current", scriptsDeployed: true });
  assert.equal(report.ok, true);
  assert.ok(report.lines.every((l) => l.startsWith("✓")));
  assert.ok(report.lines[0].includes("51789"));
});

test("not ok when the listener is down", () => {
  const report = buildHealthReport({ listening: false, port: 0, hooksStatus: "current", scriptsDeployed: true });
  assert.equal(report.ok, false);
  assert.ok(report.lines[0].startsWith("✗"));
});

test("not ok and flags setup when hooks are missing", () => {
  const report = buildHealthReport({ listening: true, port: 51789, hooksStatus: "setup-needed", scriptsDeployed: false });
  assert.equal(report.ok, false);
  assert.ok(report.lines[1].includes("Install Claude Code Hooks"));
});

test("unreadable settings surface as a warning, not a hard pass", () => {
  const report = buildHealthReport({ listening: true, port: 51789, hooksStatus: "unreadable", scriptsDeployed: true });
  assert.equal(report.ok, false);
  assert.ok(report.lines[1].startsWith("⚠"));
});
