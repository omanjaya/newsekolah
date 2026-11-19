import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as ReferenceApi from "../../reference/api";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));

const profileKind = vi.hoisted(() => ({ value: "student" }));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: { profile_kind: profileKind.value, permissions: [], roles: [], modules: [] },
  }),
}));

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
    {
      subject_id: "s3",
      components: [
        { code: "TG1", kind: "formative", description: "Kuis bab 3: pecahan", score: 90 },
        { code: "UH1", kind: "formative", score: 90 },
      ],
      average: 90,
      report_score: 90,
    },
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
  it("sums the term up in one strip, stars included", () => {
    render(<MyGradesView />);

    expect(screen.getByTestId("my-grades-tiles")).toBeInTheDocument();
    expect(screen.getByTestId("my-grades-tile-average")).toBeInTheDocument();
    expect(screen.getByTestId("my-grades-tile-tuntas")).toBeInTheDocument();
    expect(screen.getByTestId("my-grades-tile-newScores")).toBeInTheDocument();
    expect(screen.getByTestId("my-grades-tile-stars")).toBeInTheDocument();
  });

  it("sets each report score large with a meter against the KKTP", () => {
    render(<MyGradesView />);

    const failing = screen.getByTestId("my-grades-subject-card-s2");
    expect(failing.textContent).toContain("60,0");
    expect(failing.textContent).toContain('kktpLine:{"kktp":75}');
    expect(failing.textContent).toContain('belowKktpBy:{"points":"15,0"}');
    expect(screen.getAllByRole("meter")).toHaveLength(3);
    // The KKTP is a line on each meter's scale, not only words in its label.
    const line = failing.querySelector<HTMLElement>("[data-slot=progress-marker]");
    expect(line?.style.getPropertyValue("--marker")).toBe("0.75");
  });

  it("sends a staff member to grading instead of a student's empty state", () => {
    profileKind.value = "teacher";
    render(<MyGradesView />);

    expect(screen.getByText("studentsOnlyTitle")).toBeInTheDocument();
    expect(screen.queryByTestId("my-grades-tiles")).not.toBeInTheDocument();
    profileKind.value = "student";
  });

  it("titles a component by the teacher's description, keeping its code beside the kind", () => {
    render(<MyGradesView />);

    const card = within(screen.getByTestId("my-grades-subject-card-s3"));
    expect(card.getByText("Kuis bab 3: pecahan")).toBeInTheDocument();
    expect(card.getByText("TG1 · formative")).toBeInTheDocument();
    // Without a description the code stays the title.
    expect(card.getByText("UH1")).toBeInTheDocument();
  });

  it("shows the tuntas badge for a passing subject and not for a failing one", () => {
    render(<MyGradesView />);

    const passing = screen.getByTestId("my-grades-subject-card-s1");
    expect(passing.textContent).toContain("tuntasBadge");

    const failing = screen.getByTestId("my-grades-subject-card-s2");
    expect(failing.textContent).toContain("notTuntasBadge");
  });
});
