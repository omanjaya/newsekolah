import type * as UiModule from "@newsekolah/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  replace: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString().slice(0, 10) }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "class-1", name: "X-1" }] } }),
  useSubjectsQuery: () => ({ data: { data: [{ id: "subject-1", name: "Matematika" }] } }),
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
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "teacher-1", name: "Budi" }]);
});
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});

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
  effective_from: "2026-07-13",
};

beforeAll(() => {
  // Radix Select reads pointer-capture and scroll APIs jsdom does not implement.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

describe("ScheduleForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ effective_from: "2026-11-23" });
    mocks.replace.mockResolvedValue({ effective_from: "2026-11-23" });
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

    const textarea = await screen.findByRole("textbox", { name: /^notes/ });
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

    expect(screen.queryByRole("textbox", { name: /^notes/ })).not.toBeInTheDocument();
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

    expect(screen.getByRole("textbox", { name: /^notes/ })).toHaveValue("");
    expect(screen.getByRole("button", { name: "save" })).not.toBeDisabled();
  });

  it("marks each missing field on Save and focuses the first, with no banner", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleForm
        yearId="year-1"
        initialDay={1}
        initialStartSeq={1}
        initialClassId=""
        initialTeacherId="teacher-1"
        onDone={vi.fn()}
      />,
    );

    const classPicker = screen.getByRole("combobox", { name: "class" });
    const subjectPicker = screen.getByRole("combobox", { name: "subject" });
    expect(classPicker).toHaveAttribute("aria-required", "true");
    expect(classPicker).not.toHaveAttribute("aria-invalid");

    await user.click(screen.getByRole("button", { name: "save" }));

    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(classPicker).toHaveAttribute("aria-invalid", "true");
    expect(subjectPicker).toHaveAttribute("aria-invalid", "true");
    // The periods have their defaults, so they are not flagged.
    expect(screen.getByRole("combobox", { name: "start" })).not.toHaveAttribute("aria-invalid");
    await waitFor(() => {
      expect(classPicker).toHaveFocus();
    });
  });

  it("asks from which date a change to a block with history takes effect, and sends it", async () => {
    scheduleDetail = { notes: "" };
    const user = userEvent.setup();
    render(
      <ScheduleForm
        yearId="year-1"
        initialDay={1}
        initialStartSeq={1}
        initialClassId="class-1"
        initialTeacherId="teacher-1"
        editing={{ ...editingBlock, has_history: true }}
        effective={{
          mode: "dated",
          defaultValue: "2026-11-23",
          min: "2026-11-21",
          max: "2027-06-30",
          today: "2026-11-20",
        }}
        onDone={vi.fn()}
      />,
    );

    // The history is explained, and the date is required.
    expect(screen.getByText("historyNoticeBody")).toBeInTheDocument();
    const picker = screen.getByRole("combobox", { name: /effectiveFrom/ });
    expect(picker).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("effectiveFromHintDated")).toBeInTheDocument();
    expect(screen.queryByText("inPlaceNote")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledTimes(1);
    });
    const call = mocks.replace.mock.calls[0] as [{ body: { effective_from?: string } }] | undefined;
    expect(call?.[0].body.effective_from).toBe("2026-11-23");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("updatedFrom");
  });

  it("corrects a block without history in place, with no date", async () => {
    scheduleDetail = { notes: "" };
    const user = userEvent.setup();
    render(
      <ScheduleForm
        yearId="year-1"
        initialDay={1}
        initialStartSeq={1}
        initialClassId="class-1"
        initialTeacherId="teacher-1"
        editing={editingBlock}
        effective={{ mode: "none", defaultValue: "" }}
        onDone={vi.fn()}
      />,
    );

    expect(screen.queryByRole("combobox", { name: /effectiveFrom/ })).not.toBeInTheDocument();
    expect(screen.getByText("inPlaceNote")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledTimes(1);
    });
    const call = mocks.replace.mock.calls[0] as [{ body: { effective_from?: string } }] | undefined;
    expect(call?.[0].body).not.toHaveProperty("effective_from");
  });

  it("starts a new lesson on its date", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleForm
        yearId="year-1"
        initialDay={1}
        initialStartSeq={1}
        initialClassId="class-1"
        initialTeacherId="teacher-1"
        effective={{
          mode: "create",
          defaultValue: "2026-11-23",
          min: "2026-07-13",
          max: "2027-06-30",
        }}
        onDone={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "subject" }));
    await user.click(await screen.findByRole("option", { name: "Matematika" }));
    await user.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledTimes(1);
    });
    const call = mocks.create.mock.calls[0] as [{ effective_from?: string }] | undefined;
    expect(call?.[0].effective_from).toBe("2026-11-23");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("createdFrom");
  });

  it("moves the date to the earliest the server accepts when it was too early", async () => {
    const { ApiError } = await import("@newsekolah/api-client");
    mocks.replace.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: "SCHEDULE_CHANGE_BEFORE_HISTORY",
        message: "too early",
        details: [{ field: "effective_from", code: "BEFORE_MIN", message: "2026-11-30" }],
      }),
    );
    scheduleDetail = { notes: "" };
    const user = userEvent.setup();
    render(
      <ScheduleForm
        yearId="year-1"
        initialDay={1}
        initialStartSeq={1}
        initialClassId="class-1"
        initialTeacherId="teacher-1"
        editing={{ ...editingBlock, has_history: true }}
        effective={{ mode: "dated", defaultValue: "2026-11-23", min: "2026-11-21" }}
        onDone={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("SCHEDULE_CHANGE_BEFORE_HISTORY");

    await user.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledTimes(2);
    });
    const retry = mocks.replace.mock.calls[1] as
      [{ body: { effective_from?: string } }] | undefined;
    expect(retry?.[0].body.effective_from).toBe("2026-11-30");
  });

  // The field used to say only "Paling cepat Selasa, 2 Maret 2027" with a
  // generic notice: nothing named the pending request weeks away that held
  // every change back, nor where to release it.
  it("names the request that holds the earliest date and links to where it can be cancelled", () => {
    scheduleDetail = { notes: "" };
    render(
      <ScheduleForm
        yearId="year-1"
        initialDay={1}
        initialStartSeq={1}
        initialClassId="class-1"
        initialTeacherId="teacher-1"
        editing={{ ...editingBlock, has_history: true }}
        effective={{
          mode: "dated",
          defaultValue: "2027-03-02",
          min: "2027-03-02",
          heldBy: { kind: "substitution", id: "request-1", date: "2027-03-01", status: "pending" },
        }}
        onDone={vi.fn()}
      />,
    );

    const picker = screen.getByRole("combobox", { name: /effectiveFrom/ });
    const hint = document.getElementById(picker.getAttribute("aria-describedby") ?? "");
    expect(hint).toHaveTextContent("effectiveFromHintDated heldBy.substitutionPending");
    expect(screen.getByRole("link", { name: "heldBy.openSubstitutions" })).toHaveAttribute(
      "href",
      "/substitutions?view=all",
    );
  });

  it("takes the hold from a refusal when the block gained one after the grid loaded", async () => {
    const { ApiError } = await import("@newsekolah/api-client");
    mocks.replace.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: "SCHEDULE_CHANGE_BEFORE_HISTORY",
        message: "too early",
        details: [
          { field: "effective_from", code: "BEFORE_MIN", message: "2026-12-01" },
          { field: "held_by.kind", code: "attendance", message: "2026-11-30" },
          { field: "held_by.id", code: "session-1" },
        ],
      }),
    );
    scheduleDetail = { notes: "" };
    const user = userEvent.setup();
    render(
      <ScheduleForm
        yearId="year-1"
        initialDay={1}
        initialStartSeq={1}
        initialClassId="class-1"
        initialTeacherId="teacher-1"
        editing={{ ...editingBlock, has_history: true }}
        effective={{ mode: "dated", defaultValue: "2026-11-23", min: "2026-11-21" }}
        onDone={vi.fn()}
      />,
    );
    expect(screen.queryByText(/heldBy/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "save" }));
    expect(await screen.findByText(/heldBy\.attendance/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "heldBy.openAttendance" })).toHaveAttribute(
      "href",
      "/attendance/session-1",
    );
  });
});
