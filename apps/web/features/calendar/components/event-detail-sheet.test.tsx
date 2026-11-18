import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CalendarEvent } from "../api";

import { EventDetailSheet } from "./event-detail-sheet";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    dateTime: (date: Date) => date.toDateString(),
    dateTimeRange: (from: Date, to: Date) => `${from.toDateString()} - ${to.toDateString()}`,
  }),
}));

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));

const EVENT = {
  id: "event-1",
  name: "Penilaian tengah semester ganjil kelas X dan XI",
  date: "2026-11-09",
  end_date: "2026-11-14",
  kind: "exam",
  grade_level_ids: ["grade-10"],
} as CalendarEvent;

const LEVELS = [
  { id: "grade-10", name: "Kelas X" },
  { id: "grade-11", name: "Kelas XI" },
] as never[];

describe("EventDetailSheet", () => {
  it("shows a reader the full name, the dates, the kind and the grade levels, read only", () => {
    render(
      <EventDetailSheet
        event={EVENT}
        gradeLevels={LEVELS}
        canManage={false}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const sheet = screen.getByRole("dialog", { name: EVENT.name });
    expect(within(sheet).getByText("kind.exam")).toBeInTheDocument();
    expect(within(sheet).getByText("Kelas X")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "editEvent" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "deleteEvent" })).not.toBeInTheDocument();
  });

  it("gives a manager edit and delete for the event", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <EventDetailSheet
        event={EVENT}
        gradeLevels={LEVELS}
        canManage
        onClose={vi.fn()}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );
    const sheet = screen.getByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: "editEvent" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "deleteEvent" }));
    expect(onEdit).toHaveBeenCalledWith(EVENT);
    expect(onDelete).toHaveBeenCalledWith(EVENT);
  });

  it("says an event without grade levels is for the whole school", () => {
    render(
      <EventDetailSheet
        event={{ ...EVENT, grade_level_ids: [] }}
        gradeLevels={LEVELS}
        canManage={false}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("detail.wholeSchool")).toBeInTheDocument();
  });
});
