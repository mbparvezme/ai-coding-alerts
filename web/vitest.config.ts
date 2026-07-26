import path from "node:path";
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  test: {
    poolOptions: {
      workers: {
        main: "./src/server/lib/jwt.ts",
        miniflare: {
          compatibilityDate: "2024-09-23",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          bindings: {
            PADDLE_WEBHOOK_SECRET: "whsec_test",
            LICENSE_SIGNING_PRIVATE_KEY: "TEST_ONLY_REPLACED_AT_RUNTIME"
          }
        }
      }
    }
  }
});
