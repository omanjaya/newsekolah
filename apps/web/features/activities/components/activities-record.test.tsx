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

  it("wraps a long name to a second line instead of cutting it", () => {
    render(
      <ActivitiesRecord
        clubs={query([
          {
            id: "m1",
            extracurricular_id: "club-1",
            student_user_id: "s1",
            joined_on: "2026-07-20",
            status: "active" as const,
            club_name: "Kelompok Ilmiah Remaja dan Penelitian Lingkungan",
          },
        ])}
        events={query([
          {
            id: "e1",
            academic_year_id: "y1",
            name: "Perkemahan Sabtu Minggu Gugus Depan Sekolah",
            description: "",
            location: "",
            start_date: "2026-11-28",
            end_date: "2026-11-28",
          },
        ])}
        achievements={query([
          {
            id: "a1",
            student_user_id: "s1",
            competition_name: "Olimpiade Kimia Tingkat Provinsi Bali",
            level: "province" as const,
            placement: "Juara 2",
            achieved_on: "2026-11-21",
          },
        ])}
      />,
    );
    for (const name of [
      "Kelompok Ilmiah Remaja dan Penelitian Lingkungan",
      "Perkemahan Sabtu Minggu Gugus Depan Sekolah",
      "Olimpiade Kimia Tingkat Provinsi Bali",
    ]) {
      const title = screen.getByText(name);
      expect(title).toHaveClass("line-clamp-2");
      expect(title).not.toHaveClass("truncate");
    }
    // The date is one of the achievement's facts, not a slot beside its name.
    const facts = screen.getByText("Juara 2", { exact: false }).closest("[id]");
    expect(facts).toHaveTextContent("21 November 2026");
    expect(
      screen
        .getByText("Olimpiade Kimia Tingkat Provinsi Bali")
        .closest("li")
        ?.querySelector('[data-slot="list-row-trailing"]'),
    ).toBeNull();
  });

  it("says so when a list is empty, and leaves out activities when not given", () => {
    render(<ActivitiesRecord clubs={query([])} achievements={query([])} />);
    expect(screen.getByText("clubsEmpty")).toBeInTheDocument();
    expect(screen.getByText("achievementsEmpty")).toBeInTheDocument();
    expect(screen.queryByText("eventsTitle")).not.toBeInTheDocument();
  });

  it("says no achievement is recorded at all when given every year's", () => {
    render(<ActivitiesRecord clubs={query([])} achievements={query([])} achievementsAllYears />);
    expect(screen.getByText("achievementsEmptyAllYears")).toBeInTheDocument();
    expect(screen.queryByText("achievementsEmpty")).not.toBeInTheDocument();
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
