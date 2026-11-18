import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permissions: [] as string[], openReport: vi.fn() }));

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
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../reference/api", () => ({
  useLookup: () => new Map(),
  useClassesQuery: () => ({ data: { data: [{ id: "class-1", name: "X-A" }] } }),
}));
vi.mock("../../analytics/api", () => ({
  useStudentRiskQuery: () => ({ data: { class_id: "class-1" } }),
}));
vi.mock("../../school/components/user-form", () => ({ UserForm: () => null }));
vi.mock("./student-overview", () => ({
  StudentOverviewTab: () => <div>panel:overview</div>,
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("../../school/api", () => ({ useUserQuery: () => ({ data: undefined }) }));
vi.mock("../../mentoring/api", () => ({
  useMentorStudentSnapshotQuery: () => ({ data: undefined }),
}));
vi.mock("../../discipline/components/use-open-student-discipline-report", () => ({
  useOpenStudentDisciplineReport: () => ({ open: mocks.openReport, pending: false }),
}));
vi.mock("./student-tab-panels", () => {
  const panel = (name: string) => () => <div>{`panel:${name}`}</div>;
  return {
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

  it("offers the printable discipline report as a header action, not a loose button", () => {
    mocks.permissions = ["view_discipline"];
    render(<StudentProfileView studentId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: "printReport" }));
    expect(mocks.openReport).toHaveBeenCalledWith("s1");
  });

  it("leaves the report out without the discipline permission", () => {
    mocks.permissions = ["view_reports"];
    render(<StudentProfileView studentId="s1" />);
    expect(screen.queryByRole("button", { name: "printReport" })).toBeNull();
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
