import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ExitPermitSummary, useExitPermitReviewQueueQuery } from "../api";

import { ExitPermitReviewQueue } from "./exit-permit-review-queue";

type ExitPermitReviewQueueQueryResult = ReturnType<typeof useExitPermitReviewQueueQuery>;

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock("@newsekolah/i18n", () => ({
  formatDateTime: () => "29 Sep 2026, 07:10",
}));

vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
  useCan: () => true,
}));

function item(overrides: Partial<ExitPermitSummary> & { instance_id: string }): ExitPermitSummary {
  return {
    student_user_id: "student-1",
    current_stage_index: 0,
    destination: "UKS",
    opened_at: "2026-09-29T00:10:00Z",
    status: "in_progress",
    ...overrides,
  };
}

function queueOf(items: ExitPermitSummary[]): ExitPermitReviewQueueQueryResult {
  // Only the fields the component reads (data/isLoading/isError/refetch) are
  // filled in; the rest of react-query's UseQueryResult union is not needed
  // by a component test double.
  return {
    data: { data: items },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ExitPermitReviewQueueQueryResult;
}

describe("ExitPermitReviewQueue", () => {
  it("shows one tile per role the caller holds, counted from the queue already on screen", () => {
    const items = [
      item({ instance_id: "a", status: "in_progress" }),
      item({ instance_id: "b", status: "in_progress" }),
      item({ instance_id: "c", status: "approved" }),
    ];
    render(<ExitPermitReviewQueue queue={queueOf(items)} canApprove canGate onProcess={vi.fn()} />);

    expect(screen.getByTestId("exit-permit-queue-tile-waitingApproval")).toHaveTextContent("2");
    expect(screen.getByTestId("exit-permit-queue-tile-awaitingGate")).toHaveTextContent("1");
  });

  it("drops the tile row when only one count applies (the tab already shows it)", () => {
    const items = [item({ instance_id: "a", status: "in_progress" })];
    render(
      <ExitPermitReviewQueue
        queue={queueOf(items)}
        canApprove
        canGate={false}
        onProcess={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("exit-permit-queue-tiles")).not.toBeInTheDocument();
  });

  it("spans the last card full width for an odd item count", () => {
    const items = [
      item({ instance_id: "a" }),
      item({ instance_id: "b" }),
      item({ instance_id: "c" }),
    ];
    render(<ExitPermitReviewQueue queue={queueOf(items)} canApprove canGate onProcess={vi.fn()} />);

    const cells = ["a", "b", "c"].map((id) => screen.getByTestId(`exit-permit-queue-card-${id}`));
    expect(cells[0]?.className).not.toContain("lg:col-span-2");
    expect(cells[1]?.className).not.toContain("lg:col-span-2");
    expect(cells[2]?.className).toContain("lg:col-span-2");
  });

  it("calls onProcess with the instance id when Proses is clicked", async () => {
    const onProcess = vi.fn();
    const items = [item({ instance_id: "a", status: "in_progress" })];
    const { default: userEvent } = await import("@testing-library/user-event");
    render(
      <ExitPermitReviewQueue queue={queueOf(items)} canApprove canGate onProcess={onProcess} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "process" }));
    expect(onProcess).toHaveBeenCalledWith("a");
  });

  it("shows a calm one-line message, not a dashed empty box, for an empty queue", () => {
    render(<ExitPermitReviewQueue queue={queueOf([])} canApprove canGate onProcess={vi.fn()} />);

    expect(screen.getByText("emptyBody")).toBeInTheDocument();
    expect(document.querySelector(".border-dashed")).not.toBeInTheDocument();
  });
});
