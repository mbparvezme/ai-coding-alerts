import schemaSql from "../schema.sql?raw";

export async function applySchema(db: D1Database): Promise<void> {
  for (const stmt of schemaSql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await db.prepare(stmt).run();
  }
}

export async function makeTestKeypair() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const raw = (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer;
  const privateKeyB64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
  return { privateKeyB64, publicKey: pair.publicKey, signingKey: pair.privateKey };
}
