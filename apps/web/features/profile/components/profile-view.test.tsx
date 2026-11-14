import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/profile",
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      name: "Budi Santoso",
      username: "budi",
      email: "budi@contoh.sch.id",
      profile_kind: "teacher",
      roles: [
        { id: "r2", name: "Wali kelas", is_primary: false },
        { id: "r1", name: "Guru", is_primary: true },
      ],
      active_academic_year: { id: "ay", label: "2026/2027" },
    },
  }),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("./avatar-upload", () => ({
  AvatarUpload: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./edit-profile-form", () => ({ EditProfileForm: () => <p>account form</p> }));
vi.mock("./edit-detail-form", () => ({ EditDetailForm: () => <p>personal form</p> }));
vi.mock("./account-security", () => ({ AccountSecurity: () => <p>security summary</p> }));
vi.mock("./sessions-table", () => ({ SessionsTable: () => <p>sessions</p> }));
vi.mock("../../auth/components/change-password-form", () => ({
  ChangePasswordForm: () => <p>password form</p>,
}));

import { ProfileView } from "./profile-view";

beforeEach(() => {
  replace.mockReset();
  search.value = "";
});

describe("ProfileView", () => {
  it("opens on the identity header and the account tab", () => {
    render(<ProfileView />);
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
    expect(screen.getByText("@budi · budi@contoh.sch.id")).toBeInTheDocument();
    // The primary role leads.
    const badges = screen.getAllByText(/^(Guru|Wali kelas)$/).map((node) => node.textContent);
    expect(badges).toEqual(["Guru", "Wali kelas"]);
    expect(screen.getByRole("tab", { name: "tabs.account" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("account form")).toBeVisible();
  });

  it("reads the tab from the URL and keeps a switch there", () => {
    search.value = "tab=security";
    render(<ProfileView />);
    expect(screen.getByText("password form")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "tabs.personal" }));
    expect(replace).toHaveBeenCalledWith("/profile?tab=personal", { scroll: false });
  });
});
