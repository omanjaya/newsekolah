import { ApiError } from "@newsekolah/api-client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MentorStudentView } from "./mentor-student-view";

const errors = vi.hoisted<{ group: unknown; snapshot: unknown }>(() => ({
  group: null,
  snapshot: null,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
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

function result(data: unknown, error: unknown) {
  return error
    ? { data: undefined, isLoading: false, isError: true, error, refetch: vi.fn() }
    : { data, isLoading: false, isError: false, error: null, refetch: vi.fn() };
}

vi.mock("../api", () => ({
  useMentorGroupQuery: () => result({ id: "g1", name: "Kelompok A" }, errors.group),
  useMentorStudentSnapshotQuery: () =>
    result({ student_name: "Siswa Satu", class_name: "X-1" }, errors.snapshot),
}));

const malformed = (field: string) =>
  new ApiError({
    status: 400,
    code: "VALIDATION_FAILED",
    message: "invalid",
    details: [{ field, code: "INVALID_FORMAT" }],
  });

afterEach(() => {
  cleanup();
  errors.group = null;
  errors.snapshot = null;
});

describe("MentorStudentView", () => {
  it("shows the student's snapshot under the group's trail", () => {
    render(<MentorStudentView groupId="g1" studentId="s1" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Siswa Satu");
  });

  it("shows the group's not-found page when the group id is malformed", () => {
    errors.group = malformed("groupId");
    errors.snapshot = malformed("studentId");
    render(<MentorStudentView groupId="abc" studentId="abc" />);
    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToGroups" })).toHaveAttribute(
      "href",
      "/mentoring/groups",
    );
    expect(screen.queryByRole("button", { name: "actions.retry" })).not.toBeInTheDocument();
  });

  it("shows the student's not-found page, back to the group, for an unknown student", () => {
    errors.snapshot = new ApiError({ status: 404, code: "NOT_FOUND", message: "not found" });
    render(<MentorStudentView groupId="g1" studentId="00000000-0000-0000-0000-000000000000" />);
    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToGroup" })).toHaveAttribute(
      "href",
      "/mentoring/groups/g1",
    );
    expect(screen.queryByRole("button", { name: "actions.retry" })).not.toBeInTheDocument();
  });

  it("keeps a retryable failure for an error that is not a missing record", () => {
    errors.snapshot = new ApiError({ status: 503, code: "UNAVAILABLE", message: "down" });
    render(<MentorStudentView groupId="g1" studentId="s1" />);
    expect(screen.queryByText("notFoundTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
  });
});
