import { describe, it, expect } from "vitest";
import { parsePaddleEvent } from "../../src/server/paddle/event";

describe("parsePaddleEvent", () => {
  it("extracts accountId from custom_data and maps an active subscription", () => {
    const raw = {
      event_id: "evt_1",
      event_type: "subscription.activated",
      data: { id: "sub_1", customer_id: "ctm_1", status: "active", custom_data: { accountId: "acct_9" }, items: [{ price: { billing_cycle: { interval: "year" } } }] }
    };
    expect(parsePaddleEvent(raw)).toEqual({ eventId: "evt_1", type: "subscription.activated", subscriptionId: "sub_1", customerId: "ctm_1", accountId: "acct_9", status: "active", plan: "yearly" });
  });

  it("returns null for an unrelated event type", () => {
    expect(parsePaddleEvent({ event_id: "e", event_type: "report.created", data: {} })).toBeNull();
  });
});
