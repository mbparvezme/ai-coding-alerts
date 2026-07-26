import schemaSql from "../schema.sql?raw";

export async function applySchema(db: D1Database): Promise<void> {
  // Strip `-- ...` line comments before splitting on `;`, so a comment containing a literal
  // semicolon (e.g. "-- our account id; rides into Paddle custom_data") can't truncate the
  // statement it documents. Normalize CRLF -> LF first: on a line with a trailing "\r" (as
  // Windows checkouts produce), an unanchored "$" never matches after ".*" (since "." excludes
  // "\r"), so the strip would silently no-op without this normalization.
  const withoutComments = schemaSql
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/--.*/, ""))
    .join("\n");
  for (const stmt of withoutComments
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
