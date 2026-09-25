import { expect, test as base } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";

import { assertBaseUrlAllowed } from "./guard";

/**
 * Multi-actor "school day" simulation (see playwright.sim.config.ts).
 * Unlike apps/web/e2e/smoke, every scenario here needs SEVERAL actors'
 * browser contexts open AT ONCE inside one test, to prove that one
 * actor's action shows up live on another actor's already-open screen --
 * so, unlike smoke's one-login-per-role setup project, actors are logged
 * in fresh inside each spec (cheap: at most a handful of logins per spec
 * file, well inside the API's per-account rate limit).
 */

export const PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";

/**
 * Deterministic usernames cmd/seed creates in the "sma-contoh" tenant
 * (apps/api/cmd/seed/main.go's systemUsers) for every actor the
 * simulation needs. "siswa" and "siswa2" are both students in the same
 * homeroom class (X-A); which one a spec uses matters because permits
 * allows only one in-progress instance per kind per student -- see each
 * scenario spec's own comment on why it picks the student it does.
 */
export const ACTORS = {
  admin: "admin",
  principal: "kepsek",
  homeroom: "guru",
  picket: "gurupiket",
  counselor: "gurubk",
  leadership: "wakepsek",
  security: "satpam",
  librarian: "pustakawan",
  student: "siswa",
  student2: "siswa2",
} as const;

export type ActorKey = keyof typeof ACTORS;

async function fillLoginForm(page: Page, username: string): Promise<void> {
  await page.getByLabel("Nama pengguna").fill(username);
  // exact: true -- otherwise this also matches the show/hide-password
  // toggle button's aria-label (see apps/web/e2e/smoke/fixtures.ts).
  await page.getByLabel("Kata sandi", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
}

/**
 * Logs `username` in through the real login page on a brand new browser
 * context, and returns the ready-to-use page once /dashboard has
 * actually stuck (mirrors apps/web/e2e/smoke/roles/*.setup.ts's
 * landedOnDashboard: a cold dev server can bounce the very first login
 * back to /login a moment after landing on /dashboard).
 */
export async function loginAs(
  browser: Browser,
  username: string,
  options?: { viewport?: { width: number; height: number } },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: options?.viewport });
  const page = await context.newPage();

  async function attempt(): Promise<boolean> {
    await page.goto("/login");
    await fillLoginForm(page, username);
    try {
      await page.waitForURL("**/dashboard", { timeout: 15_000 });
      await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 10_000 });
      await page.waitForTimeout(1_000);
      return page.url().includes("/dashboard");
    } catch {
      return false;
    }
  }

  let ok = await attempt();
  if (!ok) ok = await attempt();
  if (!ok) {
    throw new Error(`login as "${username}" never reached a stable /dashboard`);
  }
  return { context, page };
}

/** Closes every context in `pages`, best-effort, so a failing assertion earlier does not leak browser processes. */
export async function closeAll(...entries: { context: BrowserContext }[]): Promise<void> {
  await Promise.all(
    entries.map((entry) =>
      entry.context.close().catch(() => {
        // Best-effort: a context that failed to open has nothing to close.
      }),
    ),
  );
}

/**
 * Asserts `page` never navigated away from `expectedUrl` while `action`
 * ran -- the suite's "without page reload" requirement. Compares the
 * live document's identity (a `<html>` attribute stamped once per real
 * navigation) rather than just the URL string, since a client-side
 * router can in principle change the URL without a hard reload and vice
 * versa; what actually matters here is that the same document (and
 * therefore the same in-memory TanStack Query cache/React tree) is still
 * live after `action` finishes.
 */
export async function assertNoNavigation<T>(page: Page, action: () => Promise<T>): Promise<T> {
  const before = await page.evaluate(() => {
    const marker = "data-sim-nav-marker";
    let value = document.documentElement.getAttribute(marker);
    if (!value) {
      value = `${Date.now()}-${Math.random()}`;
      document.documentElement.setAttribute(marker, value);
    }
    return value;
  });
  const result = await action();
  const after = await page.evaluate(() =>
    document.documentElement.getAttribute("data-sim-nav-marker"),
  );
  expect(after, "page navigated (document identity changed) when it should not have").toBe(before);
  return result;
}

export const test = base.extend<{ baseUrlChecked: boolean }>({
  baseUrlChecked: [
    async ({ baseURL }, use) => {
      assertBaseUrlAllowed(baseURL ?? "http://localhost:3000");
      await use(true);
    },
    { auto: true, scope: "test" },
  ],
});

export { expect };
