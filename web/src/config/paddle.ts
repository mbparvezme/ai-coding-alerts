export const PADDLE_PRICE_IDS = {
  // PRODUCTION ID
  // monthly: "pri_01kymh3e8seggz1xc3e163xwp7",
  // yearly: "pri_01kymh404r1avf25hk1zny63xy",
  // TEST SANDBOX IDs
  monthly: "pri_01kysb79cstvjk3n7wqfwcszbf",
  yearly: "pri_01kysb87rfhba4yhfe161nvxpf",
} as const;

// Promotional "launch offer" discount (25% off). Passed to Paddle.PricePreview so the
// landing page shows the discounted price, and to Checkout.open so it applies at pay time.
// Sandbox and production are separate catalogs — create the discount in each and swap here.
export const PADDLE_DISCOUNT_ID =
  // PRODUCTION: "dsc_..."  (create the 25% launch discount in the live catalog, then paste)
  // TEST SANDBOX — 25% launch offer:
  "dsc_01kyt3n80rqhdz6qt66k2hk8vj";

export function getPaddleEnv(): "sandbox" | "production" {
  return process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox";
}

export function getPaddleClientToken(): string {
  return process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
}
