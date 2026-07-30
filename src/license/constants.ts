// Changeable at deployment (spec §10). LICENSE_BASE_URL is the unified web app's API origin
// (Next.js routes live under /api). LICENSE_PUBLIC_KEY_B64 is the base64 raw Ed25519 public key
// printed by web/scripts/gen-keys.mjs — paste the PUBLIC value here at deploy time.
// TODO(before publish): switch back to the custom domain (https://aicodingalert.com/api)
// once aicodingalert.com is attached to the Worker. Pointing at the live workers.dev origin
// now so end-to-end extension testing hits the deployed backend.
export const LICENSE_BASE_URL = "https://aicodingalerts.mbparvezme.workers.dev/api";
export const LICENSE_PUBLIC_KEY_B64 = "tG7Hi5fD4TZg5a547Nh1yONHBQRqU1Snpl8EqOyOlRw=";
export const PADDLE_CHECKOUT_URL = "https://aicodingalert.com/#pricing";