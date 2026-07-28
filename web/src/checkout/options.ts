export interface CheckoutOpenOptions {
  items: { priceId: string; quantity: number }[];
  customData: { accountId: string };
  customer?: { email: string };
  settings: {
    displayMode: "inline";
    frameTarget: string;
    frameInitialHeight: number;
    frameStyle: string;
  };
}

export function buildCheckoutOptions(input: {
  priceId: string;
  accountId: string;
  email?: string;
  containerClass?: string;
}): CheckoutOpenOptions {
  return {
    items: [{ priceId: input.priceId, quantity: 1 }],
    customData: { accountId: input.accountId },
    ...(input.email ? { customer: { email: input.email } } : {}),
    settings: {
      displayMode: "inline",
      frameTarget: input.containerClass ?? "checkout-container",
      frameInitialHeight: 450,
      frameStyle: "background: transparent; border: none;",
    },
  };
}
