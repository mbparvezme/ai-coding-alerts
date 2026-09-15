import { test } from "node:test";
import assert from "node:assert/strict";
import { selectBroker } from "../../src/permission/modeSelect";

test("managed wins only when pro, linked, and preferred", () => {
  assert.equal(selectBroker({ isPro: true, linked: true, preferManaged: true, diyConfigured: true }), "managed");
  assert.equal(selectBroker({ isPro: true, linked: true, preferManaged: false, diyConfigured: true }), "diy");
  assert.equal(selectBroker({ isPro: false, linked: true, preferManaged: true, diyConfigured: true }), "diy");
  assert.equal(selectBroker({ isPro: true, linked: false, preferManaged: true, diyConfigured: true }), "diy");
});

test("falls back to native when neither managed nor DIY is available", () => {
  assert.equal(selectBroker({ isPro: true, linked: false, preferManaged: true, diyConfigured: false }), "native");
  assert.equal(selectBroker({ isPro: false, linked: false, preferManaged: true, diyConfigured: false }), "native");
});
