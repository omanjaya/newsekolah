import type * as UiModule from "@newsekolah/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MeetingAttendanceEditor } from "./meeting-attendance-editor";

const mocks = vi.hoisted(() => ({
  entries: [] as { student_user_id: string; status_code: "H" | "I" | "S" | "A" }[],
  record: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return {
    ...actual,
    useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError }),
  };
});
vi.mock("../../reference/directory-names", () => ({
  useDirectoryLookup: () => ({
    isLoading: false,
    names: new Map([
      ["s1", { id: "s1", name: "Siswa Contoh" }],
      ["s2", { id: "s2", name: "Siswa Dua" }],
    ]),
  }),
}));
vi.mock("../api", () => ({
  useMeetingRosterQuery: () => ({
    isLoading: false,
    isError: false,
    data: { entries: mocks.entries },
  }),
  useClubMembersQuery: () => ({
    isLoading: false,
    isError: false,
    data: {
      data: [
        { id: "m1", student_user_id: "s1", status: "active" },
        { id: "m2", student_user_id: "s2", status: "active" },
      ],
    },
  }),
  useRecordAttendanceMutation: () => ({ mutateAsync: mocks.record }),
}));

const saveButton = () => screen.getByRole("button", { name: "save" });

describe("MeetingAttendanceEditor", () => {
  beforeEach(() => {
    mocks.entries = [];
    mocks.record.mockReset();
    mocks.record.mockResolvedValue({});
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("saves a new meeting where everyone attended, Hadir included", async () => {
    // Nothing recorded yet: the bar used to claim everything was saved and
    // keep Save disabled, and present members were never stored.
    render(<MeetingAttendanceEditor clubId="club-1" meetingId="meeting-1" />);
    expect(screen.getByText("notRecorded")).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "markAllPresent" }));
    expect(saveButton()).toBeEnabled();
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(mocks.record).toHaveBeenCalledTimes(2);
    });
    expect(mocks.record).toHaveBeenCalledWith({ student_user_id: "s1", status_code: "H" });
    expect(mocks.record).toHaveBeenCalledWith({ student_user_id: "s2", status_code: "H" });
    await waitFor(() => {
      expect(screen.getByText("saveHint")).toBeInTheDocument();
    });
    expect(saveButton()).toBeDisabled();
  });

  it("clears the unsaved marker once the save succeeded", async () => {
    mocks.entries = [
      { student_user_id: "s1", status_code: "H" },
      { student_user_id: "s2", status_code: "H" },
    ];
    const { container } = render(<MeetingAttendanceEditor clubId="club-1" meetingId="meeting-1" />);
    expect(screen.getByText("saveHint")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    const [firstSick] = screen.getAllByRole("radio", { name: "statuses.S" });
    if (!firstSick) throw new Error("no status control");
    await userEvent.click(firstSick);
    expect(screen.getByText('unsavedChanges:{"count":1}')).toBeInTheDocument();
    expect(container.querySelectorAll("[data-changed]")).toHaveLength(1);

    await userEvent.click(saveButton());
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("recorded");
    });
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledWith({ student_user_id: "s1", status_code: "S" });
    await waitFor(() => {
      expect(screen.getByText("saveHint")).toBeInTheDocument();
    });
    expect(container.querySelectorAll("[data-changed]")).toHaveLength(0);
    expect(saveButton()).toBeDisabled();
  });

  it("keeps only the rows whose request failed marked", async () => {
    mocks.entries = [
      { student_user_id: "s1", status_code: "H" },
      { student_user_id: "s2", status_code: "H" },
    ];
    mocks.record.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("offline"));
    const { container } = render(<MeetingAttendanceEditor clubId="club-1" meetingId="meeting-1" />);
    for (const sick of screen.getAllByRole("radio", { name: "statuses.S" })) {
      await userEvent.click(sick);
    }
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText('unsavedChanges:{"count":1}')).toBeInTheDocument();
    });
    expect(container.querySelectorAll("[data-changed]")).toHaveLength(1);
    expect(saveButton()).toBeEnabled();
  });
});
