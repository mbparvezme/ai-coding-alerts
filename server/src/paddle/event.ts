export interface PaddleEvent {
  kind: "created" | "activated" | "updated" | "canceled" | "past_due" | "transaction" | "ignored";
  eventId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  transactionId: string | null;
  email: string | null;
  plan: "monthly" | "yearly" | null;
  status: "active" | "past_due" | "canceled" | null;
}

const KIND_BY_EVENT: Record<string, PaddleEvent["kind"]> = {
  "subscription.created": "created",
  "subscription.activated": "activated",
  "subscription.updated": "updated",
  "subscription.canceled": "canceled",
  "subscription.past_due": "past_due",
  "transaction.completed": "transaction"
};

function mapStatus(raw: unknown): PaddleEvent["status"] {
  if (raw === "active" || raw === "past_due" || raw === "canceled") return raw;
  return null;
}

function mapPlan(interval: unknown): PaddleEvent["plan"] {
  if (interval === "month") return "monthly";
  if (interval === "year") return "yearly";
  return null;
}

export function parsePaddleEvent(body: unknown): PaddleEvent {
  const empty: PaddleEvent = {
    kind: "ignored",
    eventId: null,
    subscriptionId: null,
    customerId: null,
    transactionId: null,
    email: null,
    plan: null,
    status: null
  };
  if (typeof body !== "object" || body === null) return empty;

  const b = body as { event_type?: unknown; event_id?: unknown; data?: Record<string, unknown> };
  const eventId = typeof b.event_id === "string" ? b.event_id : null;
  const kind = KIND_BY_EVENT[String(b.event_type)] ?? "ignored";
  if (kind === "ignored") return empty;

  const data = (b.data ?? {}) as Record<string, unknown>;

  if (kind === "transaction") {
    return {
      ...empty,
      kind,
      eventId,
      transactionId: (data.id as string) ?? null,
      subscriptionId: (data.subscription_id as string) ?? null
    };
  }

  const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
  const interval = (
    items[0]?.price as { billing_cycle?: { interval?: unknown } } | undefined
  )?.billing_cycle?.interval;

  return {
    kind,
    eventId,
    subscriptionId: (data.id as string) ?? null,
    customerId: (data.customer_id as string) ?? null,
    transactionId: null,
    email: (data.email as string) ?? null,
    plan: mapPlan(interval),
    status: mapStatus(data.status) ?? (kind === "created" || kind === "activated" ? "active" : null)
  };
}

/**
 * The single source of truth for how many devices a plan allows.
 * Flat 3 in v1; tiered/add-on plans become a change here + its test only —
 * no schema or activation change (spec §10, "add-on-ready").
 */
export function resolvePlanDeviceLimit(_plan: "monthly" | "yearly" | null): number {
  return 3;
}
