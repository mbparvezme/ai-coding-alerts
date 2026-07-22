import schemaSql from "../schema.sql?raw";

/** Apply schema.sql to a fresh Miniflare D1 instance (per test file). */
export async function applySchema(db: D1Database): Promise<void> {
  const withoutComments = schemaSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

/** A throwaway Ed25519 keypair for signing/verifying tokens in tests. */
export async function makeTestKeypair(): Promise<{
  privateKey: CryptoKey;
  publicKeyB64: string;
  privatePkcs8B64: string;
}> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify"
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return {
    privateKey: pair.privateKey,
    publicKeyB64: btoa(String.fromCharCode(...raw)),
    privatePkcs8B64: btoa(String.fromCharCode(...pkcs8))
  };
}
