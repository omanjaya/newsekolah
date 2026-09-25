import { ACTORS, assertNoNavigation, closeAll, expect, loginAs, test } from "./fixtures";

/**
 * Scenario e) Library: a student reserves a title that has zero available
 * copies (cmd/seed/library.go leaves "Sapiens: Riwayat Singkat Umat
 * Manusia" fully checked out for exactly this), and the librarian's
 * already-open member-detail page (the live-updating "desk" screen --
 * apps/web/features/library/components/member-detail-view.tsx's
 * reservations section, wired via useMemberReservationsQuery /
 * useMemberReservationsLive) picks the new reservation up live. The
 * generic /library dashboard has no reservation-related field at all
 * (its OpenAPI schema has no such property), so it is not usable for
 * this scenario. Uses "siswa2" (not "siswa", which scenarios a/b/d use)
 * so a stray in-progress permit on "siswa" never affects library data,
 * and because "siswa2" is the library member cmd/seed registers
 * specifically for this scenario.
 *
 * Asserts the settled state after reserving (the "Reservasi" section with
 * the title visible), not a strict absent-then-present delta: a rerun
 * that finds a prior run's reservation still on file (Reserve has no
 * "already reserved" guard) would otherwise make an "absent beforehand"
 * precondition false without anything being wrong.
 */
test("library: student reserves -> librarian member page live", async ({ browser }) => {
  const librarian = await loginAs(browser, ACTORS.librarian);
  const student2 = await loginAs(browser, ACTORS.student2);

  try {
    await librarian.page.goto("/library/members");
    await expect(librarian.page.getByRole("heading", { level: 1 })).toBeVisible();
    await librarian.page.getByPlaceholder("Cari nama atau nomor anggota").fill("Siswa Dua Contoh");
    await librarian.page.getByRole("link", { name: "Lihat detail" }).click();
    await librarian.page.waitForURL(/\/library\/members\/[^/?]+/);
    await expect(librarian.page.getByRole("heading", { level: 1 })).toBeVisible();

    await student2.page.goto("/library/me");
    await expect(student2.page.getByRole("heading", { level: 1 })).toBeVisible();
    await student2.page.getByPlaceholder("Cari judul atau penulis").fill("Sapiens");
    await student2.page.getByRole("option").first().click();
    await student2.page.getByRole("button", { name: "Pesan", exact: true }).click();
    await expect(student2.page.getByText("Reservasi dibuat")).toBeVisible({ timeout: 20_000 });

    await assertNoNavigation(librarian.page, async () => {
      await expect(librarian.page.getByRole("heading", { name: "Reservasi" })).toBeVisible({
        timeout: 20_000,
      });
    });
    await expect(librarian.page.getByText("Sapiens")).toBeVisible();
  } finally {
    await closeAll(librarian, student2);
  }
});
