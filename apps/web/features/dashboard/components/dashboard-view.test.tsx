import { render, screen } from "@testing-library/react";
import { Bell } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dashboardData = vi.hoisted(() => vi.fn());
const unreadCount = vi.hoisted(() => vi.fn());
const teacherBlock = vi.hoisted(() => vi.fn());
const checkInBlock = vi.hoisted(() => vi.fn());
const homeroomBlock = vi.hoisted(() => vi.fn());
const studentBlock = vi.hoisted(() => vi.fn());
const leadershipBlock = vi.hoisted(() => vi.fn());
const picketBlock = vi.hoisted(() => vi.fn());
const counselorBlock = vi.hoisted(() => vi.fn());
const librarianBlock = vi.hoisted(() => vi.fn());

vi.mock("../api", () => ({ useDashboardData: dashboardData }));
vi.mock("../../notifications/api", () => ({ useUnreadCountQuery: unreadCount }));
vi.mock("../../announcements/components/announcement-feed", () => ({
  AnnouncementFeed: () => <div data-testid="announcement-feed" />,
}));
vi.mock("../home/blocks/teacher", () => ({ useTeacherBlock: teacherBlock }));
vi.mock("../home/blocks/check-in", () => ({ useCheckInBlock: checkInBlock }));
vi.mock("../home/blocks/homeroom", () => ({ useHomeroomBlock: homeroomBlock }));
vi.mock("../home/blocks/student", () => ({ useStudentBlock: studentBlock }));
vi.mock("../home/blocks/leadership", () => ({ useLeadershipBlock: leadershipBlock }));
vi.mock("../home/blocks/picket", () => ({ usePicketBlock: picketBlock }));
vi.mock("../home/blocks/counselor", () => ({ useCounselorBlock: counselorBlock }));
vi.mock("../home/blocks/librarian", () => ({ useLibrarianBlock: librarianBlock }));
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
      { has: () => true },
    ),
  useFormatter: () => ({ dateTime: () => "Sabtu, 26 September" }),
}));

import type { Me, PersonaBlock } from "../home/types";

import { DashboardView } from "./dashboard-view";

const me = {
  id: "u1",
  name: "Budi",
  roles: [{ id: "r1", slug: "teacher", name: "Guru" }],
  permissions: [],
  duties: [],
  profile_kind: "teacher",
  tenant: { timezone: "Asia/Jakarta" },
  active_academic_year: { id: "ay1", label: "2026/2027" },
} as unknown as Me;

function emptyBlock(): PersonaBlock {
  return { tiles: [], left: [], right: [] };
}

function tile(key: string, priority: number) {
  return {
    key,
    priority,
    label: key,
    value: "1",
    icon: Bell,
    tone: "green" as const,
  };
}

