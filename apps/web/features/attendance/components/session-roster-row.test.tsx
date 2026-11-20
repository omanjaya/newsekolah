import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { RosterItem, SessionDetail } from "../api";

import { SessionRosterRow } from "./session-roster-row";

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key} ${JSON.stringify(values)}` : key,
      { has: (key: string) => key === "blockedReasons.late_arrival_in_progress" },
    ),
  useLocale: () => "id",
}));

vi.mock("../../students/components/student-link", () => ({
  StudentLink: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("./session-row-actions-menu", () => ({ SessionRowActionsMenu: () => null }));
vi.mock("./student-year-recap", () => ({ StudentYearRecap: () => null }));

const statuses: SessionDetail["statuses"] = [
  { code: "H", label: "Hadir", color: "green", counts_as_present: true },
  { code: "S", label: "Sakit", color: "amber", counts_as_present: false },
];

function renderRow(item: Partial<RosterItem>, note: string, onNoteChange = vi.fn()) {
  renderRowOnly(item, note, onNoteChange);
  return screen.getByRole("textbox", { name: /noteFor/ });
}

function renderRowOnly(item: Partial<RosterItem>, note = "", onNoteChange = vi.fn()) {
  render(
    <ul>
      <SessionRosterRow
        item={{
          student_user_id: "s1",
          name: "Siswa Contoh",
          current_status: "S",
          blocked: false,
          ...item,
        }}
        changed={false}
        statuses={statuses}
        currentStatus="S"
        note={note}
        violationIds={[]}
        violationTypes={[]}
        violationTypesLoading={false}
        isPresent={false}
        disabled={false}
        onStatusChange={vi.fn()}
        onNoteChange={onNoteChange}
        onToggleViolation={vi.fn()}
      />
    </ul>,
  );
}

describe("SessionRosterRow", () => {
  it("shows a leave letter's number in a localized phrase instead of the API's English note", () => {
    const onNoteChange = vi.fn();
    const input = renderRow({ source: "leave" }, "leave letter 21/IZIN/XI/2026", onNoteChange);

    expect(input).toHaveValue('leaveLetterNote {"number":"21/IZIN/XI/2026"}');
    // The stored note is saved unchanged until the teacher edits it.
    expect(onNoteChange).not.toHaveBeenCalled();
  });

  it("shows a note without the API's prefix as it is written", () => {
    const input = renderRow({ source: "leave" }, "Surat dari dokter");

    expect(input).toHaveValue("Surat dari dokter");
  });

  it("locks a row a leave letter decides, says why, and offers no status to pick", () => {
    render(
      <ul>
        <SessionRosterRow
          item={{
            student_user_id: "s1",
            name: "Siswa Contoh",
            current_status: "S",
            source: "leave",
            locked: true,
          }}
          changed={false}
          statuses={statuses}
          currentStatus="S"
          note=""
          violationIds={[]}
          violationTypes={[]}
          violationTypesLoading={false}
          isPresent={false}
          disabled={false}
          onStatusChange={vi.fn()}
          onNoteChange={vi.fn()}
          onToggleViolation={vi.fn()}
        />
      </ul>,
    );

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("locked.leave")).toBeInTheDocument();
    for (const radio of within(row).getAllByRole("radio")) expect(radio).toBeDisabled();
    // No note field to type into: the save keeps the letter's status.
    expect(within(row).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("translates a blocked row's reason instead of printing the API's key", () => {
    render(
      <ul>
        <SessionRosterRow
          item={{
            student_user_id: "s1",
            name: "Siswa Contoh",
            blocked: true,
            blocked_reason: "late_arrival_in_progress",
          }}
          changed={false}
          statuses={statuses}
          currentStatus="H"
          note=""
          violationIds={[]}
          violationTypes={[]}
          violationTypesLoading={false}
          isPresent
          disabled={false}
          onStatusChange={vi.fn()}
          onNoteChange={vi.fn()}
          onToggleViolation={vi.fn()}
        />
      </ul>,
    );

    expect(screen.getByText("blockedReasons.late_arrival_in_progress")).toBeInTheDocument();
    expect(screen.queryByText("late_arrival_in_progress")).not.toBeInTheDocument();
  });

  it("falls back to the generic lock label for an unknown reason code", () => {
    renderRowOnly({ blocked: true, blocked_reason: "some_future_reason" });

    expect(screen.getByText("blocked")).toBeInTheDocument();
    expect(screen.queryByText("some_future_reason")).not.toBeInTheDocument();
  });
});
