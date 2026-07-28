// Augments @opennextjs/cloudflare's ambient `CloudflareEnv` interface (see
// node_modules/@opennextjs/cloudflare/dist/api/cloudflare-context.d.ts) with
// this app's actual bindings/secrets, so `getCloudflareContext().env` is
// typed for route adapters. Normally produced by `wrangler types`; declared
// by hand here to stay in sync with `src/server/lib/env.ts`'s `AccountEnv`
// (the canonical binding list used by the test-side `cloudflare:test` env
// augmentation in test/env.d.ts).
import type { AccountEnv } from "./src/server/lib/env";

declare global {
  interface CloudflareEnv extends AccountEnv {}
}

export {};
