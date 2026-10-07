import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => mocks.permissions.includes(permission),
  useSession: () => ({ me: { permissions: mocks.permissions } }),
}));
vi.mock("../../reference/api", () => ({
  useDirectoryQuery: () => ({ data: { data: [] } }),
  useLookup: () => new Map(),
}));
vi.mock("../../school/api", () => ({ useUserQuery: () => ({ data: undefined }) }));
vi.mock("../../mentoring/api", () => ({
  useMentorStudentSnapshotQuery: () => ({ data: undefined }),
}));
vi.mock("../../discipline/components/student-discipline-view", () => ({
  StudentDisciplineReportButton: () => null,
}));
vi.mock("./student-tab-panels", () => {
  const panel = (name: string) => () => <div>{`panel:${name}`}</div>;
  return {
    StudentOverviewTab: panel("overview"),
    StudentAttendanceTab: panel("attendance"),
    StudentGradesTab: panel("grades"),
    StudentPermitsTab: panel("permits"),
    StudentDisciplineTab: panel("discipline"),
    StudentCounselingTab: panel("counseling"),
    StudentLibraryTab: panel("library"),
    StudentGuardiansTab: panel("guardians"),
  };
});

import { StudentProfileView } from "./student-profile-view";

function tabNames(): (string | null)[] {
  return screen.queryAllByRole("tab").map((tab) => tab.textContent);
}

describe("StudentProfileView tab visibility", () => {
  beforeEach(() => {
    mocks.permissions = [];
    window.history.replaceState(null, "", "/students/s1");
  });

  it("renders no tabs and an access message without any data permission", () => {
    render(<StudentProfileView studentId="s1" />);
    expect(tabNames()).toEqual([]);
    expect(screen.getByText("noAccessTitle")).toBeTruthy();
  });

  it("shows only the tabs the reader's permissions unlock", () => {
    mocks.permissions = ["view_discipline", "view_reports"];
    render(<StudentProfileView studentId="s1" />);
    expect(tabNames()).toEqual(["tabs.attendance", "tabs.discipline"]);
  });

  it("hides the counseling tab without the counseling permission", () => {
    mocks.permissions = ["view_discipline", "view_mentoring"];
    render(<StudentProfileView studentId="s1" />);
    expect(tabNames()).not.toContain("tabs.counseling");
  });

  it("shows the counseling tab with the counseling permission", () => {
    mocks.permissions = ["manage_counseling"];
    render(<StudentProfileView studentId="s1" />);
    expect(tabNames()).toEqual(["tabs.counseling"]);
  });

  it("opens the tab named in the URL when the reader may see it, else the first", () => {
    mocks.permissions = ["view_discipline", "view_reports"];
    window.history.replaceState(null, "", "/students/s1?tab=discipline");
    const { unmount } = render(<StudentProfileView studentId="s1" />);
    expect(screen.getByRole("tab", { name: "tabs.discipline" }).getAttribute("data-state")).toBe(
      "active",
    );
    unmount();

    window.history.replaceState(null, "", "/students/s1?tab=counseling");
    render(<StudentProfileView studentId="s1" />);
    expect(screen.getByRole("tab", { name: "tabs.attendance" }).getAttribute("data-state")).toBe(
      "active",
    );
  });
});
