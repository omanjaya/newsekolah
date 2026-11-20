import { ApiError } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted<{ error: unknown }>(() => ({ error: null }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/mentoring/groups/abc",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("./mentor-group-members-panel", () => ({ MentorGroupMembersPanel: () => null }));
vi.mock("./mentor-meeting-notes-panel", () => ({ MentorMeetingNotesPanel: () => null }));
vi.mock("../api", () => ({
  useGroupSizeLimitQuery: () => ({ data: undefined }),
  useMentorGroupMembersQuery: () => ({ data: undefined }),
  useMentorGroupQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    error: query.error,
    refetch: vi.fn(),
  }),
}));

import { MentorGroupDetailView } from "./mentor-group-detail-view";

beforeEach(() => {
  query.error = null;
});

describe("MentorGroupDetailView", () => {
  it("shows the not-found page for a malformed group id", () => {
    query.error = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "invalid",
      details: [{ field: "groupId", code: "INVALID_FORMAT" }],
    });
    render(<MentorGroupDetailView groupId="abc" />);

    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToGroups" })).toHaveAttribute(
      "href",
      "/mentoring/groups",
    );
  });

  it("keeps a retry for a load that failed", () => {
    query.error = new ApiError({ status: 503, code: "UNAVAILABLE", message: "down" });
    render(<MentorGroupDetailView groupId="00000000-0000-0000-0000-000000000001" />);

    expect(screen.queryByText("notFoundTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows the no-access page for a group another guru wali mentors, with no retry", () => {
    query.error = new ApiError({
      status: 403,
      code: "MENTOR_GROUP_FORBIDDEN",
      message: "Kelompok mentoring ini dibina guru wali lain.",
    });
    render(<MentorGroupDetailView groupId="00000000-0000-0000-0000-000000000001" />);

    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByText("MENTOR_GROUP_FORBIDDEN")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToGroups" })).toHaveAttribute(
      "href",
      "/mentoring/groups",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
