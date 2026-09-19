import type * as UiModule from "@newsekolah/ui";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivitiesCalendarView } from "./activities-calendar-view";

const mocks = vi.hoisted(() => ({
  canManage: true,
  update: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => mocks.canManage }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("./activity-participants", () => ({
  ActivityParticipants: () => <div>Participant editor</div>,
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
vi.mock("../api", () => ({
  useActivityEventsQuery: () => ({
    data: {
      data: [
        {
          id: "event-1",
          academic_year_id: "year-1",
          name: "Science fair",
          description: "Exhibition",
          location: "Hall",
          start_date: "2026-09-20",
          end_date: "2026-09-21",
          organiser_user_id: "teacher-1",
        },
      ],
    },
    isLoading: false,
  }),
  useCreateActivityEventMutation: () => ({ mutate: mocks.create, isPending: false }),
  useUpdateActivityEventMutation: () => ({ mutate: mocks.update, isPending: false }),
  useDeleteActivityEventMutation: () => ({ mutateAsync: mocks.remove, isPending: false }),
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.canManage = true;
});

describe("ActivitiesCalendarView", () => {
  it("edits an existing event without clearing its organiser or creating a duplicate", async () => {
    const user = userEvent.setup();
    render(<ActivitiesCalendarView />);
    await user.click(within(screen.getByRole("table")).getByRole("button", { name: "edit" }));
    const dialog = within(screen.getByRole("dialog"));
    const input = dialog.getByLabelText("name");
    await user.clear(input);
    await user.type(input, "Science exhibition");
    await user.click(dialog.getByRole("button", { name: "submit" }));
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "event-1",
        name: "Science exhibition",
        organiser_user_id: "teacher-1",
        start_date: "2026-09-20",
        end_date: "2026-09-21",
      }),
      expect.any(Object),
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before deleting", async () => {
    const user = userEvent.setup();
    render(<ActivitiesCalendarView />);
    await user.click(within(screen.getByRole("table")).getByRole("button", { name: "delete" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog", { name: "deleteTitle" })).getByRole("button", {
        name: "delete",
      }),
    );
    expect(mocks.remove).toHaveBeenCalledWith("event-1");
  });

  it("hides all write controls from read-only users", () => {
    mocks.canManage = false;
    render(<ActivitiesCalendarView />);
    expect(screen.queryByRole("button", { name: "edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "add" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "participants.title" })).not.toBeInTheDocument();
  });
});
