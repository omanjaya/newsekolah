import { ACTORS, assertNoNavigation, closeAll, expect, loginAs, test } from "./fixtures";

/**
 * Scenario c) Attendance: the homeroom teacher saves today's attendance
 * session for X-A, and the principal's already-open dashboard shows the
 * "classes currently in session" progress figure update live
 * (apps/web/features/dashboard/components/admin-dashboard-panel.tsx's
 * "Presensi kelas berjalan" line, wired to `attendance.submitted` ->
 * `role:principal`/`role:admin`).
 *
 * cmd/seed gives X-A one schedule block spanning every lesson period of
 * the day, every day of the week (apps/api/cmd/seed/operations.go), so
 * exactly one class is always "in session" here regardless of when this
 * spec runs -- the dashboard figure settles at "1 dari 1 kelas sudah
 * presensi" once saved, which is what this spec waits for rather than a
 * before/after delta: re-running the suite the same day re-opens the same
 * (already submitted) session in correction mode, and a correction save
 * publishes the same event, so the assertion holds either way.
 */
test("attendance: teacher saves -> principal dashboard progress live", async ({ browser }) => {
  const principal = await loginAs(browser, ACTORS.principal);
  const homeroom = await loginAs(browser, ACTORS.homeroom);

  try {
    await principal.page.goto("/dashboard");
    await expect(principal.page.getByText("Presensi kelas berjalan")).toBeVisible({
      timeout: 20_000,
    });

    await homeroom.page.goto("/attendance");
    await expect(homeroom.page.getByRole("heading", { level: 1, name: "Presensi" })).toBeVisible();
    const openSession = homeroom.page.getByRole("button", { name: /Isi presensi|Buka/ }).first();
    await expect(openSession).toBeVisible({ timeout: 20_000 });
    await openSession.click();
    await homeroom.page.waitForURL(/\/attendance\/[^/?]+/);
    await expect(homeroom.page.getByRole("radiogroup").first()).toBeVisible({ timeout: 20_000 });

    const saveButton = homeroom.page.getByRole("button", {
      name: /Simpan presensi|Simpan koreksi/,
    });
    if ((await saveButton.textContent())?.includes("koreksi")) {
      await homeroom.page.getByLabel("Alasan koreksi (wajib)").fill("Simulasi otomatis");
    }
    await saveButton.click();
    await expect(homeroom.page.getByText(/Presensi tersimpan pukul/)).toBeVisible({
      timeout: 20_000,
    });

    await assertNoNavigation(principal.page, async () => {
      await expect(principal.page.getByText("1 dari 1 kelas sudah presensi")).toBeVisible({
        timeout: 20_000,
      });
    });
  } finally {
    await closeAll(principal, homeroom);
  }
});