describe("DashboardView", () => {
  beforeEach(() => {
    dashboardData
      .mockReset()
      .mockReturnValue({ data: me, isLoading: false, isError: false, refetch: vi.fn() });
    unreadCount
      .mockReset()
      .mockReturnValue({ data: { count: 2 }, isLoading: false, isError: false });
    teacherBlock.mockReset().mockReturnValue(emptyBlock());
    checkInBlock.mockReset().mockReturnValue(emptyBlock());
    homeroomBlock.mockReset().mockReturnValue(emptyBlock());
    studentBlock.mockReset().mockReturnValue(emptyBlock());
    leadershipBlock.mockReset().mockReturnValue(emptyBlock());
    picketBlock.mockReset().mockReturnValue(emptyBlock());
    counselorBlock.mockReset().mockReturnValue(emptyBlock());
    librarianBlock.mockReset().mockReturnValue(emptyBlock());
  });

  it("renders the highest-priority hero as the page heading", () => {
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
      hero: {
        key: "school.summary",
        priority: 50,
        eyebrow: "Ringkasan",
        title: "Ringkasan sekolah",
        action: { label: "Lihat monitor", href: "/monitor" },
      },
    });

    render(<DashboardView />);

    expect(screen.getByRole("heading", { name: "Matematika · X-A" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ringkasan sekolah" })).not.toBeInTheDocument();
  });

  it("shows only four tiles when the active blocks offer six", () => {
    teacherBlock.mockReturnValue({
      ...emptyBlock(),
      tiles: [tile("t1", 90), tile("t2", 85), tile("t3", 80)],
    });
    leadershipBlock.mockReturnValue({
      ...emptyBlock(),
      tiles: [tile("t4", 75), tile("t5", 70), tile("t6", 65)],
    });

    render(<DashboardView />);

    expect(screen.getByText("t1")).toBeInTheDocument();
    expect(screen.getByText("t2")).toBeInTheDocument();
    expect(screen.getByText("t3")).toBeInTheDocument();
    expect(screen.getByText("t4")).toBeInTheDocument();
    expect(screen.queryByText("t5")).not.toBeInTheDocument();
    expect(screen.queryByText("t6")).not.toBeInTheDocument();
  });

  it("keeps left slots in block-hook order (teacher, homeroom, student, leadership, picket, counselor, librarian)", () => {
    const leftSlot = (key: string, text: string) => ({ key, node: <p>{text}</p> });
    teacherBlock.mockReturnValue({ ...emptyBlock(), left: [leftSlot("teacher", "Teacher left")] });
    homeroomBlock.mockReturnValue({
      ...emptyBlock(),
      left: [leftSlot("homeroom", "Homeroom left")],
    });
    studentBlock.mockReturnValue({ ...emptyBlock(), left: [leftSlot("student", "Student left")] });
    leadershipBlock.mockReturnValue({
      ...emptyBlock(),
      left: [leftSlot("leadership", "Leadership left")],
    });
    picketBlock.mockReturnValue({ ...emptyBlock(), left: [leftSlot("picket", "Picket left")] });
    counselorBlock.mockReturnValue({
      ...emptyBlock(),
      left: [leftSlot("counselor", "Counselor left")],
    });
    librarianBlock.mockReturnValue({
      ...emptyBlock(),
      left: [leftSlot("librarian", "Librarian left")],
    });

    render(<DashboardView />);

    const bodyText = document.body.textContent;
    const order = [
      "Teacher left",
      "Homeroom left",
      "Student left",
      "Leadership left",
      "Picket left",
      "Counselor left",
      "Librarian left",
    ].map((text) => bodyText.indexOf(text));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("still shows the greeting, a notification tile and announcements for a parent with no personas", () => {
    render(<DashboardView />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent('greeting:{"name":"Budi"}');
    expect(screen.getByText("tiles.notifications.label")).toBeInTheDocument();
    expect(screen.getByTestId("announcement-feed")).toBeInTheDocument();
  });

  it("lays out a single tile (the notifications filler) in one column on lg", () => {
    render(<DashboardView />);

    expect(screen.getByTestId("dashboard-tiles")).toHaveClass(
      "grid",
      "grid-cols-1",
      "gap-3",
      "lg:grid-cols-1",
    );
  });

  it("lays out n tiles in n equal lg columns", () => {
    teacherBlock.mockReturnValue({
      ...emptyBlock(),
      tiles: [tile("t1", 90), tile("t2", 85)],
    });
    leadershipBlock.mockReturnValue({
      ...emptyBlock(),
      tiles: [tile("t3", 75)],
    });

    render(<DashboardView />);

    // t1, t2, t3 plus the notifications filler tile = 4 tiles -> lg:grid-cols-4.
    expect(screen.getByTestId("dashboard-tiles")).toHaveClass("lg:grid-cols-4");
  });

  it("spans the last tile full-width on small screens when the tile count is odd", () => {
    teacherBlock.mockReturnValue({
      ...emptyBlock(),
      tiles: [tile("t1", 90), tile("t2", 85)],
    });

    render(<DashboardView />);

    // t1, t2 plus the notifications filler tile (lowest priority, so it is
    // last after merging) = 3 tiles (odd).
    expect(screen.getByTestId("dashboard-tiles")).toHaveClass("lg:grid-cols-3");
    expect(screen.getByTestId("dashboard-tile-t1")).not.toHaveClass("col-span-2");
    expect(screen.getByTestId("dashboard-tile-t2")).not.toHaveClass("col-span-2");
    expect(screen.getByTestId("dashboard-tile-common.notifications")).toHaveClass(
      "col-span-2",
      "lg:col-span-1",
    );
  });

  it("spans the only card (announcements) full width when no persona block adds a card", () => {
    render(<DashboardView />);

    expect(screen.getByTestId("dashboard-card-announcements")).toHaveClass("lg:col-span-2");
  });

  it("pairs two cards half-width with no span override", () => {
    const leftSlot = (key: string, text: string) => ({ key, node: <p>{text}</p> });
    teacherBlock.mockReturnValue({ ...emptyBlock(), left: [leftSlot("teacher", "Teacher left")] });

    render(<DashboardView />);

    // teacher.left + announcements = 2 cards (even) -> neither spans both columns.
    expect(screen.getByTestId("dashboard-card-teacher")).not.toHaveClass("lg:col-span-2");
    expect(screen.getByTestId("dashboard-card-announcements")).not.toHaveClass("lg:col-span-2");
  });

  it("spans the last card full-width when the card count is odd", () => {
    const leftSlot = (key: string, text: string) => ({ key, node: <p>{text}</p> });
    const rightSlot = (key: string, text: string) => ({ key, node: <p>{text}</p> });
    teacherBlock.mockReturnValue({ ...emptyBlock(), left: [leftSlot("teacher", "Teacher left")] });
    homeroomBlock.mockReturnValue({
      ...emptyBlock(),
      right: [rightSlot("homeroom", "Homeroom right")],
    });

    render(<DashboardView />);

    // teacher.left + homeroom.right + announcements = 3 cards (odd) -> the
    // last one (announcements) spans both columns; the first two stay half.
    expect(screen.getByTestId("dashboard-card-teacher")).not.toHaveClass("lg:col-span-2");
    expect(screen.getByTestId("dashboard-card-homeroom")).not.toHaveClass("lg:col-span-2");
    expect(screen.getByTestId("dashboard-card-announcements")).toHaveClass("lg:col-span-2");
  });

  it("orders cards as every left slot, then every right slot, then announcements last", () => {
    const leftSlot = (key: string, text: string) => ({ key, node: <p>{text}</p> });
    const rightSlot = (key: string, text: string) => ({ key, node: <p>{text}</p> });
    teacherBlock.mockReturnValue({ ...emptyBlock(), left: [leftSlot("teacher", "Teacher left")] });
    homeroomBlock.mockReturnValue({
      ...emptyBlock(),
      left: [leftSlot("homeroom", "Homeroom left")],
    });
    librarianBlock.mockReturnValue({
      ...emptyBlock(),
      right: [rightSlot("librarian", "Librarian right")],
    });

    render(<DashboardView />);

    const cardsGrid = screen.getByTestId("dashboard-cards");
    const order = [...cardsGrid.children].map((child) => child.getAttribute("data-testid"));
    expect(order).toEqual([
      "dashboard-card-teacher",
      "dashboard-card-homeroom",
      "dashboard-card-librarian",
      "dashboard-card-announcements",
    ]);
  });
});
