// Crockford base32 alphabet (no I, L, O, U — avoids ambiguity).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateLicenseKey(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % 32]);
  const groups = [chars.slice(0, 5), chars.slice(5, 10), chars.slice(10, 15), chars.slice(15, 20)];
  return "ACA-" + groups.map((g) => g.join("")).join("-");
}
