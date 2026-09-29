import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LeaveRequestSummary } from "../api";

import { ReviewQueue } from "./leave-review-queue";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock("@newsekolah/i18n", () => ({
  formatDate: () => "29 Sep 2026",
}));

vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));

vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));

const mutate = vi.fn();
let queueItems: LeaveRequestSummary[] = [];

vi.mock("../api", () => ({
  useLeaveReviewQueueQuery: () => ({
    data: { data: queueItems },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useReviewLeaveRequestMutation: () => ({
    mutate,
    mutateAsync: vi.fn(),
    variables: undefined,
  }),
}));

function item(
  overrides: Partial<LeaveRequestSummary> & { instance_id: string },
): LeaveRequestSummary {
  return {
    student_user_id: "student-1",
    current_stage_index: 0,
    category: "sick",
    starts_on: "2026-09-29",
    ends_on: "2026-09-29",
    student_name: "Siswa Contoh",
    class_name: "10 A",
    status: "in_progress",
    opened_at: "2026-09-29T00:10:00Z",
    ...overrides,
  };
}

describe("ReviewQueue (leave requests)", () => {
  it("shows no tile row for its single count, which the queue tab already carries", () => {
    queueItems = [item({ instance_id: "a" }), item({ instance_id: "b" })];
    render(<ReviewQueue />);

    expect(screen.queryByTestId("leave-queue-tiles")).not.toBeInTheDocument();
  });

  it("spans the last card full width for an odd item count", () => {
    queueItems = [
      item({ instance_id: "a" }),
      item({ instance_id: "b" }),
      item({ instance_id: "c" }),
    ];
    render(<ReviewQueue />);

    const rows = screen.getAllByRole("listitem");
    expect(rows[0]?.className).not.toContain("lg:col-span-2");
    expect(rows[1]?.className).not.toContain("lg:col-span-2");
    expect(rows[2]?.className).toContain("lg:col-span-2");
  });

  it("calls the review mutation to approve when Setujui is clicked", async () => {
    queueItems = [item({ instance_id: "a" })];
    mutate.mockClear();
    render(<ReviewQueue />);

    await userEvent.click(screen.getByRole("button", { name: "approve" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]?.[0]).toEqual({ id: "a", approve: true });
  });

  it("shows a calm one-line message, not a dashed empty box, for an empty queue", () => {
    queueItems = [];
    render(<ReviewQueue />);

    expect(screen.getByText("queueEmptyBody")).toBeInTheDocument();
    expect(document.querySelector(".border-dashed")).not.toBeInTheDocument();
  });
});
