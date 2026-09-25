import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.SIM_BASE_URL ?? "http://localhost:3000";

/**
 * "School day" simulation: a multi-actor, real-stack Playwright suite that
 * proves cross-role flows AND their realtime updates work end to end --
 * never mocked (`page.route`), always against a real running API and web
 * app. Deliberately separate from playwright.config.ts (mocked, builds its
 * own server) and playwright.smoke.config.ts (single-actor-per-spec role
 * tours): every spec here opens several actors' browser contexts at once
 * inside one test, to assert that one actor's action is visible on
 * ANOTHER actor's already-open screen without a reload.
 *
 * Run with `pnpm --filter @newsekolah/web e2e:sim` (from the repo root) or
 * `pnpm e2e:sim` (from apps/web). Requires the seeded "sma-contoh" tenant
 * (infra/docker/README.dev.md: `pnpm dev:docker:seed`) and SEED_PASSWORD
 * to match the running API's.
 *
 * Refuses to run against production or a shared/staging host it was not
 * explicitly pointed at by name: see e2e/simulation/guard.ts, loaded by
 * every spec through fixtures.ts before any browser context opens.
 */
export default defineConfig({
  testDir: "./e2e/simulation",
  // Serial, one worker: several specs act on the SAME seeded accounts
  // (the picket/leadership/security/counselor duty holders, the homeroom
  // teacher, the two students) and permits enforces "one in-progress
  // instance per kind per student" -- running scenarios concurrently would
  // make one spec's in-progress leave request or exit permit block
  // another's. See e2e/simulation/fixtures.ts's actor accounts and each
  // spec's own comment on which student it uses and why.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "sim-report" }]]
    : [["list"], ["html", { open: "never", outputFolder: "sim-report" }]],
  timeout: 90_000,
  expect: { timeout: 20_000 },
  globalTimeout: 30 * 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
