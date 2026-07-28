/**
 * Gate for future premium features. If not Pro, trigger the upsell and return false.
 * Existing free features MUST NOT call this (spec §5).
 */
export function requirePro(
  service: { isPro(): boolean },
  feature: string,
  showUpsell: (feature: string) => void
): boolean {
  if (service.isPro()) return true;
  showUpsell(feature);
  return false;
}
