import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema } from "../helpers";
import { upsertOnSignIn } from "../../src/server/account/signIn";
import * as repo from "../../src/server/account/repository";

beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS users");
  await applySchema(env.DB);
});

describe("upsertOnSignIn", () => {
  it("creates the account row from a GitHub profile and returns its id", async () => {
    const id = await upsertOnSignIn({ id: 7, login: "grace", name: "Grace", email: "g@x.com", avatar_url: "http://a/g.png" }, env.DB, 1000);
    expect(id).toMatch(/^acct_/);
    expect((await repo.getUserByGithubId(env.DB, 7))?.id).toBe(id);
  });
});
