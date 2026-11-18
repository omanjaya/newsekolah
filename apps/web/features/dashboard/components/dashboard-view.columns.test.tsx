import { render, screen, within } from "@testing-library/react";
import { Bell } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Where the home's cards land: the main and side columns from `lg`, one
 * column below it. The rest of the home is covered in
 * dashboard-view.test.tsx.
 */

const blocks = vi.hoisted(() => ({
  teacher: vi.fn(),
  checkIn: vi.fn(),
  leadership: vi.fn(),
  counselor: vi.fn(),
  empty: vi.fn(),
}));
const viewport = vi.hoisted(() => ({ desktop: true, twoColumn: true }));
const me = vi.hoisted(
  () =>
    ({
      id: "u1",
      name: "Guru Contoh",
      roles: [{ id: "r1", slug: "teacher", name: "Guru" }],
      permissions: [],
      duties: [],
      disabled_modules: [],
      profile_kind: "teacher",
      tenant: { timezone: "Asia/Jakarta" },
      active_academic_year: { id: "ay1", label: "2026/2027" },
    }) as unknown as Me,
);

vi.mock("../api", () => ({
  useDashboardData: () => ({ data: me, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("../../notifications/api", () => ({
  useUnreadCountQuery: () => ({ data: { count: 0 }, isLoading: false, isError: false }),
}));
vi.mock("../../inbox/use-action-inbox-count", () => ({
  useActionInboxSummary: () => ({ total: 0, isLoading: false, isError: false }),
}));
vi.mock("../../../lib/use-quick-actions", () => ({ useQuickActions: () => [] }));
vi.mock("../../announcements/components/announcement-feed", () => ({
  AnnouncementFeed: () => <div data-testid="announcement-feed" />,
}));
vi.mock("../home/blocks/teacher", () => ({ useTeacherBlock: blocks.teacher }));
vi.mock("../home/blocks/check-in", () => ({ useCheckInBlock: blocks.checkIn }));
vi.mock("../home/blocks/leadership", () => ({ useLeadershipBlock: blocks.leadership }));
vi.mock("../home/blocks/counselor", () => ({ useCounselorBlock: blocks.counselor }));
vi.mock("../home/blocks/homeroom", () => ({ useHomeroomBlock: blocks.empty }));
vi.mock("../home/blocks/student", () => ({ useStudentBlock: blocks.empty }));
vi.mock("../home/blocks/deputy", () => ({ useDeputyBlock: blocks.empty }));
vi.mock("../home/blocks/picket", () => ({ usePicketBlock: blocks.empty }));
vi.mock("../home/blocks/librarian", () => ({ useLibrarianBlock: blocks.empty }));
vi.mock("../home/blocks/gate", () => ({ useGateBlock: blocks.empty }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../components/use-is-desktop", () => ({
  useIsDesktop: () => viewport.desktop,
  useIsTwoColumn: () => viewport.twoColumn,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => true }),
  useFormatter: () => ({ dateTime: () => "Rabu, 18 November" }),
}));

import type { Me, PersonaBlock } from "../home/types";

import { DashboardView } from "./dashboard-view";

function block(parts: Partial<PersonaBlock> = {}): PersonaBlock {
  return { tiles: [], main: [], side: [], ...parts };
}

function slot(key: string, text: string) {
  return { key, node: <div>{text}</div> };
}

function tile(key: string, priority: number) {
  return { key, priority, label: key, value: "1", icon: Bell, tone: "green" as const };
}

/** The `dashboard-card-*` ids inside one column, top to bottom. */
function cards(column: "main" | "side"): (string | undefined)[] {
  return within(screen.getByTestId(`dashboard-${column}`))
    .queryAllByTestId(/^dashboard-card-/)
    .map((element) => element.dataset.testid);
}

describe("DashboardView columns", () => {
  beforeEach(() => {
    viewport.desktop = true;
    viewport.twoColumn = true;
    for (const hook of Object.values(blocks)) hook.mockReset().mockReturnValue(block());
    blocks.checkIn.mockReturnValue(block({ side: [slot("checkIn.card", "Check in")] }));
  });

  // In one column the side cards followed every main card, so the reader's
  // own check-in sank under the queue and the insight cards.
  it("puts the check-in card straight after the figures in one column", () => {
    viewport.desktop = false;
    viewport.twoColumn = false;
    blocks.leadership.mockReturnValue(
      block({
        tiles: [tile("t1", 90), tile("t2", 80)],
        main: [slot("school.queue", "Queue"), slot("school.atRisk", "At risk")],
      }),
    );
    render(<DashboardView />);

    const order = within(screen.getByTestId("dashboard-main"))
      .getAllByTestId(/^dashboard-(tiles|card-)/)
      .map((element) => element.dataset.testid);
    expect(order).toEqual([
      "dashboard-tiles",
      "dashboard-card-checkIn.card",
      "dashboard-card-school.queue",
      "dashboard-card-school.atRisk",
    ]);
    expect(cards("side")).not.toContain("dashboard-card-checkIn.card");
  });

  it("keeps the check-in card at the top of the side column beside the main one", () => {
    blocks.leadership.mockReturnValue(
      block({ main: [slot("school.queue", "Queue"), slot("school.atRisk", "At risk")] }),
    );
    render(<DashboardView />);
    expect(cards("side")[0]).toBe("dashboard-card-checkIn.card");
  });

  // A picket teacher's main column ended at the tiles beside a long side
  // column once the empty queue card was dropped.
  it("moves context cards into a main column that no queue card leads", () => {
    blocks.teacher.mockReturnValue(block({ side: [slot("teacher.today", "Today")] }));
    blocks.counselor.mockReturnValue(block({ main: [slot("counselor.atRisk", "Risk")] }));
    render(<DashboardView />);

    expect(cards("main")).toEqual([
      "dashboard-card-counselor.atRisk",
      "dashboard-card-teacher.today",
    ]);
    expect(cards("side")).toEqual(["dashboard-card-checkIn.card", "dashboard-card-announcements"]);
  });

  it("closes an otherwise empty main column with the announcements", () => {
    render(<DashboardView />);
    expect(cards("main")).toEqual(["dashboard-card-announcements"]);
    expect(cards("side")).not.toContain("dashboard-card-announcements");
  });
});
