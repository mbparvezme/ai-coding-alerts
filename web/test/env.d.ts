/// <reference types="@cloudflare/vitest-pool-workers" />

import type { AccountEnv } from "../src/server/lib/env";

declare module "cloudflare:test" {
  interface ProvidedEnv extends AccountEnv {}
}
