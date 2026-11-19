import type * as UiModule from "@newsekolah/ui";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notes: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => true,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: () => new Map(),
}));
vi.mock("./mentor-meeting-note-detail-dialog", () => ({
  MentorMeetingNoteDetailDialog: () => null,
}));
vi.mock("./mentor-meeting-note-form", () => ({
  MentorMeetingNoteForm: () => null,
}));
vi.mock("../api", () => ({
  useMentorMeetingNotesQuery: mocks.notes,
  useDeleteMentorMeetingNoteMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { MentorMeetingNotesPanel } from "./mentor-meeting-notes-panel";

describe("MentorMeetingNotesPanel", () => {
  beforeEach(() => {
    mocks.notes.mockReset();
  });

  it("puts one add action in the toolbar and none in the empty state, with no search box", () => {
    mocks.notes.mockReturnValue({ data: { data: [] }, isLoading: false });
    render(<MentorMeetingNotesPanel groupId="g1" members={[]} />);

    expect(screen.getAllByRole("button", { name: "add" })).toHaveLength(1);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("dates a meeting in the school's time zone", () => {
    mocks.notes.mockReturnValue({
      data: {
        data: [
          {
            id: "n1",
            group_id: "g1",
            // 20:00 UTC on the 18th is already the 19th in Jakarta (UTC+7).
            met_at: "2026-11-18T20:00:00Z",
            kind: "group",
            topic: "Belajar bersama",
          },
        ],
      },
      isLoading: false,
    });
    render(<MentorMeetingNotesPanel groupId="g1" members={[]} />);

    const table = within(screen.getByRole("table"));
    expect(table.getByText("19 November 2026")).toBeInTheDocument();
  });
});
