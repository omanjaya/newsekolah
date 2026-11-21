import { ApiError } from "@newsekolah/api-client";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../../messages/features";
import { getMessages } from "../../../lib/i18n/get-messages";

// The real AppPage, not the stub: the bug was the trail it derives from
// the path (/mentoring/groups/<id> sits under the school-wide group list),
// which a guru wali without view_mentoring cannot open.

const state = vi.hoisted<{
  pathname: string;
  permissions: string[];
  groupError: unknown;
  snapshotError: unknown;
}>(() => ({
  pathname: "/mentoring/groups/g1",
  permissions: [],
  groupError: null,
  snapshotError: null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../../lib/session/session-provider", () => {
  const me = () => ({
    id: "u1",
    name: "Guru Piket",
    profile_kind: "staff",
    roles: [{ id: "r1", slug: "teacher", name: "Guru" }],
    duties: [],
    disabled_modules: [],
    permissions: state.permissions,
    tenant: { timezone: "Asia/Makassar" },
  });
  return {
    useSession: () => ({ me: me() }),
    useCan: (permission: string) => state.permissions.includes(permission),
  };
});
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("./mentor-group-members-panel", () => ({ MentorGroupMembersPanel: () => null }));
vi.mock("./mentor-meeting-notes-panel", () => ({ MentorMeetingNotesPanel: () => null }));
vi.mock("./mentor-term-summary-panel", () => ({ MentorTermSummaryPanel: () => null }));
vi.mock("./student-snapshot-sections", () => ({
  SnapshotActivitiesSection: () => null,
  SnapshotAttendanceSection: () => null,
  SnapshotDisciplineSection: () => null,
  SnapshotGradesSection: () => null,
}));

function result(data: unknown, error: unknown) {
  return error
    ? {
        data: undefined,
        isLoading: false,
        isPending: false,
        isError: true,
        error,
        refetch: vi.fn(),
      }
    : { data, isLoading: false, isPending: false, isError: false, error: null, refetch: vi.fn() };
}

vi.mock("../api", () => ({
  useGroupSizeLimitQuery: () => ({ data: undefined }),
  useMentorGroupMembersQuery: () => ({ data: undefined }),
  useMentorGroupQuery: () =>
    result(
      { id: "g1", name: "Kelompok Piket", mentor_user_id: "u1", academic_year_id: "y1" },
      state.groupError,
    ),
  useMentorStudentSnapshotQuery: () =>
    result(
      {
        student_user_id: "s1",
        student_name: "Siswa Contoh",
        class_name: "X-A",
        clubs: [],
        achievements: [],
        published_subjects: [],
        score_decimals: 2,
      },
      state.snapshotError,
    ),
}));

import { MentorGroupDetailView } from "./mentor-group-detail-view";
import { MentorStudentView } from "./mentor-student-view";

const messages = getMessages("id");

function renderPage(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="id" messages={messages as never}>
      {node}
    </NextIntlClientProvider>,
  );
}

function trailLinks(): { label: string; href: string | null }[] {
  const trail = screen.getByRole("navigation", { name: "Navigasi halaman" });
  return within(trail)
    .getAllByRole("link")
    .map((link) => ({ label: link.textContent, href: link.getAttribute("href") }));
}

afterEach(() => {
  cleanup();
  state.pathname = "/mentoring/groups/g1";
  state.permissions = [];
  state.groupError = null;
  state.snapshotError = null;
});

describe("a mentor group's trail", () => {
  it("leads a guru wali without view_mentoring to their own groups", () => {
    state.permissions = ["manage_mentoring"];
    renderPage(<MentorGroupDetailView groupId="g1" />);

    expect(trailLinks()).toEqual([{ label: "Mentoring saya", href: "/mentoring/my-groups" }]);
  });

  it("leads the school-wide reader to every group", () => {
    state.permissions = ["view_mentoring"];
    renderPage(<MentorGroupDetailView groupId="g1" />);

    expect(trailLinks()).toEqual([{ label: "Kelompok mentoring", href: "/mentoring/groups" }]);
  });

  it("agrees with the back button on the no-access and not-found pages", () => {
    state.permissions = ["manage_mentoring"];
    state.groupError = new ApiError({ status: 403, code: "FORBIDDEN", message: "x" });
    renderPage(<MentorGroupDetailView groupId="g1" />);
    expect(trailLinks()).toEqual([{ label: "Mentoring saya", href: "/mentoring/my-groups" }]);
    cleanup();

    state.groupError = new ApiError({ status: 404, code: "NOT_FOUND", message: "x" });
    renderPage(<MentorGroupDetailView groupId="g1" />);
    expect(trailLinks()).toEqual([{ label: "Mentoring saya", href: "/mentoring/my-groups" }]);
  });

  it("names the reader's own groups, not the full list, while a group fails to load", () => {
    state.permissions = ["manage_mentoring"];
    state.groupError = new ApiError({ status: 500, code: "INTERNAL", message: "x" });
    renderPage(<MentorGroupDetailView groupId="g1" />);

    expect(trailLinks()).toEqual([{ label: "Mentoring saya", href: "/mentoring/my-groups" }]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mentoring saya");
    expect(document.title).toContain("Mentoring saya");
  });

  it("names the group while a student fails to load", () => {
    state.permissions = ["manage_mentoring"];
    state.pathname = "/mentoring/groups/g1/students/s1";
    state.snapshotError = new ApiError({ status: 500, code: "INTERNAL", message: "x" });
    renderPage(<MentorStudentView groupId="g1" studentId="s1" />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Kelompok Piket");
  });

  it("leads a guru wali from a student back through their own groups", () => {
    state.permissions = ["manage_mentoring"];
    state.pathname = "/mentoring/groups/g1/students/s1";
    renderPage(<MentorStudentView groupId="g1" studentId="s1" />);

    expect(trailLinks()).toEqual([
      { label: "Mentoring saya", href: "/mentoring/my-groups" },
      { label: "Kelompok Piket", href: "/mentoring/groups/g1" },
    ]);
  });
});
