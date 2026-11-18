import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { RosterItem, SessionDetail } from "../api";

import { SessionRosterRow } from "./session-roster-row";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
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
  return screen.getByRole("textbox", { name: /noteFor/ });
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
});
