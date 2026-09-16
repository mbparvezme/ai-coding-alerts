import { describe, it, expect } from "vitest";
import { makeTestKeypair } from "../helpers";
import { signLicenseToken, type TokenPayload } from "../../src/server/lib/jwt";
import { authenticateRelay } from "../../src/server/relay/relayAuth";

async function tokenFor(over: Partial<TokenPayload>, signingKey: CryptoKey) {
  const p: TokenPayload = { sub: "acct_1", deviceId: "dev_1", status: "active", plan: "monthly", iat: 0, exp: 1000, ...over };
  return signLicenseToken(p, signingKey);
}
function req(token?: string) {
  return new Request("http://t/relay", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

describe("relay auth", () => {
  it("accepts a valid active token and returns account + device", async () => {
    const { publicKey, signingKey } = await makeTestKeypair();
    const id = await authenticateRelay(req(await tokenFor({}, signingKey)), publicKey, 500_000); // 500s < exp 1000s
    expect(id).toEqual({ accountId: "acct_1", deviceId: "dev_1" });
  });

  it("rejects missing, expired, tampered, or unentitled tokens", async () => {
    const { publicKey, signingKey } = await makeTestKeypair();
    expect(await authenticateRelay(req(), publicKey, 1)).toBeNull();
    expect(await authenticateRelay(req(await tokenFor({}, signingKey)), publicKey, 2_000_000)).toBeNull(); // exp 1000s < 2000s
    expect(await authenticateRelay(req(await tokenFor({ status: "canceled" }, signingKey)), publicKey, 500_000)).toBeNull();
    expect(await authenticateRelay(req("a.b.c"), publicKey, 500_000)).toBeNull();
  });
});
