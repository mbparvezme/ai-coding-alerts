import { test } from "node:test";
import assert from "node:assert/strict";
import { readAlertSettings } from "../../src/config/readAlertSettings";

test("reads new permission settings with defaults", () => {
  const get = <T>(_key: string, fallback: T): T => fallback; // simulate no user overrides
  const s = readAlertSettings(get);
  assert.equal(s.permissionTimeoutSec, 300);
  assert.equal(s.telegramMuteMinutes, 480);
  assert.equal(s.telegram.twoWay, true);
});

test("honors user overrides", () => {
  const overrides: Record<string, unknown> = { permissionTimeoutSec: 120, enableTelegramTwoWay: false };
  const get = <T>(key: string, fallback: T): T => (key in overrides ? (overrides[key] as T) : fallback);
  const s = readAlertSettings(get);
  assert.equal(s.permissionTimeoutSec, 120);
  assert.equal(s.telegram.twoWay, false);
});
