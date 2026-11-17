import {
  assertNoHorizontalOverflow,
  expect,
  expectAreaPage,
  forRole,
  registerCommonFlow,
  waitForSkeletonsGone,
} from "../fixtures";

const { test, goto } = forRole("guru");
registerCommonFlow({ test, goto }, "guru", ["/schedule", "/attendance", "/journal"]);

test("guru: opens today's schedule", async ({ page }) => {
  await goto(page, "/schedule");
  await expectAreaPage(page, "Jadwal dan kalender", "Jadwal");
  await waitForSkeletonsGone(page);
  await assertNoHorizontalOverflow(page);
});

test("guru: opens an attendance session and sees the roster", async ({ page }) => {
  await goto(page, "/attendance");
  await expectAreaPage(page, "Presensi dan jurnal", "Presensi");
  await waitForSkeletonsGone(page);

  // "Isi presensi" opens today's not-yet-saved session, "Lihat presensi" a
  // saved one, "Buka" a submitted one -- either way this only opens the
  // session, it never submits/saves it.
  const openSession = page
    .getByRole("button", { name: /^(Isi presensi|Lihat presensi|Buka)$/ })
    .first();
  await expect(openSession).toBeVisible({ timeout: 20_000 });
  await openSession.click();

  await page.waitForURL(/\/attendance\/[^/?]+/);
  await expect(page.getByRole("radiogroup").first()).toBeVisible({ timeout: 20_000 });
  await assertNoHorizontalOverflow(page);
});

test("guru: opens the journal list and the new-entry form", async ({ page }) => {
  await goto(page, "/journal");
  await expectAreaPage(page, "Presensi dan jurnal", "Jurnal mengajar");

  // .first() -- an empty journal list repeats this same button inside the
  // table's empty-state cell, alongside the header's own copy.
  await page.getByRole("button", { name: "Jurnal baru" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Topik")).toBeVisible();
  await expect(dialog.getByLabel("Kegiatan")).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test("guru: opens the gradebook for an own assignment", async ({ page }) => {
  await goto(page, "/grading");
  await expectAreaPage(page, "Nilai");
  await expect(page.getByRole("tab", { name: "Nilai", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // Not getByRole("table"): below "md" the gradebook renders
  // GradebookMobileCards instead of GradebookDesktopTable
  // (features/grading/components/gradebook-table.tsx), so this must stay
  // viewport-agnostic to pass at both 390x844 and 1280x800. The search
  // box is part of the shared sheet, present in both layouts.
  await expect(page.getByRole("searchbox", { name: "Cari siswa", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await assertNoHorizontalOverflow(page);
});
