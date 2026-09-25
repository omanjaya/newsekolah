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
  const [student, homeroom, counselor] = await Promise.all([
    loginAs(browser, ACTORS.student),
    loginAs(browser, ACTORS.homeroom),
    loginAs(browser, ACTORS.counselor),
  ]);

  try {
    // Homeroom opens the review queue first, before the student submits --
    // the whole point is to watch it update without a reload. Waiting for
    // the queue's own settled state (not just the heading) matters here:
    // the realtime subscription to this class's "duty:homeroom:<classID>"
    // topic (features/permits/realtime.ts's useLeaveReviewQueueLive) only
    // subscribes once `me.duties` has loaded, a moment after the page
    // renders -- an event published before that subscribe call lands is
    // simply missed (there is no replay), so the student must not submit
    // until this has had a chance to settle.
    await homeroom.page.goto("/leave-requests");
    // Waits for the query to settle (not specifically an empty queue -- a
    // previous failed run can leave an unrelated item behind) by waiting
    // out the loading skeleton, matching apps/web/e2e/smoke/fixtures.ts's
    // waitForSkeletonsGone.
    await expect(homeroom.page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
    // A small margin past the query settling, for the WS topic subscribe
    // message (fired once `me.duties` resolves) to actually reach the
    // server -- see the comment above.
    await homeroom.page.waitForTimeout(1_000);

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

    // Homeroom's already-open queue picks the new request up live. Scoped
    // to this student's own row (not the whole list, and not assuming the
    // queue becomes fully empty after approving) since an unrelated
    // leftover item from an earlier failed run may still be in it.
    const queueRow = homeroom.page.getByRole("listitem").filter({ hasText: "Siswa Contoh" });
    await assertNoNavigation(homeroom.page, async () => {
      await expect(queueRow).toBeVisible({ timeout: 20_000 });
    });
    await queueRow.getByRole("button", { name: "Setujui" }).click();
    await expect(queueRow).toBeHidden({ timeout: 20_000 });

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
