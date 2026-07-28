export interface PaddleSubEvent {
  eventId: string;
  type: string;
  subscriptionId: string;
  customerId: string | null;
  accountId: string | null;
  status: string;
  plan: string | null;
}

const SUBSCRIPTION_EVENT_TYPES = new Set([
  "subscription.created",
  "subscription.activated",
  "subscription.updated",
  "subscription.canceled",
  "subscription.past_due",
  "subscription.paused"
]);

const KNOWN_STATUSES = new Set(["active", "past_due", "canceled", "paused"]);

function mapStatus(raw: unknown): string {
  if (typeof raw === "string" && KNOWN_STATUSES.has(raw)) return raw;
  return "";
}

function mapPlan(interval: unknown): string | null {
  if (interval === "month") return "monthly";
  if (interval === "year") return "yearly";
  return null;
}

export function parsePaddleEvent(raw: unknown): PaddleSubEvent | null {
  if (typeof raw !== "object" || raw === null) return null;

  const b = raw as { event_type?: unknown; event_id?: unknown; data?: Record<string, unknown> };
  const type = typeof b.event_type === "string" ? b.event_type : "";
  if (!SUBSCRIPTION_EVENT_TYPES.has(type)) return null;

  const eventId = typeof b.event_id === "string" ? b.event_id : "";
  const data = (b.data ?? {}) as Record<string, unknown>;

  const subscriptionId = typeof data.id === "string" ? data.id : "";
  const customerId = typeof data.customer_id === "string" ? data.customer_id : null;

  const customData = data.custom_data as Record<string, unknown> | undefined;
  const accountId =
    customData && typeof customData.accountId === "string" ? customData.accountId : null;

  const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
  const interval = (
    items[0]?.price as { billing_cycle?: { interval?: unknown } } | undefined
  )?.billing_cycle?.interval;

  return {
    eventId,
    type,
    subscriptionId,
    customerId,
    accountId,
    status: mapStatus(data.status),
    plan: mapPlan(interval)
  };
}
