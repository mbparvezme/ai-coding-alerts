import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        main: "./src/index.ts",
        miniflare: {
          compatibilityDate: "2025-01-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          bindings: {
            PADDLE_WEBHOOK_SECRET: "whsec_test",
            LICENSE_SIGNING_PRIVATE_KEY: "MC4CAQAwBQYDK2VwBCIEIN6XKhln/tMwv7K3KOzP0IjK0Z/6X8SUs4nKfiEadiut"
          }
        }
      }
    }
  }
});
