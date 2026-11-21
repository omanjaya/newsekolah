import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const disabled = vi.hoisted(() => new Set<string>());

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key} ${JSON.stringify(values)}` : key,
      { has: () => false },
    ),
}));
vi.mock("../../../lib/modules/use-module-enabled", () => ({
  useModuleEnabled: (module: string) => !disabled.has(module),
}));
vi.mock("../../reference/api", () => ({
  useSubjectsQuery: () => ({ data: { data: [] } }),
  useLookup: () => new Map([["sub-1", { name: "Matematika" }]]),
}));

import type { MentorStudentSnapshot } from "../api";

import {
  SnapshotActivitiesSection,
  SnapshotAttendanceSection,
  SnapshotDisciplineSection,
  SnapshotGradesSection,
} from "./student-snapshot-sections";

const snapshot = {
  discipline_points: 0,
  discipline_active_count: 0,
  published_subjects: [],
  score_decimals: 2,
} as unknown as MentorStudentSnapshot;

describe("mentor snapshot sections with switched-off modules", () => {
  beforeEach(() => {
    disabled.clear();
  });

  it("shows the discipline and grades sections while both modules are on", () => {
    render(
      <>
        <SnapshotDisciplineSection snapshot={snapshot} />
        <SnapshotGradesSection snapshot={snapshot} />
      </>,
    );
    expect(screen.getByText("discipline.title")).toBeInTheDocument();
    expect(screen.getByText("grades.title")).toBeInTheDocument();
  });

  it("leaves the discipline figures out instead of showing zeros while discipline is off", () => {
    disabled.add("discipline");
    render(<SnapshotDisciplineSection snapshot={snapshot} />);
    expect(screen.queryByText("discipline.title")).not.toBeInTheDocument();
    expect(screen.queryByText("discipline.points")).not.toBeInTheDocument();
  });

  it("leaves the grades out while grading is off", () => {
    disabled.add("grading");
    render(<SnapshotGradesSection snapshot={snapshot} />);
    expect(screen.queryByText("grades.title")).not.toBeInTheDocument();
  });
});

describe("mentor snapshot activities", () => {
  beforeEach(() => {
    disabled.clear();
  });

  const withActivities = {
    ...snapshot,
    achievements: [
      {
        id: "a1",
        student_user_id: "s1",
        competition_name: "Lomba Pionering",
        level: "city",
        placement: "Juara 1",
        achieved_on: "2026-11-02",
      },
    ],
    clubs: [
      {
        id: "m1",
        extracurricular_id: "c1",
        student_user_id: "s1",
        club_name: "Pramuka",
        joined_on: "2026-11-20",
        status: "active",
      },
    ],
  } as unknown as MentorStudentSnapshot;

  it("shows the mentee's clubs and achievements to the guru wali", () => {
    render(<SnapshotActivitiesSection snapshot={withActivities} />);
    expect(screen.getByRole("heading", { name: "activities.title" })).toBeInTheDocument();
    expect(screen.getByText("Pramuka")).toBeInTheDocument();
    expect(screen.getByText("Lomba Pionering")).toBeInTheDocument();
  });

  it("leaves the activities out while activities is off", () => {
    disabled.add("activities");
    render(<SnapshotActivitiesSection snapshot={withActivities} />);
    expect(screen.queryByText("activities.title")).not.toBeInTheDocument();
  });
});

describe("mentor snapshot attendance", () => {
  it("gives each status count its unit instead of a bare number", () => {
    render(
      <SnapshotAttendanceSection
        snapshot={{ ...snapshot, attendance_by_status: { H: 18, INCOMPLETE: 2 } }}
      />,
    );
    expect(screen.getByText('attendance.days {"count":18}')).toBeInTheDocument();
    expect(screen.getByText('attendance.days {"count":2}')).toBeInTheDocument();
  });
});

describe("mentor snapshot grades", () => {
  beforeEach(() => {
    disabled.clear();
  });

  it("prints a fractional score with the Indonesian decimal comma", () => {
    render(
      <SnapshotGradesSection
        snapshot={{ ...snapshot, published_subjects: [{ subject_id: "sub-1", score: 78.5 }] }}
      />,
    );
    expect(screen.getByText("Matematika")).toBeInTheDocument();
    expect(screen.getByText("78,5")).toBeInTheDocument();
    expect(screen.queryByText("78.5")).not.toBeInTheDocument();
  });

  // r4v-grades-discipline-R1: a published 55.08 read 55,1 here while the
  // gradebook and the student's own grades page showed 55,08.
  it("writes a score at the grading scale's precision", () => {
    const grades = [{ subject_id: "sub-1", score: 55.08 }];
    const { unmount } = render(
      <SnapshotGradesSection
        snapshot={{ ...snapshot, published_subjects: grades, score_decimals: 2 }}
      />,
    );
    expect(screen.getByText("55,08")).toBeInTheDocument();
    unmount();

    render(
      <SnapshotGradesSection
        snapshot={{ ...snapshot, published_subjects: grades, score_decimals: 1 }}
      />,
    );
    expect(screen.getByText("55,1")).toBeInTheDocument();
  });
});
