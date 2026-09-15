import { base64urlEncode, base64urlEncodeString, base64urlDecodeToBytes, base64urlDecodeToString } from "./encoding";

export interface TokenPayload {
  sub: string;
  deviceId: string;
  status: string;
  plan: string | null;
  iat: number;
  exp: number;
}

const HEADER = base64urlEncodeString(JSON.stringify({ alg: "EdDSA", typ: "JWT" }));

export async function importSigningKey(pkcs8Base64: string): Promise<CryptoKey> {
  const pkcs8 = Uint8Array.from(atob(pkcs8Base64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
}

export async function importVerifyKey(publicKeyBase64: string): Promise<CryptoKey> {
  const spki = Uint8Array.from(atob(publicKeyBase64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("spki", spki, { name: "Ed25519" }, false, ["verify"]);
}

export async function signLicenseToken(payload: TokenPayload, key: CryptoKey): Promise<string> {
  const body = base64urlEncodeString(JSON.stringify(payload));
  const signingInput = `${HEADER}.${body}`;
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64urlEncode(new Uint8Array(sig))}`;
}

// Ported from v1's extension-side src/license/token.ts (which verified
// tokens signed by the v1 server) and adapted from node:crypto's `webcrypto`
// to the Workers-native global `crypto`. The unified web app needs both
// directions in one place: it signs tokens (as v1's server did) and now also
// verifies them (as v1's extension did).
export async function verifyToken(token: string, key: CryptoKey): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let payload: TokenPayload;
  try {
    payload = JSON.parse(base64urlDecodeToString(parts[1])) as TokenPayload;
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;
  } catch {
    return null;
  }
  try {
    const ok = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      base64urlDecodeToBytes(parts[2]) as BufferSource,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    return ok ? payload : null;
  } catch {
    return null;
  }
}
