import { expect, test } from "@playwright/test";

import { branding, buildMe, mockBranding, mockSession } from "./fixtures";

test("login success redirects to the dashboard", async ({ page }) => {
  await mockBranding(page);
  const session = mockSession(page, null);
  await session.install();

  const me = buildMe();
  await page.route("**/v1/auth/login", (route) => {
    session.set(me);
    return route.fulfill({
      json: {
        token_type: "Bearer",
        access_token: "e2e-access-token",
        access_expires_at: new Date(Date.now() + 900_000).toISOString(),
        user: me,
      },
    });
  });

  await page.goto("/login");
  await expect(page.getByText(branding.name)).toBeVisible();

  await page.getByLabel("Nama pengguna").fill("guru01");
  await page.getByLabel("Kata sandi").fill("kata-sandi-benar");
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByText(`Selamat datang, ${me.name}`)).toBeVisible();
});

test("login with an invalid password shows the server's error message", async ({ page }) => {
  await mockBranding(page);
  const session = mockSession(page, null);
  await session.install();

  await page.route("**/v1/auth/login", (route) =>
    route.fulfill({
      status: 401,
      json: {
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "Nama pengguna atau kata sandi salah",
        },
      },
    }),
  );

  await page.goto("/login");
  await page.getByLabel("Nama pengguna").fill("guru01");
  await page.getByLabel("Kata sandi").fill("kata-sandi-salah");
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page.getByText("Nama pengguna atau kata sandi salah")).toBeVisible();
  // The failed attempt never navigates away from the login form.
  await expect(page).toHaveURL(/\/login/);
});
