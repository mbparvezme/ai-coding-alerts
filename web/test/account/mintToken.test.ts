import { describe, it, expect } from "vitest";
import { mintAccountToken } from "../../src/server/account/mintToken";
import { verifyToken } from "../../src/server/lib/jwt";
import { makeTestKeypair } from "../helpers";

describe("mintAccountToken", () => {
  it("puts accountId in sub and sets exp = iat + 7d", async () => {
    const { signingKey, publicKey } = await makeTestKeypair();
    const token = await mintAccountToken("acct_9", "dev_1", { status: "active", plan: "yearly" }, 1_700_000_000_000, signingKey);
    const p = await verifyToken(token, publicKey);
    expect(p?.sub).toBe("acct_9");
    expect(p?.deviceId).toBe("dev_1");
    expect(p!.exp - p!.iat).toBe(604800);
  });
});
