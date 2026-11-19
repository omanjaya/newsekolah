import { ApiError } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted<{ error: unknown }>(() => ({ error: null }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/mentoring/groups/g1/students/s1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("./mentor-term-summary-panel", () => ({ MentorTermSummaryPanel: () => null }));
vi.mock("./student-snapshot-sections", () => ({
  SnapshotAttendanceSection: () => null,
  SnapshotDisciplineSection: () => null,
  SnapshotGradesSection: () => null,
}));
vi.mock("../api", () => ({
  useMentorGroupQuery: () => ({ data: undefined }),
  useMentorStudentSnapshotQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    error: query.error,
    refetch: vi.fn(),
  }),
}));

import { MentorStudentView } from "./mentor-student-view";

const groupId = "00000000-0000-0000-0000-000000000001";
const studentId = "00000000-0000-0000-0000-000000000002";

beforeEach(() => {
  query.error = null;
});

describe("MentorStudentView", () => {
  it("shows the not-found page for an unknown student", () => {
    query.error = new ApiError({ status: 404, code: "NOT_FOUND", message: "not found" });
    render(<MentorStudentView groupId={groupId} studentId={studentId} />);

    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToGroup" })).toHaveAttribute(
      "href",
      `/mentoring/groups/${groupId}`,
    );
    expect(screen.queryByRole("button", { name: "actions.retry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps a retry for a load that failed", () => {
    query.error = new ApiError({ status: 503, code: "UNAVAILABLE", message: "down" });
    render(<MentorStudentView groupId={groupId} studentId={studentId} />);

    expect(screen.queryByText("notFoundTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
  });
});
