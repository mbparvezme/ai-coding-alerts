import type { Paddle } from "@paddle/paddle-js";

export interface PromoPrice {
  // Pre-discount list price (struck through), e.g. "$48.00".
  strike: string;
  // Discounted price shown large, e.g. "$36.00".
  now: string;
  // Whether a discount actually applied (strike differs from now). When false, callers
  // should hide the strike + promo badge so the page never claims a discount Paddle didn't give.
  discounted: boolean;
}

// Field paths verified against @paddle/paddle-js price-preview.d.ts / shared.d.ts:
// PricePreviewResponse.data.details.lineItems[].{ price.id, totals } where
// totals: Totals = { subtotal, discount, tax, total } as MINOR-UNIT numeric strings.
// We display both figures on the same pre-tax basis: strike = subtotal, now = subtotal - discount.
// (Using `total` for `now` would fold in region-estimated tax and make the discount look wrong.)
function formatMinor(minorUnits: number, currency: string): string {
  const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency });
  const decimals = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  return fmt.format(minorUnits / 10 ** decimals);
}

// Previews all given price IDs in one call (the discount applies per eligible line item),
// keyed by price ID. Rejects/throws bubble up to the caller, which falls back to static copy.
export async function previewPromoPrices(
  paddle: Paddle,
  priceIds: string[],
  discountId: string,
): Promise<Record<string, PromoPrice>> {
  const res = await paddle.PricePreview({
    items: priceIds.map((priceId) => ({ priceId, quantity: 1 })),
    discountId,
  });
  const currency = res.data.currencyCode;
  const out: Record<string, PromoPrice> = {};
  for (const li of res.data.details.lineItems) {
    const subtotal = Number(li.totals.subtotal);
    const discount = Number(li.totals.discount);
    out[li.price.id] = {
      strike: formatMinor(subtotal, currency),
      now: formatMinor(subtotal - discount, currency),
      discounted: discount > 0,
    };
  }
  return out;
}
