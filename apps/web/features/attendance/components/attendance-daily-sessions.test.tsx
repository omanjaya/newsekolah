import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AttendanceDailySessions } from "./attendance-daily-sessions";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(cleanup);

describe("AttendanceDailySessions", () => {
  it("keeps the entry of a student who left the class, and says so", () => {
    render(
      <AttendanceDailySessions
        sessions={[
          {
            session_id: "s1",
            class_id: "c1",
            class_name: "X-B",
            subject_id: "m1",
            subject_name: "Fisika",
            teacher_user_id: "t1",
            teacher_name: "Guru",
            period_label: "Jam 1 – Jam 2",
            submitted_at: "2026-11-20T01:00:00Z",
            entries: [
              { student_user_id: "a", name: "Citra", status_code: "S" },
              {
                student_user_id: "b",
                name: "Murid Pindah",
                status_code: "A",
                notes: "Tanpa kabar",
                left_class: true,
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Fisika/ }));

    expect(screen.getByText("Murid Pindah")).toBeInTheDocument();
    expect(screen.getByText("entryLeftClass · Tanpa kabar")).toBeInTheDocument();
    expect(screen.getAllByText(/entryLeftClass/)).toHaveLength(1);
  });
});
