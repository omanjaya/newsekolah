import { expect, test } from "@playwright/test";

import { buildMe, mockBranding, mockSession } from "./fixtures";

test("a must_change_password account is forced to /change-password before reaching the dashboard", async ({
  page,
}) => {
  await mockBranding(page);
  const session = mockSession(page, null);
  await session.install();

  const forcedMe = buildMe({ must_change_password: true });
  await page.route("**/v1/auth/login", (route) => {
    session.set(forcedMe);
    return route.fulfill({
      json: {
        token_type: "Bearer",
        access_token: "e2e-access-token",
        access_expires_at: new Date(Date.now() + 900_000).toISOString(),
        user: forcedMe,
      },
    });
  });

  await page.goto("/login");
  await page.getByLabel("Nama pengguna").fill("guru01");
  await page.getByLabel("Kata sandi").fill("kata-sandi-sementara");
  await page.getByRole("button", { name: "Masuk" }).click();

  // RouteGuard redirects any (app) page to /change-password while the flag is set.
  await expect(page).toHaveURL("/change-password");
  await expect(page.getByText("Ubah kata sandi sebelum melanjutkan")).toBeVisible();

  await page.route("**/v1/me/password", (route) => {
    session.set(buildMe({ must_change_password: false }));
    return route.fulfill({ status: 204, body: "" });
  });

  await page.getByLabel("Kata sandi saat ini").fill("kata-sandi-sementara");
  // exact: "Kata sandi baru" is otherwise a substring match of "Konfirmasi kata sandi baru" below.
  await page.getByLabel("Kata sandi baru", { exact: true }).fill("kata-sandi-baru-aman");
  await page.getByLabel("Konfirmasi kata sandi baru").fill("kata-sandi-baru-aman");
  await page.getByRole("button", { name: "Ubah kata sandi" }).click();

  await expect(page).toHaveURL("/dashboard");
});
