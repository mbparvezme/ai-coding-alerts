// Recover the raw-base64 Ed25519 PUBLIC key from the PKCS8-base64 PRIVATE key.
// Use this when you still have LICENSE_SIGNING_PRIVATE_KEY but lost the matching public key.
// The private key is read from the environment — it is never written to disk or printed.
//
//   PowerShell:
//     $env:LICENSE_SIGNING_PRIVATE_KEY = "<your private base64 pkcs8>"
//     node scripts/derive-public.mjs
//
// The value it prints is what goes into src/license/constants.ts -> LICENSE_PUBLIC_KEY_B64.
import { createPrivateKey, createPublicKey } from "node:crypto";

const b64 = process.env.LICENSE_SIGNING_PRIVATE_KEY;
if (!b64) {
  console.error("Set LICENSE_SIGNING_PRIVATE_KEY (base64 pkcs8) in the environment first.");
  process.exit(1);
}

const priv = createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
const jwk = createPublicKey(priv).export({ format: "jwk" });
const raw = Buffer.from(jwk.x, "base64url"); // 32-byte Ed25519 public key

console.log("PUBLIC (extension LICENSE_PUBLIC_KEY_B64, base64 raw):");
console.log(raw.toString("base64"));
