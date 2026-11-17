import type { Locator, Page } from "@playwright/test";

import {
  ACTORS,
  assertNoNavigation,
  closeAll,
  expect,
  loginAs,
  test,
  waitForToastsGone,
} from "./fixtures";

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
 * types the student's shown permit code straight into the approve desk
 * (/exit-permits). The remaining two stages DO list in the reviewer's
 * inbox (/inbox), since their approver_rule is duty-scoped; following one
 * up opens the same desk on that permit. The student scans each stage's
 * QR from a sheet on their own card, which moves on without a reload.
 */
test("exit permit: request -> picket -> counselor -> leadership -> security gate -> exited", async ({
  browser,
}) => {
  // Five actors: logging them in one at a time (each up to ~16s with its
  // own retry) risks the default test timeout before the chain itself
  // even starts, so these run concurrently instead -- independent
  // browser contexts, nothing shared between them.
  test.setTimeout(150_000);
  const [student, picket, counselor, leadership, security] = await Promise.all([
    loginAs(browser, ACTORS.student),
    loginAs(browser, ACTORS.picket),
    loginAs(browser, ACTORS.counselor),
    loginAs(browser, ACTORS.leadership),
    loginAs(browser, ACTORS.security),
  ]);

  try {
    // A permit "siswa" still has on its way (an earlier run that stopped
    // midway) hides the request button and answers the queue checks below
    // before the new permit exists: finish it first.
    await finishOpenExitPermit({ student: student.page, security: security.page });

    await student.page.getByRole("button", { name: "Ajukan izin keluar" }).click();
    const dialog = student.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Tujuan").fill("Simulasi otomatis: ke UKS");

    const createResponse = student.page.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().includes("/v1/exit-permits"),
    );
    // The Select's option listbox renders through a portal, as a sibling
    // of the dialog in the DOM/accessibility tree, not a descendant of it
    // -- scoping an option locator to `dialog` (as the other locators
    // here do) finds nothing. With 11 periods (cmd/seed's Jam 1-11) the
    // open list also overflows a default viewport, and Radix positions it
    // such that Playwright's own `.click()` -- plain, `force: true`, or
    // via a keyboard ArrowDown/Enter that raced the popover's mount and
    // was silently dropped -- never reliably resolves ("element is
    // outside of the viewport", even after scrolling: a real click still
    // needs on-screen coordinates to dispatch a pointer event at).
    // `.evaluate(el => el.click())` dispatches a real DOM click with no
    // such requirement; Radix handles it identically for selection.
    // The `\b` word boundary matters too: getByRole's substring match
    // normalizes whitespace, so a plain "Jam 1" would also match "Jam 10"
    // and "Jam 11".
    await dialog.getByLabel("Dari jam").click();
    await student.page.getByRole("option", { name: /^Jam 1\b/ }).evaluate((el: HTMLElement) => {
      el.click();
    });
    // Picking "Dari jam" (Jam 1) auto-fills "Sampai jam" with the same
    // period (exit-permit-detail.tsx's CreateForm: `if (!endId)
    // setEndId(v)`), but the API requires a real range -- end.Sequence >
    // start.Sequence (exitpermit.go's validatePeriodRange), rejecting an
    // equal start/end with a 400 PERIOD_RANGE_INVALID. Pick a later one
    // explicitly.
    await dialog.getByLabel("Sampai jam").click();
    await student.page.getByRole("option", { name: /^Jam 2\b/ }).evaluate((el: HTMLElement) => {
      el.click();
    });
    await dialog.getByRole("button", { name: "Ajukan", exact: true }).click();
    const created = (await (await createResponse).json()) as { instance: { id: string } };
    const permitId = created.instance.id;
    expect(permitId).toBeTruthy();

    // The student's own card moves to the first stage without a reload,
    // and shows the permit code the picket teacher types in.
    await assertNoNavigation(student.page, async () => {
      await expect(student.page.getByText("Menunggu: Guru piket")).toBeVisible({
        timeout: 20_000,
      });
      await expect(student.page.getByText(permitId, { exact: true })).toBeVisible();
    });

    // Stage 1: picket. Never listed in a queue -- the teacher types the
    // code the student shows into the approve desk.
    await picket.page.goto("/exit-permits");
    await picket.page.getByLabel("Kode izin siswa").fill(permitId);
    await picket.page.getByRole("button", { name: "Tampilkan QR persetujuan" }).click();
    const picketCode = await readQrCode(picket.page, APPROVE_QR);

    await scanStage(student.page, "Guru piket", picketCode, "Menunggu: Guru BK");

    // Stage 2: counselor. Listed in the counselor's inbox; following it up
    // opens the approve desk on this permit, which mints the stage QR.
    const counselorCard = await openInboxPermit(counselor.page, "Berjalan");
    await counselorCard.getByRole("button", { name: "Tindak lanjuti" }).click();
    const counselorCode = await readQrCode(counselor.page.getByRole("dialog"), APPROVE_QR);

    await scanStage(student.page, "Guru BK", counselorCode, "Menunggu: Pimpinan");

    // Stage 3: leadership. Same inbox pattern as the counselor.
    const leadershipCard = await openInboxPermit(leadership.page, "Berjalan");
    await leadershipCard.getByRole("button", { name: "Tindak lanjuti" }).click();
    const leadershipCode = await readQrCode(leadership.page.getByRole("dialog"), APPROVE_QR);

    await assertNoNavigation(student.page, async () => {
      await scanStage(student.page, "Pimpinan", leadershipCode, "Siap keluar gerbang");
      await expect(
        student.page.getByRole("button", { name: "Tampilkan QR gerbang" }),
      ).toBeVisible();
    });

    // The security gate's inbox picks the now fully approved permit up,
    // before any gate scan has happened.
    await openInboxPermit(security.page, "Disetujui");

    // The student shows the gate QR; the visible code text under it is the
    // raw token only (packages/ui/src/components/qr-panel.tsx), so the
    // gate's manual-entry fallback (which needs the instance id too, since
    // it has no other way to resolve it -- GatePanel's onScan) is built
    // from the token plus the permit id already captured above, exactly
    // the "sion:<kind>:<instanceId>:<token>" shape the QR itself encodes
    // (apps/web/features/permits/api.ts's encodeScanPayload).
    await student.page.getByRole("button", { name: "Tampilkan QR gerbang" }).click();
    const gateToken = await readQrCode(student.page, GATE_QR);
    await passGate(security.page, `sion:gate:${permitId}:${gateToken}`);

    // The student's already open card follows the gate scan live.
    await assertNoNavigation(student.page, async () => {
      await expect(student.page.getByText("Sudah keluar", { exact: true })).toBeVisible({
        timeout: 20_000,
      });
    });
  } finally {
    await closeAll(student, picket, counselor, leadership, security);
  }
});

