export function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64urlEncodeString(s: string): string {
  return base64urlEncode(new TextEncoder().encode(s));
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}

// --- Decode side (ported from v1's extension-side src/license/encoding.ts,
// adapted from node:crypto/Buffer to the Workers-native atob global so the
// whole file stays dependency-free under Miniflare). Needed here because the
// unified web app must both sign AND verify tokens, unlike v1's server which
// only signed.

function toStandardBase64(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return s.replace(/-/g, "+").replace(/_/g, "/") + pad;
}

export function base64urlDecodeToBytes(s: string): Uint8Array {
  const binary = atob(toStandardBase64(s));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64urlDecodeToString(s: string): string {
  return new TextDecoder().decode(base64urlDecodeToBytes(s));
}
