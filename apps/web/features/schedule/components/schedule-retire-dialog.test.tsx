import type * as UiModule from "@newsekolah/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  useLocale: () => "id",
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString().slice(0, 10) }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../api", () => ({
  useDeleteScheduleBlockMutation: () => ({ mutateAsync: mocks.remove, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: mocks.toastSuccess, error: vi.fn() }) };
});

import type { ScheduleBlock } from "../api";

import { ScheduleRetireDialog } from "./schedule-retire-dialog";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});

const block: ScheduleBlock = {
  schedule_ids: ["schedule-1", "schedule-2"],
  class_id: "class-1",
  subject_id: "subject-1",
  teacher_user_id: "teacher-1",
  day_of_week: 4,
  start_seq: 1,
  end_seq: 2,
  source: "admin",
  effective_from: "2026-07-16",
  has_history: true,
  mutation_policy: {
    can_edit: true,
    can_delete: true,
    has_history: true,
    requires_effective_from: true,
    min_effective_from: "2026-11-27",
  },
};

const dates = {
  today: "2026-11-20",
  weekStart: "2026-11-16",
  yearStart: "2026-07-13",
  yearEnd: "2027-06-30",
};

describe("ScheduleRetireDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.remove.mockResolvedValue(undefined);
  });

  it("removes the block from its earliest allowed date, keeping the history before it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ScheduleRetireDialog
        block={block}
        name="Matematika, X-A, Kamis"
        dates={dates}
        onClose={onClose}
      />,
    );

    // The lesson is named and the history before the date is said to stay.
    expect(screen.getByText(/retireBody/)).toHaveTextContent("Matematika, X-A, Kamis");
    // The earliest allowed date is the default and is named.
    expect(screen.getByText(/effectiveFromHintDated/)).toHaveTextContent("2026-11-27");

    await user.click(screen.getByRole("button", { name: "retireConfirm" }));
    await waitFor(() => {
      expect(mocks.remove).toHaveBeenCalledWith({
        scheduleIds: ["schedule-1", "schedule-2"],
        effectiveFrom: "2026-11-27",
      });
    });
    expect(onClose).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(expect.stringContaining("retired"));
  });

  it("offers the date the server names when the chosen one was too early", async () => {
    const { ApiError } = await import("@newsekolah/api-client");
    mocks.remove.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: "SCHEDULE_CHANGE_BEFORE_HISTORY",
        message: "too early",
        details: [{ field: "effective_from", code: "BEFORE_MIN", message: "2026-12-04" }],
      }),
    );
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ScheduleRetireDialog block={block} name="Matematika" dates={dates} onClose={onClose} />,
    );

    await user.click(screen.getByRole("button", { name: "retireConfirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("SCHEDULE_CHANGE_BEFORE_HISTORY");
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "retireConfirm" }));
    await waitFor(() => {
      expect(mocks.remove).toHaveBeenLastCalledWith({
        scheduleIds: ["schedule-1", "schedule-2"],
        effectiveFrom: "2026-12-04",
      });
    });
  });

  it("never defaults past a planned end the block already has", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleRetireDialog
        block={{ ...block, effective_until: "2026-12-03" }}
        name="Matematika"
        dates={{ ...dates, weekStart: "2026-12-07" }}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "retireConfirm" }));
    await waitFor(() => {
      expect(mocks.remove).toHaveBeenCalledWith({
        scheduleIds: ["schedule-1", "schedule-2"],
        effectiveFrom: "2026-12-03",
      });
    });
  });

  it("says which request holds the earliest date, and where it can be cancelled", () => {
    render(
      <ScheduleRetireDialog
        block={{
          ...block,
          mutation_policy: {
            can_edit: true,
            can_delete: true,
            has_history: true,
            requires_effective_from: true,
            min_effective_from: "2026-11-27",
            held_by: {
              kind: "substitution",
              id: "request-1",
              date: "2026-11-26",
              status: "pending",
            },
          },
        }}
        name="Matematika"
        dates={dates}
        onClose={vi.fn()}
      />,
    );

    const field = screen.getByRole("combobox", { name: /effectiveFrom/ });
    const hint = document.getElementById(field.getAttribute("aria-describedby") ?? "");
    expect(hint).toHaveTextContent('heldBy.substitutionPending {"date":"2026-11-26"}');
    expect(screen.getByRole("link", { name: "heldBy.openSubstitutions" })).toHaveAttribute(
      "href",
      "/substitutions?view=all",
    );
  });

  it("renders nothing to confirm without a block", () => {
    render(<ScheduleRetireDialog block={null} name="" dates={dates} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "retireConfirm" })).not.toBeInTheDocument();
  });
});
