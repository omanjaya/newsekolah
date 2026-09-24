import path from "node:path";
import { fileURLToPath } from "node:url";

import { test as base, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * Pre-deploy SMOKE suite (see playwright.smoke.config.ts). Unlike
 * apps/web/e2e/*.spec.ts, nothing here is mocked with `page.route`: every
 * request goes to the real API behind SMOKE_BASE_URL's running web app
 * (`pnpm dev:docker` locally, or the VPS).
 */

export const PASSWORD = "Password123!";

/** The seeded "sma-contoh" tenant's demo accounts (infra/docker/README.dev.md). */
export const ROLE_USERNAMES = {
  admin: "admin",
  guru: "guru",
  gurubk: "gurubk",
  siswa: "siswa",
  ortu: "ortu",
} as const;

export type Role = keyof typeof ROLE_USERNAMES;
export const ROLES = Object.keys(ROLE_USERNAMES) as Role[];

/**
 * Which viewport project a storageState file belongs to. Two projects
 * means two separate logins per role (auth.setup.ts logs in 10 times, not
 * 5) -- see {@link forRole}'s doc comment for why one saved session can't
 * just be read twice.
 */
export type Variant = "desktop" | "mobile";

export const VIEWPORTS: Record<Variant, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

export function variantForProject(projectName: string): Variant {
  return projectName.startsWith("mobile") ? "mobile" : "desktop";
}

const AUTH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth");

/** Where auth.setup.ts saves (and every other spec reads) `role`'s signed-in storageState for `variant`. */
export function storageStatePath(role: Role, variant: Variant): string {
  return path.join(AUTH_DIR, `${variant}-${role}.json`);
}

function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.stack ?? error.message);
  });
  return errors;
}

/**
 * `page` extended to fail the test on any uncaught error the app throws
 * while it runs (brief: "no uncaught page errors" on every visited page).
 * Used directly by auth.setup.ts and logout.spec.ts, which each want an
 * ordinary fresh context per test (a real UI login, once, with nothing to
 * reuse afterwards).
 */
export const test = base.extend<{ page: Page }>({
  // The fixture-setup callback's second parameter is Playwright's "run the
  // test now" function; it is deliberately not named `use` here, since
  // eslint-plugin-react-hooks mistakes a function named exactly `use`
  // called with one argument for React's `use()` hook.
  page: async ({ page }, runTest) => {
    const errors = trackPageErrors(page);
    await runTest(page);
    expect(errors, `Uncaught page error(s) during the test:\n\n${errors.join("\n\n")}`).toEqual([]);
  },
});

export { expect };

/** Brief: "assert no horizontal overflow (documentElement.scrollWidth <= innerWidth + 1)". */
export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    scrollWidth,
    `horizontal overflow at ${page.url()}: documentElement.scrollWidth=${scrollWidth} > innerWidth=${innerWidth}`,
  ).toBeLessThanOrEqual(innerWidth + 1);
}

/** Waits out the shared `Skeleton` (`.animate-pulse`) loading placeholder before asserting on real content. */
export async function waitForSkeletonsGone(page: Page): Promise<void> {
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
}

async function fillLoginForm(page: Page, username: string): Promise<void> {
  await page.getByLabel("Nama pengguna").fill(username);
  // exact: true -- otherwise this also matches the show/hide-password
  // toggle button's aria-label ("Tampilkan kata sandi"/"Sembunyikan kata
  // sandi"), a substring match Playwright's getByLabel allows by default.
  await page.getByLabel("Kata sandi", { exact: true }).fill(PASSWORD);
  // exact: true -- otherwise this also matches the "Masuk dengan passkey" button.
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
}

/**
 * Produces `{ test, goto }` bound to `role`'s saved session: `test`
 * shares ONE `Page` (and therefore one cookie jar) across every test in
 * the spec file that calls this, and `goto` is what every test should
 * use in place of `page.goto()` for its first navigation.
 *
 * This matters because of how sessions actually work here
 * (lib/session/session-provider.tsx's doc comment, docs/08-security.md
 * section 2): every fresh page load starts with an empty in-memory access
 * token and calls `POST /v1/auth/refresh` using the httpOnly refresh
 * cookie to bootstrap one -- and that endpoint *rotates* the refresh
 * token, treating reuse of an already-rotated one as theft and revoking
 * the *whole session family* (every other session that same login opened
 * too), not just the one refresh call
 * (apps/api/internal/modules/identity/service/auth.go `refresh`,
 * `RefreshReuseDetected` -> `RevokeSessionFamily`). Two things follow:
 *
 * 1. Playwright's default `page`/`context` fixtures create a brand new
 *    context **per test**, each one reading the exact same static
 *    storageState file straight off disk: the first test in a file
 *    rotates the token in its own short-lived context and throws the
 *    update away when that context closes, so the second test's fresh
 *    context presents the now-stale refresh token and gets bounced to
 *    /login. A single worker-scoped `BrowserContext` (and, inside it, one
 *    shared `Page` reused across tests rather than a fresh one per test)
 *    fixes this -- the rotation happens in a cookie jar that stays alive
 *    and keeps being reused, so it stays valid, and a real browser
 *    navigation cancels the previous document's in-flight requests
 *    before the next one starts.
 * 2. Even so, this app fires a refresh on *every single navigation*
 *    (never just once per session), which in a suite doing this many
 *    navigations back to back, some of it running alongside five other
 *    roles' worth of navigations hammering the same dev server, leaves
 *    real room for a reuse false-positive against a family that is, from
 *    this test's own point of view, doing nothing wrong (observed: a
 *    role's tests pass for a while, then every one of them from some
 *    point on lands on /login with no code change in between). Rather
 *    than chase that race to the bottom, `goto` below treats "ended up on
 *    /login" as recoverable: it logs back in on the very same page and
 *    retries the navigation once. This is a test-robustness measure, not
 *    a claim that landing on /login there is expected -- if it fires
 *    often, that reuse-detection false-positive is worth its own bug
 *    report against the API, not just papering over here.
 *
 * The corollary of (1): a role's storageState file may be read this way
 * *once*. Both viewport projects need their own copy, hence `Variant` and
 * `storageStatePath` taking one -- reading the very same file from two
 * concurrently-running projects would race the exact same rotation.
 */
