import { defineWorkspace } from "vitest/config";
import workersConfig from "./vitest.workers.config";
import uiConfig from "./vitest.ui.config";

// NOTE: Vitest 2.0.5's workspace resolver only recognizes string-path project entries whose
// filename starts with "vitest.config" or "vite.config" (see CONFIG_NAMES in
// node_modules/vitest/dist/chunks/constants.*.js) — "vitest.workers.config.ts" and
// "vitest.ui.config.ts" don't match that prefix and get silently dropped, leaving zero projects.
// Importing the resolved config objects and passing them inline (instead of string paths)
// bypasses that filename filter while keeping the descriptive file names.
export default defineWorkspace([workersConfig, uiConfig]);
