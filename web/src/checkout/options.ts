export interface CheckoutOpenOptions {
  items: { priceId: string; quantity: number }[];
  customData: { accountId: string };
  discountId?: string;
  customer?: { email: string };
  settings: {
    displayMode: "overlay";
    theme: "dark" | "light";
  };
}

export function buildCheckoutOptions(input: {
  priceId: string;
  accountId: string;
  email?: string;
  discountId?: string;
}): CheckoutOpenOptions {
  return {
    items: [{ priceId: input.priceId, quantity: 1 }],
    customData: { accountId: input.accountId },
    ...(input.discountId ? { discountId: input.discountId } : {}),
    ...(input.email ? { customer: { email: input.email } } : {}),
    settings: {
      // Overlay (popup) checkout — replaces the old embedded inline form, which clashed
      // with the page design. Dark theme to match the site's dark-first palette.
      displayMode: "overlay",
      theme: "dark",
    },
  };
}
