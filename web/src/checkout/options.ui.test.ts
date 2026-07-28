import { buildCheckoutOptions } from "./options";

test("builds inline options with price, accountId, and email", () => {
  const opts = buildCheckoutOptions({ priceId: "pri_x", accountId: "acct_1", email: "a@b.co" });
  expect(opts.items).toEqual([{ priceId: "pri_x", quantity: 1 }]);
  expect(opts.customData).toEqual({ accountId: "acct_1" });
  expect(opts.customer).toEqual({ email: "a@b.co" });
  expect(opts.settings.displayMode).toBe("inline");
  expect(opts.settings.frameTarget).toBe("checkout-container");
});

test("omits customer when no email", () => {
  const opts = buildCheckoutOptions({ priceId: "pri_x", accountId: "acct_1" });
  expect(opts.customer).toBeUndefined();
});
