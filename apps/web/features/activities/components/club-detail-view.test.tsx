import type * as UiModule from "@newsekolah/ui";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canManage: true,
  leave: vi.fn(),
}));

vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/activities/clubs/club-1",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canManage,
  useSession: () => ({ me: undefined }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: () => new Map([["student-1", { id: "student-1", name: "Siswa Contoh" }]]),
}));
vi.mock("./club-detail-forms", () => ({
  JoinMemberForm: () => <div>Join form</div>,
  ScheduleMeetingForm: () => <div>Meeting form</div>,
}));
vi.mock("./meeting-attendance-editor", () => ({ MeetingAttendanceEditor: () => null }));
vi.mock("../api", () => ({
  useExtracurricularQuery: () => ({
    data: {
      id: "club-1",
      academic_year_id: "year-1",
      name: "Pramuka",
      description: "Kegiatan pramuka mingguan.",
      location: "Lapangan",
      capacity: 30,
      meeting_day: 5,
      meeting_start: "15:00",
      meeting_end: "16:30",
      is_active: true,
    },
  }),
  useClubMembersQuery: () => ({
    data: {
      data: [
        {
          id: "membership-1",
          extracurricular_id: "club-1",
          student_user_id: "student-1",
          joined_on: "2026-11-17",
          status: "active",
        },
      ],
    },
  }),
  useLeaveClubMutation: () => ({ mutateAsync: mocks.leave, isPending: false }),
  useMeetingsQuery: () => ({ data: { data: [] } }),
}));

import { ClubDetailView } from "./club-detail-view";

beforeEach(() => {
  mocks.canManage = true;
  mocks.leave.mockReset();
  window.history.replaceState(null, "", "/activities/clubs/club-1");
});

describe("ClubDetailView", () => {
  it("states the club's schedule and quota under its name", () => {
    render(<ClubDetailView clubId="club-1" />);
    expect(screen.getByText("weekdays.friday, 15.00 – 16.30")).toBeInTheDocument();
    expect(screen.getByText("facts.capacity", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Lapangan", { exact: false })).toBeInTheDocument();
  });

  it("enrolls a member from the header's action, not an inline form", async () => {
    const user = userEvent.setup();
    render(<ClubDetailView clubId="club-1" />);
    expect(screen.queryByText("Join form")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "members.add" }));
    expect(within(screen.getByRole("dialog")).getByText("Join form")).toBeInTheDocument();
  });

  it("dates a membership in words and asks before removing a member", async () => {
    const user = userEvent.setup();
    render(<ClubDetailView clubId="club-1" />);
    expect(screen.getByText("joinedSince")).toBeInTheDocument();
    expect(screen.queryByText(/2026-11-17/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "rowActions" }));
    await user.click(await screen.findByRole("menuitem", { name: "leave" }));
    expect(mocks.leave).not.toHaveBeenCalled();

    const confirm = within(screen.getByRole("dialog", { name: "leaveTitle" }));
    await user.click(confirm.getByRole("button", { name: "leave" }));
    expect(mocks.leave).toHaveBeenCalledWith(
      expect.objectContaining({ membershipId: "membership-1" }),
    );
  });
});
