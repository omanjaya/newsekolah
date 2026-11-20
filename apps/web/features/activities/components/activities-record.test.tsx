import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActivitiesRecord } from "./activities-record";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));

const query = <T,>(rows: T[]) => ({ data: { data: rows }, isLoading: false, isError: false });

describe("ActivitiesRecord", () => {
  it("lists a student's clubs, activities and achievements", () => {
    render(
      <ActivitiesRecord
        clubs={query([
          {
            id: "m1",
            extracurricular_id: "club-1",
            student_user_id: "s1",
            joined_on: "2026-07-20",
            status: "active" as const,
            club_name: "Pramuka",
          },
        ])}
        events={query([
          {
            id: "e1",
            academic_year_id: "y1",
            name: "Persami",
            description: "",
            location: "Bumi perkemahan",
            start_date: "2026-11-28",
            end_date: "2026-11-29",
          },
        ])}
        achievements={query([
          {
            id: "a1",
            student_user_id: "s1",
            competition_name: "Lomba Pionering",
            level: "city" as const,
            placement: "Juara 1",
            achieved_on: "2026-11-15",
          },
        ])}
      />,
    );
    expect(screen.getByText("Pramuka")).toBeInTheDocument();
    expect(screen.getByText("Persami")).toBeInTheDocument();
    expect(screen.getByText("Bumi perkemahan", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Lomba Pionering")).toBeInTheDocument();
    expect(screen.getByText("Juara 1", { exact: false })).toBeInTheDocument();
  });

  it("says so when a list is empty, and leaves out activities when not given", () => {
    render(<ActivitiesRecord clubs={query([])} achievements={query([])} />);
    expect(screen.getByText("clubsEmpty")).toBeInTheDocument();
    expect(screen.getByText("achievementsEmpty")).toBeInTheDocument();
    expect(screen.queryByText("eventsTitle")).not.toBeInTheDocument();
  });

  it("shows a load error for a list that failed", () => {
    render(
      <ActivitiesRecord
        clubs={{ data: undefined, isLoading: false, isError: true }}
        achievements={query([])}
      />,
    );
    expect(screen.getByText("loadError")).toBeInTheDocument();
  });
});
