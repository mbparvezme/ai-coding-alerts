import { describe, it, expect } from "vitest";
import { signLicenseToken, verifyToken } from "../../src/server/lib/jwt";
import { makeTestKeypair } from "../helpers";

describe("ported jwt", () => {
  it("round-trips a signed account token", async () => {
    const { signingKey, publicKey } = await makeTestKeypair();
    const iat = 1_700_000_000;
    const token = await signLicenseToken(
      { sub: "acct_1", deviceId: "dev_1", status: "active", plan: "yearly", iat, exp: iat + 604800 },
      signingKey
    );
    const payload = await verifyToken(token, publicKey);
    expect(payload?.sub).toBe("acct_1");
    expect(payload?.status).toBe("active");
  });

  it("rejects a tampered token", async () => {
    const { signingKey, publicKey } = await makeTestKeypair();
    const token = await signLicenseToken(
      { sub: "acct_1", deviceId: "d", status: "active", plan: null, iat: 1, exp: 2 },
      signingKey
    );
    expect(await verifyToken(token + "x", publicKey)).toBeNull();
  });
});
