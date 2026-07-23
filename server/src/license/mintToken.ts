import { signLicenseToken } from "../lib/jwt";
import { sha256Hex } from "../lib/encoding";
import type { LicenseRow } from "./repository";

export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function mintLicenseToken(
  license: LicenseRow,
  deviceId: string,
  nowMs: number,
  signingKey: CryptoKey
): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  return signLicenseToken(
    {
      sub: await sha256Hex(license.license_key),
      deviceId,
      status: license.status,
      plan: license.plan,
      iat,
      exp: iat + TOKEN_TTL_SECONDS
    },
    signingKey
  );
}
