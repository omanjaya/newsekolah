import { defineConfig, devices } from "@playwright/test";

const PORT = 3177;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // e2e/smoke and e2e/simulation are real-stack suites with their own
  // configs (playwright.smoke.config.ts, playwright.sim.config.ts); they
  // can never pass against this mocked server, so this config runs only
  // the specs at the top of e2e/.
  testIgnore: ["smoke/**", "simulation/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 15_000 },
  globalTimeout: 10 * 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production server on a fixed free port: `test:e2e` builds first with the
    // API URL pointed at this origin, so every fetch is same-origin and mocked.
    command: `pnpm exec next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // Same origin as the app itself: every request in e2e/ is intercepted
      // with page.route (no real API runs during e2e), and same-origin
      // sidesteps CORS entirely for the mocked fetches and the refresh
      // cookie's `credentials: "include"`.
      NEXT_PUBLIC_API_URL: BASE_URL,
      // Server-side branding fetch must not loop back into this app; a closed
      // port fails fast and the layout falls back to defaults.
      API_INTERNAL_URL: "http://127.0.0.1:9",
    },
  },
});
