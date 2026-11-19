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
vi.mock("next/navigation", () => ({ usePathname: () => "/activities/events" }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canManage,
  useSession: () => ({ me: undefined }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("./activity-participants", () => ({
  ActivityParticipants: ({ canManage }: { canManage: boolean }) => (
    <div>{canManage ? "Participant editor" : "Participant list"}</div>
  ),
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
  it("writes an event's dates as dates, not ISO strings", () => {
    render(<ActivitiesCalendarView />);
    const table = within(screen.getByRole("table"));
    expect(table.queryByText(/2026-09-20/)).not.toBeInTheDocument();
    expect(table.getByText(/Sep 2026/)).toBeInTheDocument();
  });

  it("edits an existing event without clearing its organiser or creating a duplicate", async () => {
    const user = userEvent.setup();
    render(<ActivitiesCalendarView />);
    await user.click(within(screen.getByRole("table")).getByRole("button", { name: "rowActions" }));
    await user.click(await screen.findByRole("menuitem", { name: "edit" }));
    const dialog = within(screen.getByRole("dialog"));
    // By its accessible name: the required mark after the label is
    // aria-hidden, so the field is still read as "name".
    const input = dialog.getByRole("textbox", { name: "name" });
    expect(input).toBeRequired();
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
    await user.click(within(screen.getByRole("table")).getByRole("button", { name: "rowActions" }));
    await user.click(await screen.findByRole("menuitem", { name: "delete" }));
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
    expect(screen.queryByRole("button", { name: "rowActions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "add" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "participants.title" })).not.toBeInTheDocument();
  });

  it("opens an event's details and participants from its row for a read-only reader", async () => {
    mocks.canManage = false;
    const user = userEvent.setup();
    render(<ActivitiesCalendarView />);
    await user.click(within(screen.getByRole("table")).getByText("Science fair"));
    const dialog = within(screen.getByRole("dialog", { name: "Science fair" }));
    expect(dialog.getByText("Hall")).toBeInTheDocument();
    expect(dialog.getByText("Exhibition")).toBeInTheDocument();
    expect(dialog.getByRole("heading", { name: "participants.title" })).toBeInTheDocument();
    expect(dialog.getByText("Participant list")).toBeInTheDocument();
  });

  it("gives a manager the participant editor in the same dialog", async () => {
    const user = userEvent.setup();
    render(<ActivitiesCalendarView />);
    await user.click(within(screen.getByRole("table")).getByText("Science fair"));
    const dialog = within(screen.getByRole("dialog", { name: "Science fair" }));
    expect(dialog.getByText("Participant editor")).toBeInTheDocument();
  });

  it("names a missing title under its field instead of disabling Simpan", async () => {
    const user = userEvent.setup();
    render(<ActivitiesCalendarView />);
    await user.click(screen.getByRole("button", { name: "add" }));
    const dialog = within(screen.getByRole("dialog"));
    const submit = dialog.getByRole("button", { name: "submit" });
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(dialog.getByText("errors.name")).toBeInTheDocument();
    expect(dialog.getByText("errors.dates")).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
