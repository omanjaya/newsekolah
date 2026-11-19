import type * as ReactQuery from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Bell } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dashboardData = vi.hoisted(() => vi.fn());
const unreadCount = vi.hoisted(() => vi.fn());
const inboxSummary = vi.hoisted(() => vi.fn());
const quickActions = vi.hoisted(() => vi.fn());
const teacherBlock = vi.hoisted(() => vi.fn());
const checkInBlock = vi.hoisted(() => vi.fn());
const homeroomBlock = vi.hoisted(() => vi.fn());
const studentBlock = vi.hoisted(() => vi.fn());
const leadershipBlock = vi.hoisted(() => vi.fn());
const deputyBlock = vi.hoisted(() => vi.fn());
const picketBlock = vi.hoisted(() => vi.fn());
const counselorBlock = vi.hoisted(() => vi.fn());
const librarianBlock = vi.hoisted(() => vi.fn());
const gateBlock = vi.hoisted(() => vi.fn());
const refetchQueries = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQueryClient: () => ({ refetchQueries }),
}));

vi.mock("../api", () => ({ useDashboardData: dashboardData }));
vi.mock("../../notifications/api", () => ({ useUnreadCountQuery: unreadCount }));
vi.mock("../../inbox/use-action-inbox-count", () => ({ useActionInboxSummary: inboxSummary }));
vi.mock("../../../lib/use-quick-actions", () => ({ useQuickActions: quickActions }));
vi.mock("../../announcements/components/announcement-feed", () => ({
  AnnouncementFeed: () => <div data-testid="announcement-feed" />,
}));
vi.mock("../home/blocks/teacher", () => ({ useTeacherBlock: teacherBlock }));
vi.mock("../home/blocks/check-in", () => ({ useCheckInBlock: checkInBlock }));
vi.mock("../home/blocks/homeroom", () => ({ useHomeroomBlock: homeroomBlock }));
vi.mock("../home/blocks/student", () => ({ useStudentBlock: studentBlock }));
vi.mock("../home/blocks/leadership", () => ({ useLeadershipBlock: leadershipBlock }));
vi.mock("../home/blocks/deputy", () => ({ useDeputyBlock: deputyBlock }));
vi.mock("../home/blocks/picket", () => ({ usePicketBlock: picketBlock }));
vi.mock("../home/blocks/counselor", () => ({ useCounselorBlock: counselorBlock }));
vi.mock("../home/blocks/librarian", () => ({ useLibrarianBlock: librarianBlock }));
vi.mock("../home/blocks/gate", () => ({ useGateBlock: gateBlock }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));

const viewport = vi.hoisted(() => ({ desktop: false, twoColumn: false }));
vi.mock("../../../components/use-is-desktop", () => ({
  useIsDesktop: () => viewport.desktop,
  useIsWideTwoColumn: () => viewport.twoColumn,
}));
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
      { has: () => true },
    ),
  useFormatter: () => ({ dateTime: () => "Sabtu, 26 September" }),
}));

import { QueryError } from "../../../components/query-error";
import { resetHomeEntranceForTests } from "../home/entrance";
import { HERO_PRIORITY, type Me, type PersonaBlock } from "../home/types";

import { DashboardView } from "./dashboard-view";

const me = {
  id: "u1",
  name: "Budi Santoso",
  roles: [{ id: "r1", slug: "teacher", name: "Guru" }],
  permissions: ["manage_attendance", "view_attendance", "submit_leave_requests"],
  duties: [],
  disabled_modules: [],
  profile_kind: "teacher",
  tenant: { timezone: "Asia/Jakarta" },
  active_academic_year: { id: "ay1", label: "2026/2027" },
} as unknown as Me;

function emptyBlock(): PersonaBlock {
  return { tiles: [], main: [], side: [] };
}

function tile(key: string, priority: number, href?: string) {
  return {
    key,
    priority,
    label: key,
    value: "1",
    icon: Bell,
    tone: "green" as const,
    ...(href ? { href } : {}),
  };
}

function urgentHero() {
  return {
    key: "teacher.now",
    priority: HERO_PRIORITY.teacherNowPending,
    eyebrow: "Sekarang",
    title: "Matematika · X-A",
    action: { label: "Isi presensi", href: "/attendance" },
  };
}

