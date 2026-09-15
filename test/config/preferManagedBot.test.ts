import { test } from "node:test";
import assert from "node:assert/strict";
import { readAlertSettings } from "../../src/config/readAlertSettings";

test("preferManagedBot defaults to true and honors an override", () => {
  assert.equal(readAlertSettings(<T>(_k: string, fb: T) => fb).preferManagedBot, true);
  const overrides: Record<string, unknown> = { preferManagedBot: false };
  assert.equal(readAlertSettings(<T>(k: string, fb: T) => (k in overrides ? (overrides[k] as T) : fb)).preferManagedBot, false);
});
