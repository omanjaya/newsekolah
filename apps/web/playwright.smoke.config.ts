import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

/**
 * Pre-deploy SMOKE suite: runs against a REAL stack, never mocked --
 * `pnpm dev:docker` locally (API on :8080, web on :3000, seeded tenant
 * "sma-contoh"; see infra/docker/README.dev.md), or SMOKE_BASE_URL
 * pointed at a deployed one (e.g. the VPS). Deliberately separate from
 * playwright.config.ts (apps/web/e2e/*.spec.ts): that suite mocks the API
 * with `page.route` against a production build it builds and boots
 * itself on a fixed port. This one never starts a server, because a
 * pre-deploy smoke run must be able to point at a box it does not
 * control.
 *
 * Run with `pnpm --filter web e2e:smoke` (from the repo root) or
 * `pnpm e2e:smoke` (from apps/web).
 */
export default defineConfig({
  testDir: "./e2e/smoke",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "smoke-report" }]]
    : [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  globalTimeout: 20 * 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Logs in once per role per viewport variant and saves storageState
    // under e2e/smoke/.auth/ (gitignored -- real session cookies). Every
    // other project depends on this one, so it runs exactly once
    // regardless of how many other projects consume its output.
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "desktop-1280x800",
      testMatch: /roles\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      dependencies: ["setup"],
    },
    {
      name: "mobile-390x844",
      testMatch: /roles\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
      dependencies: ["setup"],
    },
    // logout.spec.ts logs each role in again on a fresh context to get a
    // session it can safely revoke -- the API's "single device login"
    // policy (apps/api/internal/modules/identity/service/auth.go,
    // RevokeOtherSessions(..., "single_device_login")) means ANY new
    // login for an account revokes every *other* active session for that
    // same account, not just an explicit logout. Doing that mid-run,
    // concurrently with desktop-1280x800/mobile-390x844 still using that
    // role's setup-issued session, was exactly what made every role's
    // tests start failing partway through (observed: every role's
    // /v1/auth/refresh calls started returning 401 in the same few-second
    // window logout.spec.ts's logins ran in). Depending on both viewport
    // projects finishing first means nothing is still relying on a
    // role's session by the time logout logs it in again to test logging
    // out of it. One viewport is enough for a login/logout round trip --
    // it isn't a layout concern the 390x844 pass would add anything to.
    {
      name: "logout",
      testMatch: /logout\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      dependencies: ["setup", "desktop-1280x800", "mobile-390x844"],
    },
  ],
});