function slot(key: string, text: string) {
  return { key, node: <div>{text}</div> };
}

describe("DashboardView", () => {
  beforeEach(() => {
    viewport.desktop = true;
    viewport.twoColumn = true;
    dashboardData
      .mockReset()
      .mockReturnValue({ data: me, isLoading: false, isError: false, refetch: vi.fn() });
    unreadCount
      .mockReset()
      .mockReturnValue({ data: { count: 2 }, isLoading: false, isError: false });
    inboxSummary.mockReset().mockReturnValue({ total: 0, isLoading: false, isError: false });
    quickActions.mockReset().mockReturnValue([]);
    for (const block of [
      teacherBlock,
      checkInBlock,
      homeroomBlock,
      studentBlock,
      leadershipBlock,
      deputyBlock,
      picketBlock,
      counselorBlock,
      librarianBlock,
      gateBlock,
    ]) {
      block.mockReset().mockReturnValue(emptyBlock());
    }
  });

  it("greets the reader by first name as the page heading", () => {
    render(<DashboardView />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent('greeting:{"name":"Budi"}');
  });

  it("renders the highest-priority hero with its one primary action", () => {
    teacherBlock.mockReturnValue({
      ...emptyBlock(),
      hero: {
        key: "teacher.now",
        priority: 100,
        eyebrow: "Sekarang",
        title: "Matematika · X-A",
        action: { label: "Isi presensi", href: "/attendance" },
      },
    });
    leadershipBlock.mockReturnValue({
      ...emptyBlock(),
      hero: { key: "school.summary", priority: 50, eyebrow: "Ringkasan", title: "Sekolah" },
    });

    render(<DashboardView />);

    const hero = screen.getByTestId("dashboard-hero");
    expect(within(hero).getByRole("heading", { name: "Matematika · X-A" })).toBeInTheDocument();
    expect(within(hero).getByRole("link", { name: "Isi presensi" })).toHaveAttribute(
      "href",
      "/attendance",
    );
    expect(screen.queryByText("Sekolah")).not.toBeInTheDocument();
  });

  it("never sends a hero action to a page the reader cannot open", () => {
    leadershipBlock.mockReturnValue({
      ...emptyBlock(),
      hero: {
        key: "school.summary",
        priority: 50,
        eyebrow: "Presensi",
        title: "3 dari 5 kelas",
        action: { label: "Buka monitor", href: "/monitor" },
        secondaryAction: { label: "Buka laporan", href: "/reports" },
      },
    });
    // A teacher without view_monitor_presence or view_reports.
    render(<DashboardView />);

    const hero = screen.getByTestId("dashboard-hero");
    expect(within(hero).queryByRole("link", { name: "Buka monitor" })).not.toBeInTheDocument();
  });

  it("opens on a calm hero when no persona has anything due", () => {
    render(<DashboardView />);
    const hero = screen.getByTestId("dashboard-hero");
    expect(within(hero).getByRole("heading", { name: "fallback.title" })).toBeInTheDocument();
    expect(within(hero).getByRole("link", { name: "fallback.action" })).toHaveAttribute(
      "href",
      "/notifications",
    );
  });

  it("points the calm hero at the action inbox when something waits there", () => {
    inboxSummary.mockReturnValue({ total: 3, isLoading: false, isError: false });
    render(<DashboardView />);
    expect(
      within(screen.getByTestId("dashboard-hero")).getByRole("heading", {
        name: 'fallback.inboxTitle:{"count":3}',
      }),
    ).toBeInTheDocument();
  });

  it("says part of the home failed instead of a false all-clear, with one retry", async () => {
    refetchQueries.mockReset().mockResolvedValue(undefined);
    teacherBlock.mockReturnValue({ ...emptyBlock(), failed: true });
    render(<DashboardView />);

    const hero = screen.getByTestId("dashboard-hero");
    expect(within(hero).getByRole("heading", { name: "failed.title" })).toBeInTheDocument();
    expect(within(hero).queryByText("fallback.title")).not.toBeInTheDocument();
    await userEvent.click(within(hero).getByRole("button", { name: "failed.action" }));

    expect(refetchQueries).toHaveBeenCalledTimes(1);
    const filters = refetchQueries.mock.calls[0]?.[0] as {
      type: string;
      predicate: (query: { state: { status: string } }) => boolean;
    };
    expect(filters.type).toBe("active");
    expect(filters.predicate({ state: { status: "error" } })).toBe(true);
    expect(filters.predicate({ state: { status: "success" } })).toBe(false);
  });

  it("shows the retry is running until the refetch settles", async () => {
    let settle: () => void = () => undefined;
    refetchQueries.mockReset().mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    teacherBlock.mockReturnValue({ ...emptyBlock(), failed: true });
    render(<DashboardView />);

    const hero = screen.getByTestId("dashboard-hero");
    const retry = within(hero).getByRole("button", { name: "failed.action" });
    expect(retry).not.toHaveAttribute("aria-busy", "true");
    await userEvent.click(retry);

    expect(retry).toHaveAttribute("aria-busy", "true");
    expect(retry).toBeDisabled();

    await act(async () => {
      settle();
      await Promise.resolve();
    });
    expect(retry).not.toHaveAttribute("aria-busy", "true");
    expect(retry).toBeEnabled();
  });

  it("replaces a calm persona hero with the failure notice when a block failed", () => {
    teacherBlock.mockReturnValue({
      ...emptyBlock(),
      hero: {
        key: "teacher.idle",
        priority: HERO_PRIORITY.teacherIdle,
        tone: "neutral",
        eyebrow: "Mengajar",
        title: "Tidak ada jadwal",
      },
    });
    homeroomBlock.mockReturnValue({ ...emptyBlock(), failed: true });
    render(<DashboardView />);

    const hero = screen.getByTestId("dashboard-hero");
    expect(within(hero).getByRole("heading", { name: "failed.title" })).toBeInTheDocument();
  });

  it("keeps an urgent hero from a block that loaded when another block failed", () => {
    teacherBlock.mockReturnValue({
      ...emptyBlock(),
      hero: {
        key: "teacher.now",
        priority: HERO_PRIORITY.teacherNowPending,
        eyebrow: "Sekarang",
        title: "Matematika · X-A",
        action: { label: "Isi presensi", href: "/attendance" },
      },
    });
    homeroomBlock.mockReturnValue({ ...emptyBlock(), failed: true });
    render(<DashboardView />);

    const hero = screen.getByTestId("dashboard-hero");
    expect(within(hero).getByRole("heading", { name: "Matematika · X-A" })).toBeInTheDocument();
    expect(within(hero).queryByText("failed.title")).not.toBeInTheDocument();
  });

  it("says a read failed under an urgent hero that stayed, with the home's one retry", async () => {
    refetchQueries.mockReset().mockResolvedValue(undefined);
    teacherBlock.mockReturnValue({ ...emptyBlock(), hero: urgentHero() });
    studentBlock.mockReturnValue({ ...emptyBlock(), failed: true });
    render(<DashboardView />);

    const notice = screen.getByTestId("dashboard-failed-notice");
    expect(notice).toHaveTextContent("failed.title");
    expect(notice).toHaveTextContent("failed.meta");
    expect(screen.getAllByRole("button", { name: "failed.action" })).toHaveLength(1);
    await userEvent.click(within(notice).getByRole("button", { name: "failed.action" }));
    expect(refetchQueries).toHaveBeenCalledTimes(1);
  });

  it("shows no failure notice while every read loaded", () => {
    teacherBlock.mockReturnValue({ ...emptyBlock(), hero: urgentHero() });
    render(<DashboardView />);
    expect(screen.queryByTestId("dashboard-failed-notice")).not.toBeInTheDocument();
  });

  it("leaves each failed card's own retry out while the home offers one", () => {
    teacherBlock.mockReturnValue({
      ...emptyBlock(),
      failed: true,
      main: [{ key: "teacher.today", node: <QueryError retry={() => undefined} /> }],
    });
    render(<DashboardView />);

    const card = screen.getByTestId("dashboard-card-teacher.today");
    expect(within(card).getByRole("alert")).toHaveTextContent("title");
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /failed\.action|actions\.retry/ })).toHaveLength(
      1,
    );
  });

  it("keeps a card's own retry when the home has nothing to retry", () => {
    teacherBlock.mockReturnValue({
      ...emptyBlock(),
      main: [{ key: "teacher.today", node: <QueryError retry={() => undefined} /> }],
    });
    render(<DashboardView />);
    const card = screen.getByTestId("dashboard-card-teacher.today");
    expect(within(card).getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
  });

  it("moves focus to the hero's action once a retry replaces the button that had it", async () => {
    refetchQueries.mockReset().mockResolvedValue(undefined);
    teacherBlock.mockReturnValue({ ...emptyBlock(), failed: true });
    const { rerender } = render(<DashboardView />);

    const retry = screen.getByRole("button", { name: "failed.action" });
    await userEvent.click(retry);
    expect(retry).toHaveFocus();

    teacherBlock.mockReturnValue({ ...emptyBlock(), hero: urgentHero() });
    await act(async () => {
      rerender(<DashboardView />);
      await Promise.resolve();
    });

    expect(screen.queryByRole("button", { name: "failed.action" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Isi presensi" })).toHaveFocus();
  });

  it("shows the failure notice when the action inbox count failed and nothing else is due", () => {
    inboxSummary.mockReturnValue({ total: 0, isLoading: false, isError: true });
    render(<DashboardView />);
    expect(
      within(screen.getByTestId("dashboard-hero")).getByRole("heading", { name: "failed.title" }),
    ).toBeInTheDocument();
  });

  it("holds the hero and stat row as a skeleton while a persona is still loading", () => {
    teacherBlock.mockReturnValue({ ...emptyBlock(), pending: true });
    render(<DashboardView />);
    expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-hero")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-tiles")).not.toBeInTheDocument();
  });

  it("plays the staggered entrance on the first visit only", () => {
    resetHomeEntranceForTests();
    teacherBlock.mockReturnValue({ ...emptyBlock(), main: [slot("teacher", "Teacher main")] });

    const first = render(<DashboardView />);
    expect(screen.getByTestId("dashboard-hero")).toHaveClass("animate-enter");
    expect(screen.getByTestId("dashboard-card-teacher")).toHaveClass("animate-enter");
    first.unmount();

    // Coming back to the home: only the page template's own entrance plays.
    render(<DashboardView />);
    expect(screen.getByTestId("dashboard-hero")).not.toHaveClass("animate-enter");
    expect(screen.getByTestId("dashboard-card-teacher")).not.toHaveClass("animate-enter");
  });

  it("keeps the entrance for the first settled visit when the first one never loaded", () => {
    resetHomeEntranceForTests();
    teacherBlock.mockReturnValue({ ...emptyBlock(), pending: true });
    render(<DashboardView />).unmount();

    teacherBlock.mockReturnValue(emptyBlock());
    render(<DashboardView />);
    expect(screen.getByTestId("dashboard-hero")).toHaveClass("animate-enter");
  });

  it("shows only the top four tiles when the active blocks offer six", () => {
    teacherBlock.mockReturnValue({
      ...emptyBlock(),
      tiles: [tile("t1", 90), tile("t2", 80), tile("t5", 10)],
    });
    homeroomBlock.mockReturnValue({ ...emptyBlock(), tiles: [tile("t3", 70), tile("t4", 60)] });

    render(<DashboardView />);

    for (const key of ["t1", "t2", "t3", "t4"]) {
      expect(screen.getByTestId(`dashboard-tile-${key}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("dashboard-tile-t5")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-tile-common.notifications")).not.toBeInTheDocument();
  });

  it("rounds out a short stat row with the notifications tile", () => {
    teacherBlock.mockReturnValue({ ...emptyBlock(), tiles: [tile("t1", 90)] });
    render(<DashboardView />);
    expect(screen.getByTestId("dashboard-tile-t1")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-tile-common.notifications")).toBeInTheDocument();
  });

  // On a phone the strip pairs its figures, so the filler took a row of its
  // own to repeat the header bell's count.
  it("leaves the notifications filler out of a phone's strip", () => {
    viewport.desktop = false;
    viewport.twoColumn = false;
    teacherBlock.mockReturnValue({
      ...emptyBlock(),
      tiles: [tile("t1", 90), tile("t2", 80)],
    });
    render(<DashboardView />);
    expect(screen.getByTestId("dashboard-tile-t1")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-tile-t2")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-tile-common.notifications")).not.toBeInTheDocument();
  });

  it("shows no stat row when the notifications tile would stand alone", () => {
    // The header bell already carries the count (the gate home has no figures).
    render(<DashboardView />);
    expect(screen.getByTestId("dashboard-hero")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-tiles")).not.toBeInTheDocument();
  });

  it("puts task cards in the main column and context cards in the side column", () => {
    teacherBlock.mockReturnValue({ ...emptyBlock(), main: [slot("teacher", "Teacher main")] });
    counselorBlock.mockReturnValue({
      ...emptyBlock(),
      main: [slot("counselor", "Counselor main")],
      side: [slot("counselor.atRisk", "At risk")],
    });
    checkInBlock.mockReturnValue({ ...emptyBlock(), side: [slot("checkIn", "Check in")] });

    render(<DashboardView />);

    const main = screen.getByTestId("dashboard-main");
    const side = screen.getByTestId("dashboard-side");
    expect(within(main).getByText("Teacher main")).toBeInTheDocument();
    expect(within(main).getByText("Counselor main")).toBeInTheDocument();
    expect(within(side).getByText("At risk")).toBeInTheDocument();
    expect(within(side).getByText("Check in")).toBeInTheDocument();
    // Announcements close the side column.
    const sideCards = within(side)
      .getAllByTestId(/^dashboard-card-/)
      .map((element) => element.dataset.testid);
    expect(sideCards.at(-1)).toBe("dashboard-card-announcements");
  });

  it("keeps main cards in block-hook order", () => {
    teacherBlock.mockReturnValue({ ...emptyBlock(), main: [slot("teacher", "1")] });
    studentBlock.mockReturnValue({ ...emptyBlock(), main: [slot("student", "2")] });
    leadershipBlock.mockReturnValue({ ...emptyBlock(), main: [slot("leadership", "3")] });
    picketBlock.mockReturnValue({ ...emptyBlock(), main: [slot("picket", "4")] });
    counselorBlock.mockReturnValue({ ...emptyBlock(), main: [slot("counselor", "5")] });
    homeroomBlock.mockReturnValue({ ...emptyBlock(), main: [slot("homeroom", "6")] });

    render(<DashboardView />);

    const order = within(screen.getByTestId("dashboard-main"))
      .getAllByTestId(/^dashboard-card-/)
      .map((element) => element.dataset.testid);
    expect(order).toEqual([
      "dashboard-card-teacher",
      "dashboard-card-student",
      "dashboard-card-leadership",
      "dashboard-card-picket",
      "dashboard-card-counselor",
      "dashboard-card-homeroom",
    ]);
  });

  it("hides the announcements card while the module is off", () => {
    dashboardData.mockReturnValue({
      data: { ...me, disabled_modules: ["announcements"] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<DashboardView />);
    expect(screen.queryByTestId("dashboard-card-announcements")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("keeps the announcements card when only another module is off", () => {
    dashboardData.mockReturnValue({
      data: { ...me, disabled_modules: ["library"] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<DashboardView />);
    expect(screen.getByTestId("announcement-feed")).toBeInTheDocument();
  });

  it("lists shortcuts in the side column, leaving out what the hero or check-in card offer", () => {
    quickActions.mockReturnValue([
      { id: "scan-qr", labelKey: "scanQr", icon: Bell, path: "/scan" },
      { id: "check-in", labelKey: "checkIn", icon: Bell, path: "/check-in" },
      { id: "submit-leave", labelKey: "submitLeave", icon: Bell, path: "/leave-requests" },
    ]);
    teacherBlock.mockReturnValue({
      ...emptyBlock(),
      hero: {
        key: "teacher.now",
        priority: 100,
        eyebrow: "Sekarang",
        title: "Matematika",
        action: { label: "Pindai", href: "/scan" },
      },
    });
    checkInBlock.mockReturnValue({ ...emptyBlock(), side: [slot("checkIn", "Check in")] });

    render(<DashboardView />);

    const card = screen.getByTestId("dashboard-card-shortcuts");
    const labels = within(card)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels).toEqual(["actions.submitLeave"]);
  });

  it("shows an error with retry when the profile fails to load", () => {
    dashboardData.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("x"),
      refetch: vi.fn(),
    });
    render(<DashboardView />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
