import type { SubscriptionRow } from "./repository";

export function resolveEntitlement(sub: SubscriptionRow | null): { status: string; plan: string | null } {
  if (sub?.status === "active") {
    return { status: "active", plan: sub.plan };
  }
  return { status: "inactive", plan: sub?.plan ?? null };
}
