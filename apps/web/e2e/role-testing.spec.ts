import { expect, test } from "@playwright/test";

import { branding, buildMe, mockBranding, mockSession } from "./fixtures";

// Keep API fixtures in Playwright's routing layer after a document reload.
test.use({ serviceWorkers: "block" });

test("topbar switches roles, survives reload, and returns to superadmin with simulated time intact", async ({
  page,
}) => {
  const school = { ...branding, timezone: "Asia/Makassar" };
  const admin = buildMe({
    name: "Admin Pengujian",
    permissions: ["platform_superadmin"],
    roles: [
      {
        id: "33333333-3333-3333-3333-333333333333",
        slug: "super_admin",
        name: "Superadmin",
        is_primary: true,
      },
    ],
    tenant: school,
  });
  const roles = [
    { slug: "teacher", name: "Guru" },
    { slug: "student", name: "Siswa" },
  ];
  const teacher = {
    id: "55555555-5555-5555-5555-555555555555",
    username: "guru_uji",
    name: "Guru Pengujian",
  };
  const student = {
    id: "66666666-6666-6666-6666-666666666666",
    username: "siswa_uji",
    name: "Siswa Pengujian",
  };
  let selectedRole = "";
  let currentUser = admin;
  const switches: unknown[] = [];
  const session = mockSession(page, admin);
  await mockBranding(page);
  await session.install();
  await page.route("**/v1/auth/refresh", (route) =>
    route.fulfill({
      json: {
        token_type: "Bearer",
        access_token: `test-${selectedRole || "admin"}`,
        access_expires_at: "2099-01-01T00:00:00Z",
        user: currentUser,
      },
    }),
  );
  await page.route("**/v1/me/announcements", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/v1/notifications/unread-count", (route) =>
    route.fulfill({ json: { count: 0 } }),
  );
  await page.route(/\/v1\/auth\/role-testing(?:\?.*)?$/, (route) => {
    const role = new URL(route.request().url()).searchParams.get("role");
    return route.fulfill({
      json: {
        available: true,
        active: selectedRole !== "",
        actor: { id: admin.id, name: admin.name },
        roles,
        users: role === "teacher" ? [teacher] : role === "student" ? [student] : [],
        ...(selectedRole
          ? { selected_role_slug: selectedRole, expires_at: "2099-01-01T00:00:00Z" }
          : {}),
      },
    });
  });
  await page.route("**/v1/auth/role-testing/start", async (route) => {
    const body = route.request().postDataJSON() as { user_id: string; role: string };
    switches.push(body);
    selectedRole = body.role;
    const target = selectedRole === "teacher" ? teacher : student;
    const user = buildMe({
      ...target,
      tenant: school,
      permissions: [],
      roles: [
        {
          id: "77777777-7777-7777-7777-777777777777",
          slug: selectedRole,
          name: selectedRole === "teacher" ? "Guru" : "Siswa",
          is_primary: true,
        },
      ],
      impersonated_by: { user_id: admin.id, name: admin.name },
    });
    session.set(user);
    currentUser = user;
    await route.fulfill({
      json: {
        token_type: "Bearer",
        access_token: `test-${selectedRole}`,
        access_expires_at: "2099-01-01T00:00:00Z",
        user,
      },
    });
  });
  await page.route("**/v1/auth/role-testing/stop", (route) => {
    selectedRole = "";
    session.set(admin);
    currentUser = admin;
    return route.fulfill({
      json: {
        token_type: "Bearer",
        access_token: "test-admin",
        access_expires_at: "2099-01-01T00:00:00Z",
        user: admin,
      },
    });
  });

  await page.goto("/dashboard");
  await expect(page.getByText(`Selamat datang, ${admin.name}`)).toBeVisible();
  const simulation = page.getByTestId("simulation-controls");
  await simulation.locator("summary").click();
  await simulation.getByLabel("Tanggal sekolah").fill("2026-09-28");
  await simulation.getByLabel("Jam sekolah (Asia/Makassar)").fill("06:45");
  await simulation.getByRole("button", { name: "Terapkan", exact: true }).click();

  const switcher = page.getByTestId("role-testing-switcher");
  await switcher.getByRole("button", { name: "Ganti role", exact: true }).click();
  const dialog = page.getByTestId("role-testing-dialog");
  await dialog.getByRole("radio", { name: /Guru Pengujian/ }).check();
  await dialog.getByRole("button", { name: "Beralih ke akun", exact: true }).click();
  await expect(page.getByText(`Selamat datang, ${teacher.name}`)).toBeVisible();
  await expect(switcher).toBeVisible();
  await expect(simulation).toContainText("Senin");

  await page.reload();
  await expect(page.getByText(`Selamat datang, ${teacher.name}`)).toBeVisible();
  await expect(simulation).toContainText("Senin");
  await switcher.getByRole("button", { name: "Ganti role", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Role untuk mencari akun" }).click();
  await page.getByRole("option", { name: "Siswa", exact: true }).click();
  await dialog.getByRole("radio", { name: /Siswa Pengujian/ }).check();
  await dialog.getByRole("button", { name: "Beralih ke akun", exact: true }).click();
  await expect(page.getByText(`Selamat datang, ${student.name}`)).toBeVisible();
  expect(switches).toEqual([
    { user_id: teacher.id, role: "teacher" },
    { user_id: student.id, role: "student" },
  ]);

  await switcher.getByRole("button", { name: "Kembali ke superadmin", exact: true }).click();
  await expect(page.getByText(`Selamat datang, ${admin.name}`)).toBeVisible();
  await expect(simulation).toContainText("Senin");
  await expect(
    switcher.getByRole("button", { name: "Kembali ke superadmin", exact: true }),
  ).toHaveCount(0);
});

test("ordinary users cannot see the role-testing switcher", async ({ page }) => {
  await mockBranding(page);
  const user = buildMe();
  await mockSession(page, user).install();
  await page.route("**/v1/me/announcements", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/v1/notifications/unread-count", (route) =>
    route.fulfill({ json: { count: 0 } }),
  );
  await page.route("**/v1/auth/role-testing", (route) =>
    route.fulfill({ json: { available: false, active: false, roles: [], users: [] } }),
  );
  await page.goto("/dashboard");
  await expect(page.getByText(`Selamat datang, ${user.name}`)).toBeVisible();
  await expect(page.getByTestId("role-testing-switcher")).toHaveCount(0);
});
