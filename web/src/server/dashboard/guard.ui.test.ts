import { requireAccountId, REDIRECT_TO_SIGNIN } from "./guard";

test("returns the accountId when present", () => {
  expect(requireAccountId({ accountId: "acct_1" })).toBe("acct_1");
});

test("throws the sign-in redirect signal when absent", () => {
  expect(() => requireAccountId(null)).toThrow(REDIRECT_TO_SIGNIN);
});
