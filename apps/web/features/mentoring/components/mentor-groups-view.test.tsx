import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useMentorGroupsQuery: vi.fn(),
  useMyMentorGroupsQuery: vi.fn(),
  canManage: false,
  names: new Map<string, { id: string; name: string }>(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/mentoring/groups",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canManage,
  useSession: () => ({ me: undefined }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/api", () => ({
  useLookup: () => new Map(),
}));
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: () => mocks.names,
}));
vi.mock("../api", () => ({
  useMentorGroupsQuery: mocks.useMentorGroupsQuery,
  useMyMentorGroupsQuery: mocks.useMyMentorGroupsQuery,
  useDeleteMentorGroupMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("./group-size-limit-panel", () => ({
  GroupSizeLimitPanel: () => <div>limit-panel</div>,
}));
vi.mock("./mentor-group-form", () => ({ MentorGroupForm: () => null }));

import { MentorGroupsView } from "./mentor-groups-view";

describe("MentorGroupsView scope", () => {
  beforeEach(() => {
    mocks.canManage = false;
    mocks.names = new Map();
    mocks.useMentorGroupsQuery.mockReset();
    mocks.useMyMentorGroupsQuery.mockReset();
    mocks.useMentorGroupsQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useMyMentorGroupsQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    window.history.replaceState(null, "", "/mentoring/groups");
  });

  it("defaults to the caller's own groups and enables only that query", () => {
    render(<MentorGroupsView />);

    expect(mocks.useMyMentorGroupsQuery).toHaveBeenLastCalledWith(true);
    expect(mocks.useMentorGroupsQuery).toHaveBeenLastCalledWith(false);
  });

  it("shows every group on the all-groups route, with its own title", () => {
    render(<MentorGroupsView initialScope="all" />);

    expect(mocks.useMentorGroupsQuery).toHaveBeenLastCalledWith(true);
    expect(mocks.useMyMentorGroupsQuery).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("navLabelGroups");
  });

  it("has no scope tabs without panels: each scope is its own route", () => {
    render(<MentorGroupsView />);

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("navLabelMyGroups");
  });

  it("opens the group size limit from the header for a manager", async () => {
    mocks.canManage = true;
    const user = userEvent.setup();
    render(<MentorGroupsView />);

    await user.click(screen.getByRole("button", { name: "limitAction" }));
    expect(screen.getByText("limit-panel")).toBeInTheDocument();
  });

  it("finds a group by mentor name, even when the name resolves after the search", async () => {
    const user = userEvent.setup();
    const group = { id: "g1", name: "Kelompok Satu", mentor_user_id: "t1" };
    mocks.useMyMentorGroupsQuery.mockReturnValue({
      data: { data: [group] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const view = render(<MentorGroupsView />);

    await user.type(screen.getByRole("searchbox"), "wijaya");
    await waitFor(() => {
      expect(screen.queryByText("Kelompok Satu")).not.toBeInTheDocument();
    });

    mocks.names = new Map([["t1", { id: "t1", name: "Sari Wijaya" }]]);
    view.rerender(<MentorGroupsView />);

    await waitFor(() => {
      expect(screen.getAllByText("Kelompok Satu").length).toBeGreaterThan(0);
    });
  });
});
