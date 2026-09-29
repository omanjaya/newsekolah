import { expect, test } from "@playwright/test";

import { branding, buildMe, mockBranding, mockSession } from "./fixtures";

test("superadmin can freeze, advance and reset school time in one browser session", async ({
  page,
}) => {
  const receivedTimes: (string | undefined)[] = [];
  await mockBranding(page);
  await mockSession(
    page,
    buildMe({
      permissions: ["platform_superadmin"],
      tenant: { ...branding, timezone: "Asia/Makassar" },
    }),
  ).install();
  await page.route("**/v1/me/announcements", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/v1/notifications/unread-count", (route) => {
    receivedTimes.push(route.request().headers()["x-simulation-time"]);
    return route.fulfill({ json: { count: 0 } });
  });

  await page.goto("/dashboard");
  const controls = page.getByTestId("simulation-controls");
  await expect(controls).toBeVisible();
  await controls.locator("summary").click();
  await controls.getByLabel("Tanggal sekolah").fill("2026-09-28");
  await controls.getByLabel("Jam sekolah (Asia/Makassar)").fill("06:45");
  await controls.getByRole("button", { name: "Terapkan", exact: true }).click();
  await expect(controls).toContainText("Senin");
  await expect.poll(() => receivedTimes.at(-1)).toBe("2026-09-27T22:45:00.000Z");

  await controls.getByRole("button", { name: "+1 hari", exact: true }).click();
  await expect(controls).toContainText("Selasa");
  await expect.poll(() => receivedTimes.at(-1)).toBe("2026-09-28T22:45:00.000Z");
  await controls.getByRole("button", { name: "+15 menit", exact: true }).click();
  await expect.poll(() => receivedTimes.at(-1)).toBe("2026-09-28T23:00:00.000Z");

  await page.reload();
  await expect(controls).toContainText("Waktu simulasi aktif");
  await expect(controls).toContainText("Selasa");
  await controls.getByRole("button", { name: "Atur ulang", exact: true }).click();
  await expect(controls).not.toContainText("Waktu simulasi aktif");
  await expect.poll(() => receivedTimes.at(-1)).toBeUndefined();
});

test("ordinary accounts do not see simulation controls", async ({ page }) => {
  await mockBranding(page);
  const me = buildMe();
  await mockSession(page, me).install();
  await page.route("**/v1/me/announcements", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/v1/notifications/unread-count", (route) =>
    route.fulfill({ json: { count: 0 } }),
  );
  await page.goto("/dashboard");
  await expect(page.getByText(`Selamat datang, ${me.name}`)).toBeVisible();
  await expect(page.getByTestId("simulation-controls")).toHaveCount(0);
});
