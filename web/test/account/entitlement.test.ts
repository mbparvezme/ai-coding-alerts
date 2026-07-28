import { describe, it, expect } from "vitest";
import { resolveEntitlement } from "../../src/server/account/entitlement";

describe("resolveEntitlement", () => {
  it("active subscription -> active", () => {
    expect(resolveEntitlement({ paddle_subscription_id: "s", user_id: "u", status: "active", plan: "monthly", created_at: 0, updated_at: 0 })).toEqual({ status: "active", plan: "monthly" });
  });
  it("null or non-active -> inactive", () => {
    expect(resolveEntitlement(null)).toEqual({ status: "inactive", plan: null });
    expect(resolveEntitlement({ paddle_subscription_id: "s", user_id: "u", status: "past_due", plan: "monthly", created_at: 0, updated_at: 0 })).toEqual({ status: "inactive", plan: "monthly" });
  });
});
