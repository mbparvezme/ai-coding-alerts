import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateLicense, TOKEN_TTL_MS, GRACE_MS, RECHECK_MS } from "../../src/license/state";
import type { TokenPayload } from "../../src/license/token";

const iatSec = 1_000_000;
const iatMs = iatSec * 1000;
const base: TokenPayload = { sub: "h", deviceId: "d", status: "active", plan: "monthly", iat: iatSec, exp: iatSec + TOKEN_TTL_MS / 1000 };

test("no token -> not pro, mode none", () => {
  assert.deepEqual(evaluateLicense(null, iatMs), { pro: false, mode: "none", shouldRevalidate: false });
});

test("fresh active token -> pro, mode active", () => {
  const s = evaluateLicense(base, iatMs + 1000);
  assert.equal(s.pro, true);
  assert.equal(s.mode, "active");
});

test("past TTL but inside grace -> pro, mode grace", () => {
  const s = evaluateLicense(base, iatMs + TOKEN_TTL_MS + 60_000);
  assert.equal(s.pro, true);
  assert.equal(s.mode, "grace");
});

test("past grace -> not pro, mode expired", () => {
  const s = evaluateLicense(base, iatMs + GRACE_MS + 1000);
  assert.equal(s.pro, false);
  assert.equal(s.mode, "expired");
});

test("inactive status -> not pro, mode inactive, wants revalidation", () => {
  const s = evaluateLicense({ ...base, status: "canceled" }, iatMs + 1000);
  assert.deepEqual(s, { pro: false, mode: "inactive", shouldRevalidate: true });
});

test("shouldRevalidate flips on after the recheck cadence", () => {
  assert.equal(evaluateLicense(base, iatMs + RECHECK_MS - 1000).shouldRevalidate, false);
  assert.equal(evaluateLicense(base, iatMs + RECHECK_MS + 1000).shouldRevalidate, true);
});
