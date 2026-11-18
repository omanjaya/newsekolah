import { expect, test } from "@playwright/test";

import { buildMe, expectHome, mockBranding, mockSession } from "./fixtures";

test("logout from the header clears the session and returns to /login", async ({ page }) => {
  await mockBranding(page);
  const me = buildMe();
  const session = mockSession(page, me);
  await session.install();

  await page.route("**/v1/auth/logout", (route) => {
    session.set(null);
    return route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/dashboard");
  await expectHome(page, me.name);

  await page.getByRole("button", { name: "Menu akun", exact: true }).click();
  await page.getByRole("menuitem", { name: "Keluar", exact: true }).click();

  await expect(page).toHaveURL(/\/login/);
});
