import { buildPortalSessionRequest, parsePortalSessionResponse } from "./portal";

test("builds a sandbox portal-session request", () => {
  const { url, init } = buildPortalSessionRequest("ctm_1", "sandbox", "apikey");
  expect(url).toBe("https://sandbox-api.paddle.com/customers/ctm_1/portal-sessions");
  expect(init.method).toBe("POST");
  expect((init.headers as Record<string, string>).Authorization).toBe("Bearer apikey");
});

test("uses production host when production", () => {
  const { url } = buildPortalSessionRequest("ctm_1", "production", "k");
  expect(url).toBe("https://api.paddle.com/customers/ctm_1/portal-sessions");
});

test("parses the overview URL", () => {
  const url = parsePortalSessionResponse({ data: { urls: { general: { overview: "https://portal/x" } } } });
  expect(url).toBe("https://portal/x");
});

test("throws on unexpected shape", () => {
  expect(() => parsePortalSessionResponse({ data: {} })).toThrow();
});
