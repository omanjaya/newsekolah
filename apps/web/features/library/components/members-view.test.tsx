import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useLibraryMembersQuery: vi.fn(),
}));

// One translator for every call, as next-intl's own is stable: a new one per
// render would rebuild the view's memoized columns, and TanStack would then
// remount every cell of the table and the phone cards on each re-render.
const translate = vi.hoisted(() => (key: string) => key);
vi.mock("next-intl", () => ({
  useTranslations: () => translate,
  useLocale: () => "id",
}));

/**
 * A full page is 50 members (the API's page size, which is what turns on
 * Next), drawn twice: as the desktop table and as the phone cards, about
 * 3,300 DOM nodes. Each role query after a re-render walks all of them, so
 * the paging test needs about a second alone and more than vitest's 5s
 * default when the whole monorepo runs in parallel.
 */
const FULL_PAGE_TIMEOUT_MS = 20_000;
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/members",
  useRouter: () => ({ push: vi.fn() }),
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
  useLookup: () => new Map(),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
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
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));

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

  it(
    "pages members by offset instead of capping the list at one page",
    async () => {
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
      expect(screen.getByRole("button", { name: "Ke halaman sebelumnya" })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Ke halaman berikutnya" }));
      expect(mocks.useLibraryMembersQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 50, offset: 50 }),
      );
      expect(screen.getByRole("button", { name: "Ke halaman sebelumnya" })).toBeEnabled();
    },
    FULL_PAGE_TIMEOUT_MS,
  );

  it("clears a filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/library/members?status=active");
    const user = userEvent.setup();
    render(<MembersView />);

    await user.click(screen.getByRole("button", { name: /^Hapus filter / }));
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

  it("leads with registering a member and keeps the rest as header actions", () => {
    render(<MembersView />);

    // In the header, and again in the empty list's call to action.
    expect(screen.getAllByRole("button", { name: "register" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "bulkRegister.title" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "memberTypes" })).toHaveAttribute(
      "href",
      "/library/settings?section=memberTypes",
    );
    expect(screen.getByRole("link", { name: "report" })).toHaveAttribute(
      "href",
      "/library/reports?tab=members",
    );
  });
});
