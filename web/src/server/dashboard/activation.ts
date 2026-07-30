export function activationState(
  checkoutParam: string | undefined,
  isPro: boolean
): "active" | "activating" | "none" {
  if (isPro) return "active";
  if (checkoutParam === "success") return "activating";
  return "none";
}
