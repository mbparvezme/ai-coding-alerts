import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema } from "./helpers";

describe("router", () => {
  beforeEach(async () => {
    await applySchema(env.DB);
  });

  it("404s an unknown route", async () => {
    const res = await SELF.fetch("https://x/nope");
    expect(res.status).toBe(404);
  });

  it("rejects an unsigned Paddle webhook with 401", async () => {
    const res = await SELF.fetch("https://x/webhooks/paddle", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });

  it("400s activate with no body fields", async () => {
    const res = await SELF.fetch("https://x/license/activate", { method: "POST", body: "{}" });
    expect(res.status).toBe(400);
  });

  it("serves the success page as HTML", async () => {
    const res = await SELF.fetch("https://x/license?txn=whatever");
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
