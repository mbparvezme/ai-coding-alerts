import { describe, it, expect } from "vitest";
import { verifyGithubToken, type GithubFetch } from "../../src/server/account/github";

const fakeFetch = (responses: Record<string, { status: number; body: unknown }>): GithubFetch =>
  async (url) => {
    const r = responses[url] ?? { status: 404, body: {} };
    return { status: r.status, json: async () => r.body };
  };

describe("verifyGithubToken", () => {
  it("returns identity from /user when email present", async () => {
    const f = fakeFetch({
      "https://api.github.com/user": { status: 200, body: { id: 7, login: "grace", name: "Grace", email: "g@navy.mil", avatar_url: "http://a/g.png" } }
    });
    const id = await verifyGithubToken("gho_x", f);
    expect(id).toEqual({ githubId: 7, email: "g@navy.mil", name: "Grace", username: "grace", avatarUrl: "http://a/g.png" });
  });

  it("falls back to /user/emails when profile email is null", async () => {
    const f = fakeFetch({
      "https://api.github.com/user": { status: 200, body: { id: 7, login: "grace", name: "Grace", email: null, avatar_url: "http://a/g.png" } },
      "https://api.github.com/user/emails": { status: 200, body: [{ email: "s@x.com", primary: false, verified: true }, { email: "p@x.com", primary: true, verified: true }] }
    });
    const id = await verifyGithubToken("gho_x", f);
    expect(id?.email).toBe("p@x.com");
  });

  it("returns null on an invalid token (401)", async () => {
    const f = fakeFetch({ "https://api.github.com/user": { status: 401, body: {} } });
    expect(await verifyGithubToken("bad", f)).toBeNull();
  });
});
