import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as ReferenceApi from "../../reference/api";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const myGradesFixture = {
  term_id: "term-1",
  term_name: "Semester 1",
  scale: {
    version: 1,
    min: 0,
    max: 100,
    report_increase_max: 5,
    default_kktp: 75,
    round_decimal: 1,
  },
  stars: 0,
  subjects: [
    { subject_id: "s1", components: [], average: 80, report_score: 80 },
    { subject_id: "s2", components: [], average: 60, report_score: 60 },
    { subject_id: "s3", components: [], average: 90, report_score: 90 },
  ],
};

vi.mock("../api", () => ({
  useMyGradesQuery: () => ({ data: myGradesFixture, isLoading: false, error: null }),
  useMyStarsQuery: () => ({ data: { subjects: [] }, isLoading: false }),
  useTermsQuery: () => ({
    data: { data: [{ id: "term-1", name: "Semester 1" }] },
    isLoading: false,
  }),
}));

vi.mock("../../reference/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ReferenceApi>();
  return {
    ...actual,
    useSubjectsQuery: () => ({
      data: {
        data: [
          { id: "s1", name: "Matematika" },
          { id: "s2", name: "Bahasa Indonesia" },
          { id: "s3", name: "IPA" },
        ],
      },
      isLoading: false,
    }),
  };
});

import { MyGradesView } from "./my-grades-view";

afterEach(() => {
  cleanup();
});

describe("MyGradesView", () => {
  it("renders the three stat tiles (average, passing subjects, new scores)", () => {
    render(<MyGradesView />);

    expect(screen.getByTestId("my-grades-tiles")).toBeInTheDocument();
    expect(screen.getByTestId("my-grades-tile-average")).toBeInTheDocument();
    expect(screen.getByTestId("my-grades-tile-tuntas")).toBeInTheDocument();
    expect(screen.getByTestId("my-grades-tile-newScores")).toBeInTheDocument();
  });

  it("renders one bento card per subject, the odd one spanning the full row", () => {
    render(<MyGradesView />);

    expect(screen.getByTestId("my-grades-subject-card-s1")).toBeInTheDocument();
    expect(screen.getByTestId("my-grades-subject-card-s2")).toBeInTheDocument();
    expect(screen.getByTestId("my-grades-subject-card-s3")).toBeInTheDocument();

    // Three cards is odd -- the last one spans both columns (bentoCells).
    expect(screen.getByTestId("my-grades-subject-cell-s3")).toHaveClass("md:col-span-2");
    expect(screen.getByTestId("my-grades-subject-cell-s1")).not.toHaveClass("md:col-span-2");
  });

  it("shows the tuntas badge for a passing subject and not for a failing one", () => {
    render(<MyGradesView />);

    const passing = screen.getByTestId("my-grades-subject-card-s1");
    expect(passing.textContent).toContain("tuntasBadge");

    const failing = screen.getByTestId("my-grades-subject-card-s2");
    expect(failing.textContent).toContain("notTuntasBadge");
  });
});
