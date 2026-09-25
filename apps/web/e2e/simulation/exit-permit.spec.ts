import { ACTORS, assertNoNavigation, closeAll, expect, loginAs, test } from "./fixtures";

/**
 * Scenario b) Exit permit chain. The seeded tenant's exit-permit workflow
 * is trimmed (apps/api/cmd/seed/workflow.go) to three duty-scoped stages:
 * picket ("Guru piket", any active teacher) -> counselor ("Guru BK",
 * duty:counselor) -> leadership ("Pimpinan", duty:leadership) -- dropping
 * the product-wide default's "class_teacher" stage, which no duty holder
 * or review screen this product ships actually covers (see that file's
 * comment). Once all three approve, the security gate duty scans the
 * student out.
 *
 * The first stage (picket) never appears in anyone's review queue
 * (apps/api/internal/modules/permits/queries/exit_permits.sql's own
 * comment: "no listing needed there") -- the picket duty teacher instead
 * types the student's shown permit code straight into the "Setujui" tab.
 * The remaining two stages DO list in the queue, since their
 * approver_rule is duty-scoped.
 */
test("exit permit: request -> picket -> counselor -> leadership -> security gate -> exited", async ({
  browser,
}) => {
  const student = await loginAs(browser, ACTORS.student);
  const picket = await loginAs(browser, ACTORS.picket);
  const counselor = await loginAs(browser, ACTORS.counselor);
  const leadership = await loginAs(browser, ACTORS.leadership);
  const security = await loginAs(browser, ACTORS.security);

  try {
    await student.page.goto("/exit-permits");
    await expect(student.page.getByRole("heading", { level: 1 })).toBeVisible();
    await student.page.getByRole("button", { name: "Ajukan izin keluar" }).click();
    const dialog = student.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Tujuan").fill("Simulasi otomatis: ke UKS");

    const createResponse = student.page.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().includes("/v1/exit-permits"),
    );
    await dialog.getByLabel("Dari jam").click();
    await dialog.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Ajukan", exact: true }).click();
    const created = (await (await createResponse).json()) as { instance: { id: string } };
    const permitId = created.instance.id;
    expect(permitId).toBeTruthy();

    await expect(student.page.getByText("Pindai QR Guru piket: masukkan kode")).toBeVisible({
      timeout: 20_000,
    });

    // Stage 1: picket. Never listed in a queue -- typed directly.
    await picket.page.goto("/exit-permits?tab=approve");
    await picket.page.getByLabel("Kode izin siswa").fill(permitId);
    await picket.page.getByRole("button", { name: "Tampilkan QR persetujuan" }).click();
    const picketCode = await picket.page.locator("code").last().textContent();
    expect(picketCode).toBeTruthy();

    await assertNoNavigation(student.page, async () => {
      const field = student.page.getByLabel("Pindai QR Guru piket: masukkan kode");
      await field.fill((picketCode ?? "").trim());
      await student.page.getByRole("button", { name: "Kirim kode" }).click();
      await expect(student.page.getByText("Pindai QR Guru BK: masukkan kode")).toBeVisible({
        timeout: 20_000,
      });
    });

    // Stage 2: counselor. Listed in the shared queue -- "Proses" mints the
    // stage token automatically.
    await counselor.page.goto("/exit-permits");
    await assertNoNavigation(counselor.page, async () => {
      await expect(counselor.page.getByText("Siswa Contoh")).toBeVisible({ timeout: 20_000 });
    });
    await counselor.page.getByRole("button", { name: "Proses" }).click();
    const counselorCode = await counselor.page.locator("code").last().textContent();
    expect(counselorCode).toBeTruthy();

    await assertNoNavigation(student.page, async () => {
      const field = student.page.getByLabel("Pindai QR Guru BK: masukkan kode");
      await field.fill((counselorCode ?? "").trim());
      await student.page.getByRole("button", { name: "Kirim kode" }).click();
      await expect(student.page.getByText("Pindai QR Pimpinan: masukkan kode")).toBeVisible({
        timeout: 20_000,
      });
    });

    // Stage 3: leadership. Same shared-queue pattern as counselor.
    await leadership.page.goto("/exit-permits");
    await assertNoNavigation(leadership.page, async () => {
      await expect(leadership.page.getByText("Siswa Contoh")).toBeVisible({ timeout: 20_000 });
    });
    await leadership.page.getByRole("button", { name: "Proses" }).click();
    const leadershipCode = await leadership.page.locator("code").last().textContent();
    expect(leadershipCode).toBeTruthy();

    await assertNoNavigation(student.page, async () => {
      const field = student.page.getByLabel("Pindai QR Pimpinan: masukkan kode");
      await field.fill((leadershipCode ?? "").trim());
      await student.page.getByRole("button", { name: "Kirim kode" }).click();
      await expect(student.page.getByRole("button", { name: "Tampilkan QR gerbang" })).toBeVisible({
        timeout: 20_000,
      });
    });

    // The security gate's queue picks the now-fully-approved permit up
    // live, before any gate scan has happened.
    await security.page.goto("/exit-permits");
    await assertNoNavigation(security.page, async () => {
      await expect(security.page.getByText("Menunggu pindai gerbang")).toBeVisible({
        timeout: 20_000,
      });
    });

    // The student shows the gate QR; the visible code text under it is the
    // raw token only (packages/ui/src/components/qr-panel.tsx), so the
    // gate's manual-entry fallback (which needs the instance id too, since
    // it has no other way to resolve it -- GatePanel's onScan) is built
    // from the token plus the permit id already captured above, exactly
    // the "sion:<kind>:<instanceId>:<token>" shape the QR itself encodes
    // (apps/web/features/permits/api.ts's encodeScanPayload).
    await student.page.getByRole("button", { name: "Tampilkan QR gerbang" }).click();
    const gateToken = await student.page.locator("code").last().textContent();
    expect(gateToken).toBeTruthy();
    const gatePayload = `sion:gate:${permitId}:${(gateToken ?? "").trim()}`;

    await security.page.getByRole("tab", { name: "Gerbang" }).click();
    await security.page.getByLabel("Kode QR gerbang").fill(gatePayload);
    await security.page.getByRole("button", { name: "Kirim kode" }).click();
    await expect(security.page.getByText("Siswa diizinkan keluar")).toBeVisible({
      timeout: 20_000,
    });

    await assertNoNavigation(student.page, async () => {
      await expect(student.page.getByText("Sudah keluar gerbang")).toBeVisible({
        timeout: 20_000,
      });
    });
  } finally {
    await closeAll(student, picket, counselor, leadership, security);
  }
});
