import { bytesToHex } from "../lib/encoding";

/** Parse "ts=...;h1=..." into its parts. */
function parseHeader(header: string): { ts: string; h1: string } | null {
  const parts: Record<string, string> = {};
  for (const segment of header.split(";")) {
    const [k, v] = segment.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  return parts.ts && parts.h1 ? { ts: parts.ts, h1: parts.h1 } : null;
}

/** Constant-time compare of two equal-length hex strings. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  const parsed = parseHeader(signatureHeader);
  if (!parsed) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parsed.ts}:${rawBody}`));
  return timingSafeEqual(bytesToHex(new Uint8Array(mac)), parsed.h1.toLowerCase());
}
