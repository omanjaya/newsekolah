import type * as UiModule from "@newsekolah/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  replace: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "class-1", name: "X-1" }] } }),
  useSubjectsQuery: () => ({ data: { data: [{ id: "subject-1", name: "Matematika" }] } }),
  useTeachersQuery: () => ({ data: { data: [{ id: "teacher-1", name: "Budi" }] } }),
  usePeriodsQuery: () => ({
    data: {
      data: [
        { id: "period-1", sequence: 1, name: "Jam 1", starts_at: "07:00:00", is_break: false },
        { id: "period-2", sequence: 2, name: "Jam 2", starts_at: "07:45:00", is_break: false },
      ],
    },
  }),
  useLookup: (items: { id: string }[] | undefined) =>
    new Map((items ?? []).map((item) => [item.id, item])),
}));

let scheduleDetail: { notes?: string } | undefined;
let detailIsLoading: boolean;
let detailIsError: boolean;

vi.mock("../api", () => ({
  useCreateScheduleMutation: () => ({ mutateAsync: mocks.create, isPending: false }),
  useReplaceScheduleBlockMutation: () => ({ mutateAsync: mocks.replace, isPending: false }),
  useScheduleQuery: () => ({
    data: scheduleDetail,
    isLoading: detailIsLoading,
    isError: detailIsError,
    refetch: vi.fn(),
  }),
}));

vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: mocks.toastSuccess, error: vi.fn() }) };
});

import type { ScheduleBlock } from "../api";

import { ScheduleForm } from "./schedule-form";

const editingBlock: ScheduleBlock = {
  schedule_ids: ["schedule-1"],
  class_id: "class-1",
  subject_id: "subject-1",
  teacher_user_id: "teacher-1",
  day_of_week: 1,
  start_seq: 1,
  end_seq: 1,
  source: "admin",
};

describe("ScheduleForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduleDetail = undefined;
    detailIsLoading = false;
    detailIsError = false;
  });

  it("prefills notes from the fetched schedule detail and includes it on save", async () => {
    detailIsLoading = false;
    scheduleDetail = { notes: "Ganti ruang karena renovasi" };
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <ScheduleForm
        yearId="year-1"
        initialDay={1}
        initialStartSeq={1}
        initialClassId="class-1"
        initialTeacherId="teacher-1"
        editing={editingBlock}
        onDone={onDone}
      />,
    );

    const textarea = await screen.findByRole("textbox", { name: "notes" });
    expect(textarea).toHaveValue("Ganti ruang karena renovasi");

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledTimes(1);
    });
    const call = mocks.replace.mock.calls[0] as
      [{ scheduleIds: string[]; body: { notes?: string } }] | undefined;
    expect(call?.[0].scheduleIds).toEqual(["schedule-1"]);
    expect(call?.[0].body.notes).toBe("Ganti ruang karena renovasi");
  });

  it("shows a skeleton while the schedule detail loads and disables save", () => {
    detailIsLoading = true;
    render(
      <ScheduleForm
        yearId="year-1"
        initialDay={1}
        initialStartSeq={1}
        initialClassId="class-1"
        initialTeacherId="teacher-1"
        editing={editingBlock}
        onDone={vi.fn()}
      />,
    );

    expect(screen.queryByRole("textbox", { name: "notes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
  });

  it("shows a retry action and disables save when the detail fetch fails", () => {
    detailIsLoading = false;
    detailIsError = true;
    render(
      <ScheduleForm
        yearId="year-1"
        initialDay={1}
        initialStartSeq={1}
        initialClassId="class-1"
        initialTeacherId="teacher-1"
        editing={editingBlock}
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("notesLoadError");
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
  });

  it("does not fetch schedule detail when creating a new block", () => {
    render(
      <ScheduleForm
        yearId="year-1"
        initialDay={1}
        initialStartSeq={1}
        initialClassId="class-1"
        initialTeacherId="teacher-1"
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "notes" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "save" })).not.toBeDisabled();
  });
});
