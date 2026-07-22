import { base64urlEncode, base64urlEncodeString } from "./encoding";

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

export async function signLicenseToken(payload: TokenPayload, key: CryptoKey): Promise<string> {
  const body = base64urlEncodeString(JSON.stringify(payload));
  const signingInput = `${HEADER}.${body}`;
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64urlEncode(new Uint8Array(sig))}`;
}
