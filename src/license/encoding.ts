import { webcrypto } from "node:crypto";

function toStandardBase64(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return s.replace(/-/g, "+").replace(/_/g, "/") + pad;
}

export function base64urlDecodeToBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(toStandardBase64(s), "base64"));
}

export function base64urlDecodeToString(s: string): string {
  return Buffer.from(toStandardBase64(s), "base64").toString("utf8");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
