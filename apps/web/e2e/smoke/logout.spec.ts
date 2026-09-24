import { PASSWORD, ROLES, ROLE_USERNAMES, expect, test } from "./fixtures";

/**
 * Logout gets its own fresh sign-in per role instead of reusing the
 * shared storageState from auth.setup.ts: logging out revokes the
 * refresh-token cookie server-side, which would break every other smoke
 * spec still relying on that exact same saved session (they all load the
 * same storageState file). See playwright.smoke.config.ts: this file is
 * excluded from the mobile project, so it runs exactly once per full
 * suite run -- logout isn't a layout concern the 390x844 pass would add
 * anything to, and running it twice would burn two more login attempts
 * per account against the API's 5-per-15-minutes-per-account limit.
 */
for (const role of ROLES) {
  test(`${role}: logout returns to /login`, async ({ page }) => {
    const username = ROLE_USERNAMES[role];
    await page.goto("/login");
    await page.getByLabel("Nama pengguna").fill(username);
    // exact: true -- otherwise this also matches the show/hide-password
    // toggle button's aria-label, a substring match getByLabel allows by default.
    await page.getByLabel("Kata sandi", { exact: true }).fill(PASSWORD);
    // exact: true -- otherwise this also matches the "Masuk dengan passkey" button.
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Menu akun" }).click();
    // "Keluar" also matches unrelated text elsewhere on the page (e.g. the
    // "Izin Keluar" nav item); scope to the open account menu's menuitem.
    await page.getByRole("menuitem", { name: "Keluar" }).click();

    await expect(page).toHaveURL(/\/login/);
  });
}
