import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import studentProfile from "../../../messages/features/studentProfile.id.json";

vi.mock("../../../lib/modules/use-module-enabled", () => ({ useModuleEnabled: () => true }));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => true,
  useSession: () => ({
    me: { permissions: ["view_discipline", "manage_counseling"], roles: [], duties: [] },
  }),
}));
vi.mock("../../discipline/api", () => ({
  useStudentDisciplineQuery: () => ({
    isLoading: false,
    data: {
      records: [
        {
          id: "r1",
          is_voided: false,
          // A calendar date: that day for everyone.
          occurred_on: "2026-07-13",
          type_name: "Terlambat",
          points: 5,
        },
      ],
      letters: [
        {
          id: "l1",
          // An instant: 23.30 UTC on the 12th is already the 13th in WITA.
          issued_at: "2026-07-12T23:30:00Z",
          level_label: "SP 1",
          letter_number: "001/SP/2026",
        },
      ],
    },
  }),
}));
vi.mock("../../discipline/api-counseling-extras", () => ({
  useStudentCounselingsQuery: () => ({ isLoading: false, data: { data: [] } }),
}));

import { StudentHistory } from "./student-overview";

function dateOfRow(title: string): string | null | undefined {
  return screen.getByText(title).closest("li")?.textContent;
}

describe("StudentHistory dates", () => {
  // Instants were cut to their UTC date (.slice(0, 10)), so a letter issued
  // early in the morning in Indonesia showed the day before.
  it("reads an instant in the school's zone and a calendar date as that day", () => {
    render(
      <NextIntlClientProvider
        locale="id"
        timeZone="Asia/Makassar"
        messages={{ app: { studentProfile } }}
        onError={(error) => {
          throw error;
        }}
      >
        <StudentHistory studentId="s1" />
      </NextIntlClientProvider>,
    );

    expect(dateOfRow("SP 1")).toContain("13 Jul 2026");
    expect(dateOfRow("Terlambat")).toContain("13 Jul 2026");
  });
});
