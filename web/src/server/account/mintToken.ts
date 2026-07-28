import { signLicenseToken } from "../lib/jwt";

export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function mintAccountToken(
  accountId: string,
  deviceId: string,
  entitlement: { status: string; plan: string | null },
  nowMs: number,
  signingKey: CryptoKey
): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  return signLicenseToken(
    {
      sub: accountId,
      deviceId,
      status: entitlement.status,
      plan: entitlement.plan,
      iat,
      exp: iat + TOKEN_TTL_SECONDS
    },
    signingKey
  );
}
