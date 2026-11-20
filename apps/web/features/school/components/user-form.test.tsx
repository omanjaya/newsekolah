import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserForm } from "./user-form";

const can = vi.fn<() => boolean>();

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { roles: [{ slug: "admin" }] } }),
  useCan: () => can(),
}));
vi.mock("../api", () => ({
  useRolesQuery: () => ({
    data: { data: [{ id: "r-admin", slug: "admin", name: "Admin Sekolah", is_system: true }] },
    isLoading: false,
  }),
  useCreateUserMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateUserMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(() => {
  cleanup();
  can.mockReset();
});

describe("UserForm custom roles hint", () => {
  it("tells an admin who cannot create roles to ask the Super Admin", () => {
    can.mockReturnValue(false);
    render(<UserForm onDone={vi.fn()} />);
    expect(screen.getByText("noCustomRolesAskSuperAdmin")).toBeInTheDocument();
    expect(screen.queryByText("noCustomRoles")).not.toBeInTheDocument();
  });

  it("points a role manager at the roles page", () => {
    can.mockReturnValue(true);
    render(<UserForm onDone={vi.fn()} />);
    expect(screen.getByText("noCustomRoles")).toBeInTheDocument();
  });
});
