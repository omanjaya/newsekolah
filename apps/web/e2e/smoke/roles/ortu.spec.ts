import { assertNoHorizontalOverflow, expect, forRole, registerCommonFlow } from "../fixtures";

const { test, goto } = forRole("ortu");
registerCommonFlow({ test, goto }, "ortu", ["/children", "/leave-requests", "/profile"]);

test("ortu: children page loads", async ({ page }) => {
  await goto(page, "/children");
  await expect(page.getByRole("heading", { level: 1, name: "Anak saya" })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

/**
 * A parent account only ever gets `approve_child_leave_requests`, never
 * `submit_leave_requests` (verified against the real seeded "ortu"
 * account's /v1/me permissions) -- the student submits their own leave
 * request, the guardian approves it. So the "leave request form" a parent
 * can open is the approval queue's request detail (features/permits/
 * components/leave-requests-view.tsx GuardianQueue), not a "new request"
 * form: there is no parent-side creation form anywhere in the app.
 *
 * This opens the guardian queue and, if it already has a pending request
 * from earlier real usage of this dev tenant, opens that request's detail
 * (a real approve/reject form) without acting on it -- read-only, per the
 * brief. It never creates one itself: leave requests have no
 * cancel/withdraw endpoint to clean one up with afterwards, so seeding
 * one here would leave permanently pending data behind in a shared dev
 * database, which the brief also asks not to do.
 */
test("ortu: leave-request approval queue opens", async ({ page }) => {
  await goto(page, "/leave-requests");
  await expect(page.getByRole("heading", { level: 1, name: "Izin terencana" })).toBeVisible();

  const emptyState = page.getByText("Tidak ada yang menunggu keputusan Anda");
  // A guardian-queue row's accessible name is "{student} ({class})
  // {category} - {date range}"; matching on the category word is enough
  // to find a row without depending on which student/class it is.
  const firstItem = page
    .getByRole("button", { name: /Sakit|Upacara keagamaan|Dispensasi|Lainnya/ })
    .first();
  await expect(emptyState.or(firstItem)).toBeVisible({ timeout: 15_000 });

  if (await firstItem.isVisible().catch(() => false)) {
    await firstItem.click();
    await expect(page.getByRole("dialog", { name: "Detail izin" })).toBeVisible();
  }

  await assertNoHorizontalOverflow(page);
});
