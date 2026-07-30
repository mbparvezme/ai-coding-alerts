import { PADDLE_PRICE_IDS, getPaddleEnv } from "./paddle";

test("price IDs are the configured Paddle prices", () => {
  expect(PADDLE_PRICE_IDS.monthly).toMatch(/^pri_/);
  expect(PADDLE_PRICE_IDS.yearly).toMatch(/^pri_/);
  expect(PADDLE_PRICE_IDS.monthly).not.toBe(PADDLE_PRICE_IDS.yearly);
});

test("defaults to sandbox", () => {
  delete process.env.NEXT_PUBLIC_PADDLE_ENV;
  expect(getPaddleEnv()).toBe("sandbox");
});