const APPROVE_QR = "Kode QR persetujuan izin keluar";
const GATE_QR = "Kode QR gerbang izin keluar";
const STUDENT_NAME = "Siswa Contoh";
const GATE_TOKEN_PATH = /\/v1\/exit-permits\/([^/]+)\/gate-token/;

/**
 * The code typed under a QR (packages/ui QrPanel), read from the panel the
 * QR's own label names: minting is async, so this waits for that panel
 * instead of reading whatever was on screen the instant after the click.
 */
async function readQrCode(scope: Page | Locator, label: string): Promise<string> {
  const code = scope.locator(
    `[data-slot="qr-panel"]:has([role="img"][aria-label="${label}"]) code`,
  );
  await expect(code).toHaveCount(1, { timeout: 20_000 });
  const text = ((await code.textContent()) ?? "").trim();
  expect(text).not.toBe("");
  return text;
}

/**
 * The student scans an approving teacher's QR for `stage` from the sheet
 * the card opens, typing the code under it (a headless browser has no
 * camera picture to read), and the card moves on to `next` without a
 * reload.
 */
async function scanStage(student: Page, stage: string, code: string, next: string): Promise<void> {
  await assertNoNavigation(student, async () => {
    await waitForToastsGone(student);
    await student.getByRole("button", { name: `Pindai QR ${stage}`, exact: true }).click();
    const sheet = student.getByRole("dialog", { name: `Pindai QR ${stage}` });
    await expect(sheet).toBeVisible();
    await typeScannedCode(sheet, `Pindai QR ${stage}: masukkan kode`, code);
    await expect(sheet).toBeHidden({ timeout: 20_000 });
    await expect(student.getByText(next, { exact: true })).toBeVisible({ timeout: 20_000 });
  });
}

