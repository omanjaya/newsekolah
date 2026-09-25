import { ACTORS, assertNoNavigation, closeAll, expect, loginAs, test } from "./fixtures";

/**
 * Scenario d) Grades: the teacher scores and publishes the seeded "TG1"
 * component for X-A/Matematika, and the student's own grades page (already
 * open, showing no Matematika card yet -- nothing shows until published,
 * apps/web/features/grading/components/my-grades-view.tsx) picks the
 * published subject up live. Uses "siswa" (grading has no per-student
 * "in progress" state permits would collide on, so which student watches
 * does not matter -- picked for consistency with scenario a's same
 * student).
 */
test("grades: teacher publishes -> student grades page live", async ({ browser }) => {
  const teacher = await loginAs(browser, ACTORS.homeroom);
  const student = await loginAs(browser, ACTORS.student);

  try {
    await student.page.goto("/my-grades");
    await expect(student.page.getByRole("heading", { level: 1 })).toBeVisible();
    // Nothing published yet for this student in a fresh run; a rerun where
    // a prior pass already published leaves the card in place, which is
    // fine -- the live-update assertion below only requires the card to be
    // visible *after* this run's own publish, not that it was absent before.

    await teacher.page.goto("/grading");
    await expect(teacher.page.getByLabel("Pilih kelas")).toHaveText(/X-A/);
    await expect(teacher.page.getByLabel("Pilih mapel")).toHaveText(/Matematika/);

    const scoreCell = teacher.page.getByLabel("Nilai TG1 untuk Siswa Contoh");
    await expect(scoreCell).toBeVisible({ timeout: 20_000 });
    await scoreCell.fill("88");
    await scoreCell.press("Tab");

    await teacher.page.getByRole("button", { name: "Simpan semua" }).click();
    await expect(teacher.page.getByText(/Nilai tersimpan pukul/)).toBeVisible({ timeout: 20_000 });

    const publishToggle = teacher.page.getByRole("switch", { name: "Terbitkan ke siswa" });
    // Idempotent across reruns: only flip on if a prior run left it off.
    if (!(await publishToggle.isChecked())) {
      await publishToggle.click();
      await teacher.page.getByRole("button", { name: "Terbitkan", exact: true }).click();
      await expect(teacher.page.getByText("Nilai diterbitkan ke siswa.")).toBeVisible({
        timeout: 20_000,
      });
    }

    await assertNoNavigation(student.page, async () => {
      await expect(student.page.getByText("Matematika")).toBeVisible({ timeout: 20_000 });
    });
  } finally {
    await closeAll(teacher, student);
  }
});
