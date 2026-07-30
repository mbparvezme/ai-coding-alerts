import path from "node:path";
import { defineProject } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineProject({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    name: "ui",
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.ui.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ui.ts"],
  },
});