export function forRole(role: Role) {
  const roleTest = base.extend<{ page: Page }, { roleContext: BrowserContext; rolePage: Page }>({
    roleContext: [
      async ({ browser }, runTest, workerInfo) => {
        const variant = variantForProject(workerInfo.project.name);
        // browser.newContext() here bypasses the project's `use` block
        // entirely (unlike the built-in page/context fixtures), so
        // baseURL is carried over explicitly -- otherwise every
        // page.goto("/relative/path") in a role spec would fail.
        const context = await browser.newContext({
          baseURL: workerInfo.project.use.baseURL,
          storageState: storageStatePath(role, variant),
          viewport: VIEWPORTS[variant],
        });
        await runTest(context);
        await context.close();
      },
      { scope: "worker" },
    ],
    rolePage: [
      async ({ roleContext }, runTest) => {
        const page = await roleContext.newPage();
        await runTest(page);
        await page.close();
      },
      { scope: "worker" },
    ],
    // Test-scoped only in the sense that error tracking and the
    // failure screenshot are scoped to one test; the underlying `Page`
    // object (and its cookie jar / in-flight requests) is the same
    // `rolePage` for the whole file -- see the doc comment above.
    page: async ({ rolePage }, runTest, testInfo) => {
      const errors: string[] = [];
      const onError = (error: Error) => errors.push(error.stack ?? error.message);
      rolePage.on("pageerror", onError);
      await runTest(rolePage);
      rolePage.off("pageerror", onError);
      if (testInfo.status !== "passed" && testInfo.status !== "skipped") {
        // The built-in page fixture's auto-screenshot-on-failure doesn't
        // apply to a manually created page; replicate it here so a
        // failing role spec still leaves a screenshot behind.
        await rolePage
          .screenshot({ path: testInfo.outputPath("failure.png") })
          .then((body) => testInfo.attach("screenshot", { body, contentType: "image/png" }))
          .catch(() => {
            // Best-effort only -- the page may already be mid-navigation.
          });
      }
      expect(errors, `Uncaught page error(s) during the test:\n\n${errors.join("\n\n")}`).toEqual(
        [],
      );
    },
  });

  /**
   * `page.goto()`, self-healing once against the reuse-detection race
   * described above: if the navigation lands on /login instead of
   * `path`, logs back in as `role` on this same page and navigates again.
   */
  async function goto(page: Page, path: string): Promise<void> {
    await page.goto(path);
    // A dead session does not redirect to /login synchronously:
    // RouteGuard renders a skeleton, waits for its own `/v1/me` + refresh
    // round trip, and only then client-side `router.replace()`s to
    // /login. Checking the URL immediately after `page.goto()` resolves
    // (which happens once the *initial* document load settles, well
    // before that redirect) would almost always see the original `path`
    // even when a redirect is about to happen -- so this waits for the
    // network to go quiet first, giving that round trip a chance to
    // finish and the redirect (if any) to actually happen.
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {
      // Timing out just means the page kept some connection open (e.g. the
      // notifications websocket) -- not itself a sign anything is wrong.
    });
    if (!page.url().includes("/login")) return;

    await fillLoginForm(page, ROLE_USERNAMES[role]);
    await page.waitForURL("**/dashboard", { timeout: 15_000 }).catch(() => {
      // Falls through to the goto below regardless; its own assertions
      // will fail with a clear "page never loaded" error if this didn't
      // actually recover the session.
    });
    await page.goto(path);
  }

  return { test: roleTest, goto };
}

export type RoleBinding = ReturnType<typeof forRole>;

/**
 * Registers the two flows every role shares: the dashboard, and a short
 * tour of `corePages` (each asserted to render an `<h1>` -- a page the
 * signed-in role cannot open renders `ForbiddenPage` instead, which has no
 * heading at all, so this also doubles as a permission regression check).
 */
export function registerCommonFlow(
  { test: roleTest, goto }: RoleBinding,
  role: Role,
  corePages: readonly string[],
): void {
  roleTest(`${role}: dashboard renders without page errors`, async ({ page }) => {
    await goto(page, "/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  roleTest(`${role}: navigates to its core pages`, async ({ page }) => {
    for (const corePage of corePages) {
      await goto(page, corePage);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }
  });
}
