import { ACTORS, assertNoNavigation, closeAll, expect, loginAs, test } from "./fixtures";

/**
 * Scenario e) Library: a student reserves a title that has zero available
 * copies (cmd/seed/library.go leaves "Sapiens: Riwayat Singkat Umat
 * Manusia" fully checked out for exactly this), and the librarian's
 * already-open member-detail page (the live-updating "desk" screen --
 * apps/web/features/library/components/member-detail-view.tsx's
 * reservations tab, wired via useMemberReservationsQuery /
 * useMemberReservationsLive) picks the new reservation up live. The
 * generic /library dashboard has no reservation-related field at all
 * (its OpenAPI schema has no such property), so it is not usable for
 * this scenario. Uses "siswa2" (not "siswa", which scenarios a/b/d use)
 * so a stray in-progress permit on "siswa" never affects library data,
 * and because "siswa2" is the library member cmd/seed registers
 * specifically for this scenario.
 *
 * Asserts one more reservation row than the member page showed before the
 * student reserved (the "Pesanan" tab), not an absent-then-present check
 * on the title: a rerun finds a prior run's reservation still on file
 * (Reserve has no "already reserved" guard) and adds a second row.
 */
test("library: student reserves -> librarian member page live", async ({ browser }) => {
  const librarian = await loginAs(browser, ACTORS.librarian);
  const student2 = await loginAs(browser, ACTORS.student2);

  try {
    await librarian.page.goto("/library/members");
    await expect(librarian.page.getByRole("heading", { level: 1 })).toBeVisible();
    await librarian.page.getByPlaceholder("Cari nama atau nomor anggota").fill("Siswa Dua Contoh");
    // The search box's onGlobalFilterChange is debounced 300ms
    // (packages/ui/src/components/data-table/data-table.tsx) before the
    // server-backed query it drives even fires; wait for the result to
    // actually narrow to the one match instead of racing that debounce.
    // The member's name is the link to their page (header row + one match).
    await expect(librarian.page.getByRole("table").getByRole("row")).toHaveCount(2, {
      timeout: 20_000,
    });
    const detailLink = librarian.page.getByRole("link", { name: "Siswa Dua Contoh", exact: true });
    await expect(detailLink).toHaveCount(1);
    // The member page's reservations, read once they have loaded: until
    // then the tab shows the empty state, which would read as zero.
    const loadedReservations = librarian.page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        /\/v1\/library\/members\/[^/]+\/reservations/.test(res.url()),
    );
    await detailLink.click();
    await librarian.page.waitForURL(/\/library\/members\/[^/?]+/);
    await expect(
      librarian.page.getByRole("heading", { level: 1, name: "Siswa Dua Contoh" }),
    ).toBeVisible();
    const held = ((await (await loadedReservations).json()) as { data: unknown[] }).data.length;
    // The member page keeps its reservations under the "Pesanan" tab, which
    // carries their count once there are any ("Pesanan 2").
    await librarian.page.getByRole("tab", { name: /^Pesanan/ }).click();
    const reservations = librarian.page.getByRole("tabpanel", { name: /^Pesanan/ });
    await expect(reservations).toBeVisible();
    const rows = reservations.getByRole("listitem");
    await expect(rows).toHaveCount(held);

    await student2.page.goto("/library/me");
    await expect(student2.page.getByRole("heading", { level: 1 })).toBeVisible();
    // The title is picked from a search combobox under "Pesan judul".
    await student2.page.getByLabel("Pesan judul").click();
    await student2.page.getByPlaceholder("Cari judul atau penulis").fill("Sapiens");
    await student2.page
      .getByRole("option", { name: /Sapiens/ })
      .first()
      .click();
    await student2.page.getByRole("button", { name: "Pesan", exact: true }).click();
    await expect(student2.page.getByText("Pesanan dibuat")).toBeVisible({ timeout: 20_000 });

    // One more row than before, live: Reserve has no "already reserved"
    // guard (this file's own doc comment), so a rerun that finds a prior
    // run's reservation for the same title adds a second row for it.
    await assertNoNavigation(librarian.page, async () => {
      await expect(rows).toHaveCount(held + 1, { timeout: 20_000 });
      await expect(rows.filter({ hasText: /Sapiens/ }).first()).toBeVisible();
    });
  } finally {
    await closeAll(librarian, student2);
  }
});
