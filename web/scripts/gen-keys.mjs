// Generate an Ed25519 keypair for license-token signing.
//   node scripts/gen-keys.mjs
// Private (PKCS8 base64) -> Worker secret LICENSE_SIGNING_PRIVATE_KEY.
// Public  (raw base64)   -> extension constant LICENSE_PUBLIC_KEY_B64.
const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const b64 = (u8) => Buffer.from(u8).toString("base64");
console.log("PRIVATE (LICENSE_SIGNING_PRIVATE_KEY, base64 pkcs8):\n" + b64(pkcs8) + "\n");
console.log("PUBLIC (extension LICENSE_PUBLIC_KEY_B64, base64 raw):\n" + b64(raw) + "\n");
