import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";

import attendanceReports from "../../../messages/features/attendanceReports.id.json";

import { MonthlyAttendanceTable } from "./monthly-attendance-table";

vi.mock("../api", () => ({
  useMonthlyAttendanceSummaryQuery: () => ({
    data: {
      data: [
        {
          date: "2027-04-05",
          status_code: "S",
          expected_sessions: 2,
          submitted_sessions: 0,
          complete: true,
        },
        {
          date: "2027-04-06",
          status_code: "H",
          expected_sessions: 2,
          submitted_sessions: 2,
          complete: true,
        },
      ],
      totals: { H: 1, S: 1 },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

// The Tanggal column read "2027-04-05": the API's calendar date as it came
// (audit r7v-auth-attendance-R2). It now reads as the rest of the app
// writes a date, on the very day whatever the reader's time zone.
it("lists each day as a localized date, not the API's ISO string", () => {
  render(
    <NextIntlClientProvider
      locale="id"
      timeZone="Asia/Makassar"
      messages={{ app: { attendanceReports } }}
      onError={(error) => {
        throw error;
      }}
    >
      <MonthlyAttendanceTable studentId="student-1" month="2027-04" />
    </NextIntlClientProvider>,
  );

  expect(screen.getByRole("cell", { name: "Sen, 5 Apr 2027" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Sel, 6 Apr 2027" })).toBeInTheDocument();
  expect(screen.queryByText("2027-04-05")).not.toBeInTheDocument();
});
