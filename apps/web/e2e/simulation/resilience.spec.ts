import { ACTORS, assertNoNavigation, closeAll, expect, loginAs, test } from "./fixtures";

/**
 * Scenario f) Resilience: the homeroom teacher's queue is open and goes
 * offline; a student submits a leave request while it is down; once back
 * online, the queue must catch up via the reconnect resync (`useLiveInvalidate`'s
 * "every reconnect resync invalidates queryKeys unconditionally" --
 * apps/web/lib/realtime/use-live-invalidate.ts), not a page reload, and
 * the connection-status pill (apps/web/lib/realtime/
 * connection-status-indicator.tsx) must have shown and then hidden itself
 * around the outage.
 *
 * Uses "siswa2" (not "siswa", which scenario a's leave request already
 * uses) so the two specs' leave_request instances never collide on
 * permits' one-in-progress-per-kind-per-student rule, and drives this one
 * to completion too (via gurubk issuing the letter) so a rerun starts
 * clean.
 */
test("resilience: homeroom offline -> student submits -> resync on reconnect", async ({
  browser,
}) => {
  const homeroom = await loginAs(browser, ACTORS.homeroom);
  const student2 = await loginAs(browser, ACTORS.student2);
  const counselor = await loginAs(browser, ACTORS.counselor);

  try {
    await homeroom.page.goto("/leave-requests");
    await expect(homeroom.page.getByRole("heading", { level: 1 })).toBeVisible();

    await homeroom.context.setOffline(true);

    await student2.page.goto("/leave-requests");
    await expect(student2.page.getByRole("heading", { level: 1 })).toBeVisible();
    await student2.page.getByRole("button", { name: "Ajukan izin" }).click();
    const dialog = student2.page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const today = new Date().toISOString().slice(0, 10);
    await dialog.getByLabel("Mulai").fill(today);
    await dialog.getByLabel("Sampai").fill(today);
    await dialog.getByLabel("Keterangan").fill("Simulasi otomatis: uji ketahanan koneksi");

    const submitResponse = student2.page.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().includes("/v1/leave-requests"),
    );
    await dialog.getByRole("button", { name: "Kirim pengajuan" }).click();
    const body = (await (await submitResponse).json()) as { instance: { id: string } };
    const instanceId = body.instance.id;
    expect(instanceId).toBeTruthy();

    // The connection-status pill only appears once the outage has stayed
    // down for SUSTAINED_DISCONNECT_MS (8s), so this needs real headroom.
    const connectionStatus = homeroom.page.getByRole("status").filter({
      hasText: "Menyambungkan kembali pembaruan langsung",
    });
    await expect(connectionStatus).toBeVisible({ timeout: 15_000 });

    await homeroom.context.setOffline(false);

    // It hides itself again once the socket is back, and the queue
    // catches up on its own resync -- no reload of homeroom's page at all.
    await expect(connectionStatus).toBeHidden({ timeout: 15_000 });
    await assertNoNavigation(homeroom.page, async () => {
      await expect(homeroom.page.getByText("Siswa Dua Contoh")).toBeVisible({ timeout: 20_000 });
    });

    await homeroom.page.getByRole("button", { name: "Setujui" }).click();
    await expect(homeroom.page.getByText("Belum ada pengajuan menunggu")).toBeVisible({
      timeout: 20_000,
    });

    await counselor.page.goto(`/leave-requests/${instanceId}`);
    await counselor.page.getByRole("button", { name: "Terbitkan surat" }).click();
    await expect(counselor.page.getByText("Surat izin sudah terbit")).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await homeroom.context.setOffline(false).catch(() => {
      // Best-effort: closing an offline context is fine either way.
    });
    await closeAll(homeroom, student2, counselor);
  }
});
