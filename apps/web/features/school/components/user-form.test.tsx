import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const SYSTEM_ROLES = [
  { id: "role-admin", slug: "admin", name: "Admin Sekolah", is_system: true },
  { id: "role-teacher", slug: "teacher", name: "Guru", is_system: true },
  { id: "role-staff", slug: "staff", name: "Pegawai", is_system: true },
  { id: "role-student", slug: "student", name: "Siswa", is_system: true },
];
const ALL_ROLES = [
  ...SYSTEM_ROLES,
  { id: "role-bk", slug: "guru_bk", name: "Guru BK", is_system: false },
];

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  can: vi.fn<() => boolean>(),
  roles: { current: [] as { id: string; slug: string; name: string; is_system: boolean }[] },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { id: "me", roles: [{ slug: "admin" }] } }),
  useCan: () => mocks.can(),
}));
vi.mock("../api", () => ({
  useRolesQuery: () => ({ data: { data: mocks.roles.current }, isLoading: false }),
  useCreateUserMutation: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateUserMutation: () => ({ mutateAsync: mocks.update, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import type { AdminUser } from "../api";

import { UserForm, roleFitsKind } from "./user-form";

beforeAll(() => {
  // Radix Select needs these, which jsdom lacks.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({});
  mocks.can.mockReturnValue(true);
  mocks.roles.current = ALL_ROLES;
});

async function optionsOf(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("combobox", { name: label }));
  const options = await screen.findAllByRole("option");
  return options.map((option) => option.textContent);
}

describe("roleFitsKind", () => {
  it("keeps the student role for students only", () => {
    expect(roleFitsKind("student", "student")).toBe(true);
    expect(roleFitsKind("admin", "student")).toBe(false);
    expect(roleFitsKind("teacher", "teacher")).toBe(true);
    expect(roleFitsKind("admin", "staff")).toBe(true);
    expect(roleFitsKind("student", "staff")).toBe(false);
  });
});

// "Jenis Siswa" with "Peran utama Admin Sekolah" used to save without a
// word: the account logged in with the full admin menu and still showed up
// in class placement as a student. The form now offers only the roles that
// fit the chosen kind, as the API enforces.
describe("UserForm primary role by kind", () => {
  it("offers a teacher every system role except Siswa", async () => {
    const user = userEvent.setup();
    render(<UserForm onDone={vi.fn()} />);

    const options = await optionsOf(user, "primaryRole");
    expect(options).toEqual(["primaryRolePlaceholder", "Admin Sekolah", "Guru", "Pegawai"]);
  });

  it("gives a student the Siswa role and offers nothing else", async () => {
    const user = userEvent.setup();
    render(<UserForm onDone={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "kind" }));
    await user.click(await screen.findByRole("option", { name: "student" }));

    expect(screen.getByRole("combobox", { name: "primaryRole" })).toHaveTextContent("Siswa");
    const options = await optionsOf(user, "primaryRole");
    expect(options).toEqual(["primaryRolePlaceholder", "Siswa"]);
  });

  it("drops a staff role chosen before the kind switched to Siswa", async () => {
    const user = userEvent.setup();
    render(<UserForm onDone={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "primaryRole" }));
    await user.click(await screen.findByRole("option", { name: "Admin Sekolah" }));
    await user.click(screen.getByRole("combobox", { name: "kind" }));
    await user.click(await screen.findByRole("option", { name: "student" }));
    await user.type(screen.getByRole("textbox", { name: "name" }), "Siswa Baru");
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_kind: "student",
        roles: [{ role_id: "role-student", is_primary: true }],
      }),
    );
  });

  it("warns about an existing student account that holds a staff role", () => {
    const legacy = {
      id: "u1",
      username: "salahperan",
      name: "Siswa Salah Peran",
      status: "active",
      profile_kind: "student",
      must_change_password: false,
      created_at: "2026-11-20T00:00:00Z",
      roles: [{ id: "role-admin", slug: "admin", name: "Admin Sekolah", is_primary: true }],
    } as AdminUser;
    render(<UserForm initial={legacy} onDone={vi.fn()} />);

    expect(screen.getByText("kindRoleMismatch:student")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "primaryRole" })).toHaveTextContent(
      "Admin Sekolah",
    );
  });
});

describe("UserForm custom roles hint", () => {
  beforeEach(() => {
    mocks.roles.current = SYSTEM_ROLES;
  });

  it("tells an admin who cannot create roles to ask the Super Admin", () => {
    mocks.can.mockReturnValue(false);
    render(<UserForm onDone={vi.fn()} />);
    expect(screen.getByText("noCustomRolesAskSuperAdmin")).toBeInTheDocument();
    expect(screen.queryByText("noCustomRoles")).not.toBeInTheDocument();
  });

  it("points a role manager at the roles page", () => {
    mocks.can.mockReturnValue(true);
    render(<UserForm onDone={vi.fn()} />);
    expect(screen.getByText("noCustomRoles")).toBeInTheDocument();
  });
});
