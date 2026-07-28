export const PADDLE_PRICE_IDS = {
  monthly: "pri_01kymh3e8seggz1xc3e163xwp7",
  yearly: "pri_01kymh404r1avf25hk1zny63xy",
} as const;

export function getPaddleEnv(): "sandbox" | "production" {
  return process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox";
}

export function getPaddleClientToken(): string {
  return process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
}
