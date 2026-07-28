import { webcrypto } from "node:crypto";
import { base64urlDecodeToBytes, base64urlDecodeToString } from "./encoding";

export interface TokenPayload {
  sub: string;
  deviceId: string;
  status: string;
  plan: string | null;
  iat: number;
  exp: number;
}

export function decodeToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64urlDecodeToString(parts[1])) as TokenPayload;
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;
    return payload;
  } catch {
    return null;
  }
}

export function importPublicKey(rawBase64: string): Promise<webcrypto.CryptoKey> {
  const raw = new Uint8Array(Buffer.from(rawBase64, "base64"));
  return webcrypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]) as Promise<webcrypto.CryptoKey>;
}

export async function verifyToken(token: string, key: webcrypto.CryptoKey): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = decodeToken(token);
  if (!payload) return null;
  try {
    const ok = await webcrypto.subtle.verify(
      { name: "Ed25519" },
      key,
      base64urlDecodeToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    return ok ? payload : null;
  } catch {
    return null;
  }
}
