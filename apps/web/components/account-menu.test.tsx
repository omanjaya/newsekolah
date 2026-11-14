import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountMenu } from "./account-menu";

const mutateAsync = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("../features/auth/api", () => ({ useLogoutMutation: () => ({ mutateAsync }) }));
vi.mock("../lib/tenant/tenant-provider", () => ({
  useTenant: () => ({ displayName: "SMA Contoh", branding: undefined, isLoading: false }),
}));
vi.mock("../lib/theme/theme-provider", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));
vi.mock("../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      id: "u1",
      name: "Admin Contoh",
      username: "admin",
      profile_kind: "staff",
      roles: [
        { id: "r2", slug: "teacher", name: "Guru", is_primary: false },
        { id: "r1", slug: "admin", name: "Admin Sekolah", is_primary: true },
      ],
      permissions: [],
      duties: [],
      disabled_modules: [],
      active_academic_year: { id: "y1", label: "2026/2027" },
      tenant: { tenant_id: "t1", timezone: "Asia/Makassar" },
    },
  }),
}));

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue(undefined);
  replace.mockReset();
});

describe("AccountMenu", () => {
  it("names the person, their primary role and the school year, and lists their own pages first", async () => {
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole("button", { name: "profileMenu.label" }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Admin Contoh")).toBeInTheDocument();
    expect(within(sheet).getByText("admin · Admin Sekolah")).toBeInTheDocument();
    expect(within(sheet).getByText("SMA Contoh · schoolYear:2026/2027")).toBeInTheDocument();
    const links = within(sheet).getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/profile");
    expect(within(sheet).getByRole("radiogroup", { name: "theme" })).toBeInTheDocument();
  });

  it("signs out and returns to the login page", async () => {
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole("button", { name: "profileMenu.label" }));
    await user.click(screen.getByRole("button", { name: "profileMenu.logout" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith("/login");
    });
  });
});
