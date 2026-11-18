import { randomUUID } from "node:crypto";

import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";

import {
  ACTORS,
  type ApiSession,
  apiAs,
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
 *
 * The student is the run's own. permits allows one exit permit per student
 * per tenant-local day, counting one that already went through the gate
 * (409 EXIT_PERMIT_ALREADY_TODAY, backed by the unique index
 * ux_workflow_instances_one_exit_permit_per_day), so a seeded student
 * could walk this chain once a day at most. Each run instead enrolls a new
 * student in X-A -- "siswa"'s class, so the same duty holders approve --
 * through the admin API, signs them in for the first time (the forced
 * password change included), and afterwards takes them out of the class
 * and archives the account.
 */
test("exit permit: request -> picket -> counselor -> leadership -> security gate -> exited", async ({
  browser,
}) => {
  // Five actors: logging them in one at a time (each up to ~16s with its
  // own retry) risks the default test timeout before the chain itself
  // even starts, so these run concurrently instead -- independent
  // browser contexts, nothing shared between them.
  test.setTimeout(180_000);
  const [picket, counselor, leadership, security] = await Promise.all([
    loginAs(browser, ACTORS.picket),
    loginAs(browser, ACTORS.counselor),
    loginAs(browser, ACTORS.leadership),
    loginAs(browser, ACTORS.security),
  ]);
  const admin = await apiAs(picket.apiBase, ACTORS.admin);
  const newcomer = newStudent();
  let signedIn: { context: BrowserContext } | undefined;

  try {
    await enrollStudent(admin, newcomer);
    const student = await signInFirstTime(browser, newcomer);
    signedIn = student;

    // The area keeps its title on every permit route (82289c1d); its tabs
    // mark the exit permits as the one open. Nothing is on its way yet.
    await student.page.goto("/exit-permits");
    await expect(
      student.page.getByRole("heading", { level: 1, name: "Izin dan keterlambatan" }),
    ).toBeVisible();
    await expect(
      student.page
        .getByRole("navigation", { name: "Bagian Izin dan keterlambatan" })
        .getByRole("link", { name: "Izin keluar", exact: true }),
    ).toHaveAttribute("aria-current", "page");

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
    const counselorCard = await openInboxPermit(counselor.page, newcomer.name, "Berjalan");
    await counselorCard.getByRole("button", { name: "Tindak lanjuti" }).click();
    const counselorCode = await readQrCode(counselor.page.getByRole("dialog"), APPROVE_QR);

    await scanStage(student.page, "Guru BK", counselorCode, "Menunggu: Pimpinan");

    // Stage 3: leadership. Same inbox pattern as the counselor.
    const leadershipCard = await openInboxPermit(leadership.page, newcomer.name, "Berjalan");
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
    await openInboxPermit(security.page, newcomer.name, "Disetujui");

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

    // The student's already open card follows the gate scan live, to its
    // exited state with the time they went through.
    await assertNoNavigation(student.page, async () => {
      await expect(student.page.getByText("Sudah keluar", { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(student.page.getByText(/^Keluar gerbang pukul \d{2}\.\d{2}$/)).toBeVisible();
    });
  } finally {
    await closeAll(
      ...[signedIn, picket, counselor, leadership, security].filter((actor) => actor !== undefined),
    );
    await releaseStudent(admin, newcomer);
    await admin.dispose();
  }
});

const APPROVE_QR = "Kode QR persetujuan izin keluar";
const GATE_QR = "Kode QR gerbang izin keluar";
/** The seeded homeroom class (cmd/seed), "siswa"'s own. */
const CLASS_NAME = "X-A";

/** This run's own student; the ids fill in as {@link enrollStudent} goes. */
interface Newcomer {
  name: string;
  username: string;
  password: string;
  userId?: string;
  enrollmentId?: string;
  /** The tenant-local day of the enrollment, YYYY-MM-DD. */
  today?: string;
}

function newStudent(): Newcomer {
  const stamp = Date.now().toString(36);
  return {
    name: `Siswa Simulasi ${stamp}`,
    username: `simsiswa${stamp}`,
    password: `Sim-${randomUUID()}`,
  };
}

/** Creates the student's account and enrolls it in {@link CLASS_NAME} from today. */
async function enrollStudent(admin: ApiSession, student: Newcomer): Promise<void> {
  const me = await admin.get<{
    active_academic_year?: { id: string };
    tenant: { timezone: string };
  }>("/v1/me");
  const yearId = me.active_academic_year?.id;
  if (!yearId) throw new Error("the tenant has no active academic year");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: me.tenant.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const roles = await admin.get<{ data: { id: string; slug: string }[] }>("/v1/roles");
  const role = roles.data.find((item) => item.slug === "student");
  if (!role) throw new Error("the tenant has no student role");
  const classes = await admin.get<{ data: { id: string; name: string }[] }>(
    `/v1/academic/classes?academic_year_id=${yearId}&search=${encodeURIComponent(CLASS_NAME)}`,
  );
  const homeClass = classes.data.find((item) => item.name === CLASS_NAME);
  if (!homeClass) throw new Error(`the active year has no class ${CLASS_NAME}`);

  const user = await admin.post<{ id: string }>("/v1/users", {
    name: student.name,
    username: student.username,
    password: student.password,
    profile_kind: "student",
    locale: "id",
    roles: [{ role_id: role.id, is_primary: true }],
  });
  student.userId = user.id;
  student.today = today;
  const enrollment = await admin.post<{ id: string }>(
    `/v1/academic/classes/${homeClass.id}/enrollments`,
    { student_user_id: user.id, joined_on: today },
  );
  student.enrollmentId = enrollment.id;
}

/**
 * Takes the run's student out of the class and archives the account, so
 * runs do not pile up in X-A's roster. Best-effort: a failure here must
 * not hide the scenario's own result.
 */
async function releaseStudent(admin: ApiSession, student: Newcomer): Promise<void> {
  const { enrollmentId, userId, today } = student;
  if (enrollmentId && today) {
    await admin
      .post(`/v1/academic/enrollments/${enrollmentId}/leave`, { left_on: today })
      .catch(() => undefined);
  }
  if (userId) {
    await admin.post(`/v1/users/${userId}/archive`).catch(() => undefined);
  }
}

/**
 * The student's first sign-in: a new account must choose its own password
 * before reaching any page (RouteGuard sends it to /change-password).
 */
async function signInFirstTime(
  browser: Browser,
  student: Newcomer,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Nama pengguna").fill(student.username);
    await page.getByLabel("Kata sandi", { exact: true }).fill(student.password);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.waitForURL("**/change-password", { timeout: 20_000 });

    const chosen = `Sim-${randomUUID()}`;
    await page.getByLabel("Kata sandi saat ini").fill(student.password);
    // exact: "Kata sandi baru" is a substring of "Konfirmasi kata sandi baru".
    await page.getByLabel("Kata sandi baru", { exact: true }).fill(chosen);
    await page.getByLabel("Konfirmasi kata sandi baru").fill(chosen);
    await page.getByRole("button", { name: "Ubah kata sandi" }).click();
    await page.waitForURL("**/dashboard", { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    return { context, page };
  } catch (error) {
    await context.close();
    throw error;
  }
}

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

/** The reviewer's inbox card for `studentName`'s exit permit, in `status`. */
async function openInboxPermit(page: Page, studentName: string, status: string): Promise<Locator> {
  await page.goto("/inbox");
  await waitForToastsGone(page);
  const card = page
    .getByRole("listitem")
    .filter({ hasText: studentName })
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
