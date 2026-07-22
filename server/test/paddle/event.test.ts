import { describe, it, expect } from "vitest";
import { parsePaddleEvent, resolvePlanDeviceLimit } from "../../src/paddle/event";

const created = {
  event_type: "subscription.created",
  data: {
    id: "sub_123",
    customer_id: "ctm_1",
    status: "active",
    items: [{ price: { billing_cycle: { interval: "month" } } }]
  }
};

describe("parsePaddleEvent", () => {
  it("maps subscription.created to a created event with plan+status", () => {
    const e = parsePaddleEvent(created);
    expect(e.kind).toBe("created");
    expect(e.subscriptionId).toBe("sub_123");
    expect(e.customerId).toBe("ctm_1");
    expect(e.plan).toBe("monthly");
    expect(e.status).toBe("active");
  });

  it("maps a yearly interval to the yearly plan", () => {
    const e = parsePaddleEvent({
      ...created,
      data: { ...created.data, items: [{ price: { billing_cycle: { interval: "year" } } }] }
    });
    expect(e.plan).toBe("yearly");
  });

  it("maps subscription.canceled to canceled status", () => {
    const e = parsePaddleEvent({ event_type: "subscription.canceled", data: { id: "sub_9", status: "canceled" } });
    expect(e.kind).toBe("canceled");
    expect(e.status).toBe("canceled");
  });

  it("maps subscription.past_due", () => {
    const e = parsePaddleEvent({ event_type: "subscription.past_due", data: { id: "sub_9", status: "past_due" } });
    expect(e.kind).toBe("past_due");
    expect(e.status).toBe("past_due");
  });

  it("extracts the transaction id and subscription id from transaction.completed", () => {
    const e = parsePaddleEvent({
      event_type: "transaction.completed",
      data: { id: "txn_77", subscription_id: "sub_123" }
    });
    expect(e.kind).toBe("transaction");
    expect(e.transactionId).toBe("txn_77");
    expect(e.subscriptionId).toBe("sub_123");
  });

  it("returns 'ignored' for unrelated events", () => {
    expect(parsePaddleEvent({ event_type: "report.created", data: {} }).kind).toBe("ignored");
  });

  it("returns 'ignored' for non-object input", () => {
    expect(parsePaddleEvent(null).kind).toBe("ignored");
  });
});

describe("resolvePlanDeviceLimit", () => {
  it("is a flat 3 for every current plan (add-on-ready)", () => {
    expect(resolvePlanDeviceLimit("monthly")).toBe(3);
    expect(resolvePlanDeviceLimit("yearly")).toBe(3);
    expect(resolvePlanDeviceLimit(null)).toBe(3);
  });
});
