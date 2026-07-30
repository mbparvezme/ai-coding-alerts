import { buildCheckoutOptions } from "./options";

test("builds overlay options with price, accountId, email, and discount", () => {
  const opts = buildCheckoutOptions({ priceId: "pri_x", accountId: "acct_1", email: "a@b.co", discountId: "dsc_1" });
  expect(opts.items).toEqual([{ priceId: "pri_x", quantity: 1 }]);
  expect(opts.customData).toEqual({ accountId: "acct_1" });
  expect(opts.customer).toEqual({ email: "a@b.co" });
  expect(opts.discountId).toBe("dsc_1");
  expect(opts.settings.displayMode).toBe("overlay");
  expect(opts.settings.theme).toBe("dark");
});

test("omits customer and discount when not provided", () => {
  const opts = buildCheckoutOptions({ priceId: "pri_x", accountId: "acct_1" });
  expect(opts.customer).toBeUndefined();
  expect(opts.discountId).toBeUndefined();
});
