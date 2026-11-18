import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const disabled = vi.hoisted(() => new Set<string>());

vi.mock("next-intl", () => ({
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
  useLookup: () => new Map(),
}));

import type { MentorStudentSnapshot } from "../api";

import {
  SnapshotAttendanceSection,
  SnapshotDisciplineSection,
  SnapshotGradesSection,
} from "./student-snapshot-sections";

const snapshot = {
  discipline_points: 0,
  discipline_active_count: 0,
  published_subjects: [],
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
