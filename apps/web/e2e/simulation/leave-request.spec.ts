import { ACTORS, assertNoNavigation, closeAll, expect, loginAs, test } from "./fixtures";

/**
 * Scenario a) Leave request: student submits, the homeroom teacher's
 * queue shows it live, homeroom approves, the student's own screen
 * updates live. Uses "siswa" (not "siswa2", which scenario f's resilience
 * test reserves) -- see fixtures.ts.
 *
 * Also drives the request through to completion (the counselor issues the
 * letter) so it does not stay "in_progress" forever: permits allows only
 * one in-progress leave request per student, so leaving this one
 * unfinished would block "siswa" on every future run of this suite.
 */
test("leave request: submit -> homeroom queue live -> approve -> student status live", async ({
  browser,
}) => {
  const student = await loginAs(browser, ACTORS.student);
  const homeroom = await loginAs(browser, ACTORS.homeroom);
  const counselor = await loginAs(browser, ACTORS.counselor);

  try {
    // Homeroom opens the review queue first, before the student submits --
    // the whole point is to watch it update without a reload.
    await homeroom.page.goto("/leave-requests");
    await expect(homeroom.page.getByRole("heading", { level: 1 })).toBeVisible();

    await student.page.goto("/leave-requests");
    await expect(student.page.getByRole("heading", { level: 1 })).toBeVisible();
    await student.page.getByRole("button", { name: "Ajukan izin" }).click();
    const dialog = student.page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const today = new Date().toISOString().slice(0, 10);
    await dialog.getByLabel("Mulai").fill(today);
    await dialog.getByLabel("Sampai").fill(today);
    await dialog
      .getByLabel("Keterangan")
      .fill("Simulasi otomatis: izin sakit ringan (school-day simulation)");

    const submitResponse = student.page.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().includes("/v1/leave-requests"),
    );
    await dialog.getByRole("button", { name: "Kirim pengajuan" }).click();
    const body = (await (await submitResponse).json()) as { instance: { id: string } };
    const instanceId = body.instance.id;
    expect(instanceId).toBeTruthy();

    // The detail dialog re-opens on the new request; its stepper shows the
    // first stage ("Wali kelas") is what it is waiting on.
    await expect(student.page.getByText("Menunggu: Wali kelas")).toBeVisible({ timeout: 20_000 });

    // Homeroom's already-open queue picks the new request up live.
    await assertNoNavigation(homeroom.page, async () => {
      await expect(homeroom.page.getByText("Siswa Contoh")).toBeVisible({ timeout: 20_000 });
    });
    await homeroom.page.getByRole("button", { name: "Setujui" }).click();
    await expect(homeroom.page.getByText("Belum ada pengajuan menunggu")).toBeVisible({
      timeout: 20_000,
    });

    // The student's still-open detail dialog moves to the next stage live,
    // with no navigation on their page at all.
    await assertNoNavigation(student.page, async () => {
      await expect(student.page.getByText("Menunggu: Guru BK")).toBeVisible({ timeout: 20_000 });
    });

    // Drive it to completion so a re-run of this spec does not collide
    // with "siswa" already having an in-progress leave request.
    await counselor.page.goto(`/leave-requests/${instanceId}`);
    await counselor.page.getByRole("button", { name: "Terbitkan surat" }).click();
    await expect(counselor.page.getByText("Surat izin sudah terbit")).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await closeAll(student, homeroom, counselor);
  }
});
