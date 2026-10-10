import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useLibraryMembersQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/members",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => true,
  useSession: () => ({ me: { permissions: [], profile_kind: "staff" } }),
}));
vi.mock("../../../lib/view-state/view-state-provider", () => ({
  useRememberedViewState: () => ["", vi.fn()],
}));
vi.mock("../../reference/api", () => ({
  useDirectoryQuery: () => ({ data: { data: [] } }),
  useLookup: () => new Map(),
}));
vi.mock("../api", () => ({ printMemberCard: vi.fn() }));
vi.mock("../members-api", () => ({
  useLibraryMembersQuery: mocks.useLibraryMembersQuery,
  useLibraryMemberTypesQuery: () => ({
    data: {
      data: [
        { id: "type-student", name: "Siswa" },
        { id: "type-teacher", name: "Guru" },
      ],
    },
  }),
  printLibraryMemberCardsBatch: vi.fn(),
}));
vi.mock("./member-bulk-register-dialog", () => ({ MemberBulkRegisterDialog: () => null }));
vi.mock("./member-register-form", () => ({ MemberRegisterForm: () => null }));

import { MembersView } from "./members-view";

describe("MembersView filters", () => {
  beforeEach(() => {
    mocks.useLibraryMembersQuery.mockReset();
    mocks.useLibraryMembersQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/library/members");
  });

  it("passes the chosen status to the members query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<MembersView />);

    await user.click(screen.getByRole("button", { name: "filters.status" }));
    await user.click(await screen.findByRole("button", { name: "status.active" }));

    expect(mocks.useLibraryMembersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "active" }),
    );
    expect(new URLSearchParams(window.location.search).get("status")).toBe("active");
  });

  it("passes the chosen member type to the members query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<MembersView />);

    await user.click(screen.getByRole("button", { name: "filters.type" }));
    await user.click(await screen.findByRole("button", { name: "Guru" }));

    expect(mocks.useLibraryMembersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ memberTypeId: "type-teacher" }),
    );
    expect(new URLSearchParams(window.location.search).get("member_type")).toBe("type-teacher");
  });

  it("reads initial status and member_type URL params back into the filter bar", () => {
    window.history.replaceState(
      null,
      "",
      "/library/members?status=suspended&member_type=type-student",
    );
    render(<MembersView />);

    expect(mocks.useLibraryMembersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "suspended", memberTypeId: "type-student" }),
    );
    expect(
      screen.getByRole("button", { name: "filters.status: status.suspended" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "filters.type: Siswa" })).toBeInTheDocument();
  });

  it("pages members by offset instead of capping the list at one page", async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({
      user_id: `user-${i}`,
      member_no: `M${i}`,
      member_type_id: "type-student",
      status: "active",
    }));
    mocks.useLibraryMembersQuery.mockReturnValue({ data: { data: full }, isLoading: false });
    const user = userEvent.setup();
    render(<MembersView />);

    expect(mocks.useLibraryMembersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
    expect(screen.getByRole("button", { name: "pagePrev" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "pageNext" }));
    expect(mocks.useLibraryMembersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50, offset: 50 }),
    );
    expect(screen.getByRole("button", { name: "pagePrev" })).toBeEnabled();
  });

  it("clears a filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/library/members?status=active");
    const user = userEvent.setup();
    render(<MembersView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useLibraryMembersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "" }),
    );
    expect(new URLSearchParams(window.location.search).get("status")).toBe("");
  });

  it("shows the print-filtered action only once a member type filter is chosen", async () => {
    const user = userEvent.setup();
    render(<MembersView />);
    expect(screen.queryByRole("button", { name: "printFiltered" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "filters.type" }));
    await user.click(await screen.findByRole("button", { name: "Guru" }));
    expect(screen.getByRole("button", { name: "printFiltered" })).toBeInTheDocument();
  });

  it("consolidates header actions with a Lainnya menu", async () => {
    const user = userEvent.setup();
    render(<MembersView />);

    expect(screen.getByRole("button", { name: "register" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "bulkRegister.title" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "loanSettings" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "more" }));
    expect(screen.getByRole("menuitem", { name: "loanSettings" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "report" })).toBeInTheDocument();
  });
});