/**
 * A Scanner's typed fallback. Where the browser offers a camera, the field
 * sits behind "Masukkan kode manual"; where it does not, it is open.
 */
async function typeScannedCode(scope: Locator, label: string, code: string): Promise<void> {
  const field = scope.getByLabel(label, { exact: true });
  const toggle = scope.getByRole("button", { name: "Masukkan kode manual" });
  await expect(field.or(toggle).first()).toBeVisible();
  if (await toggle.isVisible()) await toggle.click();
  await field.fill(code);
  await scope.getByRole("button", { name: "Kirim kode" }).click();
}

/** The reviewer's inbox card for this student's exit permit, in `status`. */
async function openInboxPermit(page: Page, status: string): Promise<Locator> {
  await page.goto("/inbox");
  await waitForToastsGone(page);
  const card = page
    .getByRole("listitem")
    .filter({ hasText: STUDENT_NAME })
    .filter({ hasText: "Izin keluar" })
    .filter({ hasText: status });
  await expect(card).toHaveCount(1, { timeout: 20_000 });
  return card;
}

/** Security scans the gate QR at the gate desk (/exit-permits). */
async function passGate(security: Page, payload: string): Promise<void> {
  await security.goto("/exit-permits");
  const desk = security.locator('[data-slot="scanner"]').filter({ hasText: "Pindai QR gerbang" });
  await typeScannedCode(desk, "Kode QR gerbang", payload);
  await expect(desk.getByText("Siswa diizinkan keluar")).toBeVisible({ timeout: 20_000 });
}

/**
 * permits allows one exit permit on its way per student, and the student's
 * page offers no new request while one is. Cancels one still in progress;
 * one already approved goes through the gate, the way the scenario ends
 * its own. Leaves the student on /exit-permits with the request button.
 */
async function finishOpenExitPermit(actors: { student: Page; security: Page }): Promise<void> {
  const { student, security } = actors;
  await student.goto("/exit-permits");
  await expect(student.getByRole("heading", { level: 1, name: "Izin keluar" })).toBeVisible();
  await expect(student.locator('[data-slot="skeleton"], .animate-pulse')).toHaveCount(0, {
    timeout: 20_000,
  });
  const request = student.getByRole("button", { name: "Ajukan izin keluar" });
  if (await request.isVisible()) return;

  const cancel = student.getByRole("button", { name: "Batalkan izin" });
  const gate = student.getByRole("button", { name: "Tampilkan QR gerbang" });
  if (await cancel.isVisible()) {
    await cancel.click();
  } else if (await gate.isVisible()) {
    // An approved card no longer shows the permit code; the gate QR's own
    // request names the permit.
    const minted = student.waitForRequest(
      (req) => req.method() === "POST" && GATE_TOKEN_PATH.test(req.url()),
    );
    await gate.click();
    const permitId = GATE_TOKEN_PATH.exec((await minted).url())?.[1] ?? "";
    expect(permitId).not.toBe("");
    const token = await readQrCode(student, GATE_QR);
    await passGate(security, `sion:gate:${permitId}:${token}`);
    await student.reload();
  }
  await expect(request).toBeVisible({ timeout: 20_000 });
}
