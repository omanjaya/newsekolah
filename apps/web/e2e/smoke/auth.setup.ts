import type { Page } from "@playwright/test";

import {
  PASSWORD,
  ROLES,
  ROLE_USERNAMES,
  VIEWPORTS,
  expect,
  storageStatePath,
  test,
  type Variant,
} from "./fixtures";

/**
 * One real UI login per role PER VIEWPORT VARIANT, saved as storageState
 * for every other smoke spec to reuse (brief: "log in once per role in a
 * setup project and reuse storageState -- the API rate-limits logins per
 * account and IP"). Two variants (not one) because the desktop and mobile
 * projects each need their own copy of a role's session: see forRole()'s
 * doc comment in fixtures.ts for why reading the exact same saved session
 * from two independently-running projects would corrupt it (the API
 * rotates refresh tokens on every use and treats reuse as theft). Ten
 * logins total, well inside the 5-per-15-minutes-per-account limit since
 * each account only gets two.
 *
 * This is the ONLY place that logs in via the UI besides logout.spec.ts
 * (which needs a session it can safely revoke -- see the comment there).
 */

const VARIANTS: readonly Variant[] = ["desktop", "mobile"];

async function warmServer(page: Page): Promise<void> {
  // A cold Next dev server compiling /login and /dashboard for the first
  // time can be slow enough that the very first real login bounces back
  // to /login before the client finishes hydrating (see the task brief).
  // Requesting both routes once first pays that cost here instead.
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" }).catch(() => {
    // Anonymous /dashboard redirects to /login -- that's the point, it
    // still compiles the route. Any navigation error here is ignored.
  });
}

async function attemptLogin(page: Page, username: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Nama pengguna").fill(username);
  // exact: true -- otherwise this also matches the show/hide-password
  // toggle button's aria-label ("Tampilkan kata sandi"/"Sembunyikan kata
  // sandi"), a substring match Playwright's getByLabel allows by default.
  await page.getByLabel("Kata sandi", { exact: true }).fill(PASSWORD);
  // exact: true -- otherwise this also matches the "Masuk dengan passkey" button.
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
}

/**
 * True once the session visibly sticks -- not just once the URL says
 * /dashboard, since the cold-start race described in the brief can bounce
 * back to /login a moment after landing there.
 */
async function landedOnDashboard(page: Page): Promise<boolean> {
  try {
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1_000);
    return page.url().includes("/dashboard");
  } catch {
    return false;
  }
}

for (const role of ROLES) {
  for (const variant of VARIANTS) {
    test(`authenticate as ${role} (${variant})`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS[variant]);
      const username = ROLE_USERNAMES[role];
      await warmServer(page);

      await attemptLogin(page, username);
      let ok = await landedOnDashboard(page);
      if (!ok) {
        // Retry once: the cold-start bounce-back to /login the brief warns about.
        await attemptLogin(page, username);
        ok = await landedOnDashboard(page);
      }
      expect(ok, `login as "${username}" (${variant}) never reached a stable /dashboard`).toBe(
        true,
      );

      await page.context().storageState({ path: storageStatePath(role, variant) });
    });
  }
}
