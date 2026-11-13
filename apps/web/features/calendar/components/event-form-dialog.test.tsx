import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import type { CalendarEvent } from "../api";

import { EventFormDialog } from "./event-form-dialog";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const EVENT: CalendarEvent = {
  id: "event-1",
  name: "Ujian Tengah Semester",
  date: "2026-11-14",
  end_date: "2026-11-16",
  kind: "exam",
  grade_level_ids: [],
} as unknown as CalendarEvent;

afterEach(cleanup);

function renderDialog(props: { initial?: CalendarEvent; onDelete?: () => void }) {
  return render(
    <EventFormDialog
      open
      defaultDate="2026-11-14"
      gradeLevels={[]}
      pending={false}
      onOpenChange={vi.fn()}
      onSubmit={vi.fn()}
      {...props}
    />,
  );
}

it("offers delete inside the dialog when editing, where it can be clicked", async () => {
  const onDelete = vi.fn();
  renderDialog({ initial: EVENT, onDelete });
  const dialog = screen.getByRole("dialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "deleteEvent" }));
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(screen.getByDisplayValue("Ujian Tengah Semester")).toBeInTheDocument();
});

it("starts from the new event when the dialog is remounted for another one", () => {
  const other: CalendarEvent = { ...EVENT, id: "event-2", name: "Libur Nasional" };
  const props = {
    open: true,
    defaultDate: "2026-11-14",
    gradeLevels: [],
    pending: false,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(),
  };
  const view = render(<EventFormDialog key="a" {...props} initial={EVENT} />);
  expect(screen.getByDisplayValue("Ujian Tengah Semester")).toBeInTheDocument();
  view.rerender(<EventFormDialog key="b" {...props} initial={other} />);
  expect(screen.getByDisplayValue("Libur Nasional")).toBeInTheDocument();
});

it("does not offer delete for a new event", () => {
  renderDialog({ onDelete: vi.fn() });
  expect(screen.queryByRole("button", { name: "deleteEvent" })).not.toBeInTheDocument();
});
