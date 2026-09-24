import { assertNoHorizontalOverflow, expect, forRole, registerCommonFlow } from "../fixtures";

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
  await expect(page.getByRole("heading", { level: 1, name: "Jadwal pelajaran" })).toBeVisible();
  // The seeded student is enrolled in "X-A" (apps/api/cmd/seed/operations.go
  // demoClassName); a student never sees a class picker, only this label.
  await expect(page.getByText("X-A", { exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test('siswa: library shows "Pinjaman saya"', async ({ page }) => {
  await goto(page, "/library/me");
  await expect(page.getByRole("heading", { level: 1, name: "Pinjaman saya" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Sedang dipinjam" })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});
