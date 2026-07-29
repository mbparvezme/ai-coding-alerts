export function buildPortalSessionRequest(
  customerId: string,
  env: "sandbox" | "production",
  apiKey: string
): { url: string; init: RequestInit } {
  const host = env === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  return {
    url: `${host}/customers/${customerId}/portal-sessions`,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  };
}

export function parsePortalSessionResponse(json: unknown): string {
  const overview = (json as any)?.data?.urls?.general?.overview;
  if (typeof overview !== "string") throw new Error("paddle_portal: unexpected response shape");
  return overview;
}
