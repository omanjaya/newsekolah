import {
  assertNoHorizontalOverflow,
  expect,
  expectAreaPage,
  forRole,
  registerCommonFlow,
} from "../fixtures";

const { test, goto } = forRole("siswa");
registerCommonFlow({ test, goto }, "siswa", ["/my-grades", "/schedule", "/library/me"]);

test("siswa: my grades page loads", async ({ page }) => {
  await goto(page, "/my-grades");
  // Title is "Nilai {term}" -- the term label is dynamic.
  await expect(page.getByRole("heading", { level: 1, name: /^Nilai/ })).toBeVisible({
    timeout: 15_000,
  });
  await assertNoHorizontalOverflow(page);
});

test("siswa: schedule shows their own class", async ({ page }) => {
  await goto(page, "/schedule");
  await expectAreaPage(page, "Jadwal dan kalender", "Jadwal");
  // The seeded student is enrolled in "X-A" (apps/api/cmd/seed/operations.go
  // demoClassName); a student never sees a class picker, only the class in
  // the page's description line, before the school year ("X-A · 2026/2027",
  // features/schedule/components/use-schedule-header.tsx).
  await expect(page.getByText(/^X-A · \d{4}\/\d{4}$/)).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test('siswa: library shows "Pinjaman buku"', async ({ page }) => {
  await goto(page, "/library/me");
  await expect(page.getByRole("heading", { level: 1, name: "Pinjaman buku" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Sedang dipinjam" })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});
