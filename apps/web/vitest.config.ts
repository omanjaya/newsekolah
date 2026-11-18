import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],
    // Component tests that render a 50-row table and page through it finish
    // in about two seconds alone but passed the default 5s when the machine
    // was busy (a full monorepo run, a dev server, parallel agents). The
    // limit only bounds a hung test, so it can be generous.
    testTimeout: 20_000,
  },
});
