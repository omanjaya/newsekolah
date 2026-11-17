import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Shared mock data and route helpers for the e2e specs. Every spec mocks
 * the API with `page.route` per the build brief; nothing here talks to a
 * real backend. Shapes follow openapi/openapi.yaml (`TenantBranding`, `Me`,
 * `AuthTokens`, `Error`).
 */

export const branding = {
  tenant_id: "11111111-1111-1111-1111-111111111111",
  slug: "smansa-contoh",
  name: "SMA Negeri 1 Contoh",
  short_name: "SMAN 1 Contoh",
  accent_color: "#1F3A5F",
  locale: "id" as const,
  timezone: "Asia/Jakarta",
};

export function buildMe(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    username: "guru01",
    name: "Budi Santoso",
    email: "budi@sekolah.contoh.sch.id",
    roles: [
      {
        id: "33333333-3333-3333-3333-333333333333",
        slug: "teacher",
        name: "Guru",
        is_primary: true,
      },
    ],
    permissions: [] as string[],
    active_academic_year: { id: "44444444-4444-4444-4444-444444444444", label: "2025/2026" },
    tenant: branding,
    must_change_password: false,
    ...overrides,
  };
}

function unauthorized(
  code = "AUTH_TOKEN_EXPIRED",
  message = "Sesi berakhir, silakan masuk kembali",
) {
  return { error: { code, message } };
}

/** Public branding, needed on every page (login screen brand mark, manifest, accent color). */
export async function mockBranding(page: Page): Promise<void> {
  await page.route("**/v1/tenant/branding", (route) => route.fulfill({ json: branding }));
}

/**
 * `GET /v1/me` toggled by a shared mutable flag so a test can move from
 * "no session" to "session established" the same way a real login does:
 * the flag flips inside the `/v1/auth/login` (or `/v1/me/password`) route
 * handler, and this handler reads it on every subsequent call.
 */
export function mockSession(page: Page, initialMe: ReturnType<typeof buildMe> | null) {
  let current = initialMe;

  return {
    async install(): Promise<void> {
      await page.route("**/v1/me", (route) => {
        if (current) return route.fulfill({ json: current });
        return route.fulfill({ status: 401, json: unauthorized() });
      });
      await page.route("**/v1/auth/refresh", (route) =>
        route.fulfill({ status: 401, json: unauthorized() }),
      );
    },
    set(next: ReturnType<typeof buildMe> | null) {
      current = next;
    },
  };
}

/**
 * The signed-in home for `name`: the page's one h1 greets the reader by
 * first name ("Halo, Budi"), and the header's account menu carries the
 * full name, so the check still tells apart two accounts that share a
 * first name.
 */
export async function expectHome(page: Page, name: string): Promise<void> {
  const firstName = name.trim().split(/\s+/)[0] ?? name;
  await expect(
    page.getByRole("heading", { level: 1, name: `Halo, ${firstName}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu akun", exact: true })).toContainText(name);
}

/**
 * Picks `isoDate` ("YYYY-MM-DD") in a DatePicker: opens its calendar,
 * steps month by month towards the date (the calendar opens on the
 * field's value, else today), then clicks the day, which closes it.
 */
export async function pickDate(page: Page, field: Locator, isoDate: string): Promise<void> {
  await field.click();
  const targetDay = page.locator(`[role="gridcell"][data-date="${isoDate}"]`);
  const shownDay = await page
    .locator('[role="gridcell"][data-date]')
    .first()
    .getAttribute("data-date");
  const step = (shownDay ?? "") > isoDate ? "Bulan sebelumnya" : "Bulan berikutnya";
  for (let i = 0; i < 48 && (await targetDay.count()) === 0; i += 1) {
    await page.getByRole("button", { name: step, exact: true }).click();
  }
  await targetDay.first().click();
  await expect(page.getByRole("grid")).toHaveCount(0);
}
