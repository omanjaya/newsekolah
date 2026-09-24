import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  children: {},
  attendance: {},
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("../../family/api", () => ({
  currentMonth: () => "2026-09",
  todayInZone: (_timeZone: string) => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  },
  useMyChildrenQuery: () => queries.children,
  useChildAttendanceQuery: () => queries.attendance,
}));

import { ParentChildSummary } from "./parent-child-summary";

describe("ParentChildSummary", () => {
  it("shows loading before child data arrives instead of an empty attendance result", () => {
    queries.children = { isLoading: true, isError: false };
    queries.attendance = { isLoading: false, isError: false };

    const { container } = render(<ParentChildSummary timeZone="Asia/Makassar" />);

    expect(container.querySelector('[class*="animate-pulse"]')).toBeInTheDocument();
    expect(screen.queryByText("parentSummary.noAttendanceToday")).not.toBeInTheDocument();
  });

  it("shows a retryable error when the child query fails", () => {
    queries.children = { isLoading: false, isError: true, refetch: vi.fn() };
    queries.attendance = { isLoading: false, isError: false };

    render(<ParentChildSummary timeZone="Asia/Makassar" />);

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("shows the linked-child empty state only after a successful response", () => {
    queries.children = { isLoading: false, isError: false, data: { data: [] } };
    queries.attendance = { isLoading: false, isError: false };

    render(<ParentChildSummary timeZone="Asia/Makassar" />);

    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
  });

  it("shows the actual attendance state for the linked child", () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    queries.children = {
      isLoading: false,
      isError: false,
      data: {
        data: [
          { student_user_id: "student-1", student_name: "Alya" },
          { student_user_id: "student-2", student_name: "Bima" },
        ],
      },
    };
    queries.attendance = {
      isLoading: false,
      isError: false,
      data: {
        data: [
          {
            date: today,
            status_code: "H",
            submitted_sessions: 2,
            expected_sessions: 2,
            complete: true,
          },
        ],
      },
    };

    render(<ParentChildSummary timeZone="Asia/Makassar" />);

    expect(screen.getByText("Alya")).toBeInTheDocument();
    expect(screen.getByText("Bima")).toBeInTheDocument();
    expect(screen.getAllByText("sessionsRecorded")).toHaveLength(2);
  });
});
