import { act, cleanup, render, screen } from "@testing-library/react";
import { Zap } from "lucide-react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { mobileTabLayout } from "../lib/mobile-navigation";
import { navigation, type NavItem } from "../lib/navigation";
import { filterNavigationFixture } from "../lib/navigation-access.fixture";
import { consolidateNavigation } from "../lib/navigation-workspaces";

import { MobileTabBar } from "./mobile-tab-bar";

const pathname = vi.fn(() => "/");

vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("./mobile-menu", () => ({ MobileMenu: () => null }));
vi.mock("./mobile-quick-actions", () => ({
  MobileQuickActions: () => (
    <button type="button" aria-label="quick-actions-sheet">
      sheet
    </button>
  ),
}));

const staffItems = consolidateNavigation(
  filterNavigationFixture(navigation, () => true, "staff"),
  {
    profileKind: "staff",
  },
);

const TEACHER = [
  "view_schedules",
  "view_attendance",
  "manage_attendance",
  "manage_grades",
  "view_grades",
];
const teacherCan = (permission: string) => TEACHER.includes(permission);
const teacherItems = consolidateNavigation(
  filterNavigationFixture(navigation, teacherCan, "teacher"),
  { profileKind: "teacher", can: teacherCan },
);

function layoutOf(items: NavItem[], profile: "staff" | "teacher") {
  return mobileTabLayout({ items, profile, quickActions: [], canOpen: () => true });
}

function renderBar(items: NavItem[], profile: "staff" | "teacher") {
  return render(<MobileTabBar items={items} layout={layoutOf(items, profile)} />);
}

/**
 * jsdom has no layout: every list item of the bar is a 72 x 64 slot in a
 * row that starts 4px in (the track's padding), the way five slots sit
 * across a 360px phone.
 */
const SLOT_WIDTH = 72;
const TRACK_PADDING = 4;
const geometry = ["offsetLeft", "offsetTop", "offsetWidth", "offsetHeight"] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();

function slotBox(element: HTMLElement, key: (typeof geometry)[number]): number {
  if (element.tagName !== "LI") return 0;
  const index = Array.from(element.parentElement?.children ?? []).indexOf(element);
  switch (key) {
    case "offsetLeft":
      return TRACK_PADDING + index * SLOT_WIDTH;
    case "offsetTop":
      return 0;
    case "offsetWidth":
      return SLOT_WIDTH;
    case "offsetHeight":
      return 64;
  }
}

beforeAll(() => {
  for (const key of geometry) {
    originals.set(key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement) {
        return slotBox(this, key);
      },
    });
  }
});

afterAll(() => {
  for (const key of geometry) {
    const original = originals.get(key);
    if (original) Object.defineProperty(HTMLElement.prototype, key, original);
  }
});

afterEach(cleanup);

function pill(): HTMLElement {
  const carrier = screen.getByRole("navigation").querySelector<HTMLElement>("[data-tab-pill]");
  if (!carrier) throw new Error("no pill");
  return carrier;
}

describe("MobileTabBar", () => {
  it("marks no tab current on a page that lives only in the menu", () => {
    pathname.mockReturnValue("/library/desk");
    const { container } = renderBar(staffItems, "staff");
    expect(container.querySelector("[aria-current='page']")).toBeNull();
  });

  it("does not let Beranda claim the library home", () => {
    pathname.mockReturnValue("/library");
    const { container } = renderBar(staffItems, "staff");
    expect(container.querySelector("[aria-current='page']")).toBeNull();
  });

  it("puts two tabs, the raised centre action, one tab and Menu in that order", () => {
    pathname.mockReturnValue("/dashboard");
    renderBar(teacherItems, "teacher");
    const slots = screen.getByRole("navigation").querySelectorAll("ul > li");
    expect(slots).toHaveLength(5);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard",
      "/schedule",
      "/attendance",
      "/grading",
    ]);
    // The centre is named in full, its short label shown under it.
    const centre = screen.getByRole("link", { name: "app.shell.tabBar.centre.attendance.name" });
    expect(centre).toHaveTextContent("app.shell.tabBar.centre.attendance.label");
    expect(slots[2]).toContainElement(centre);
    expect(screen.getByRole("navigation")).toHaveAttribute("data-centre");
  });

  it("rests the pill on the active tab and slides it to the next one", async () => {
    pathname.mockReturnValue("/schedule");
    const { rerender } = renderBar(teacherItems, "teacher");
    const carrier = pill();
    expect(carrier.style.getPropertyValue("--indicator-x")).toBe(
      `${String(TRACK_PADDING + SLOT_WIDTH)}px`,
    );
    expect(carrier.style.getPropertyValue("--indicator-w")).toBe(`${String(SLOT_WIDTH)}px`);
    expect(carrier.parentElement).toHaveAttribute("data-indicator", "ready");

    pathname.mockReturnValue("/grading");
    await act(async () => {
      rerender(<MobileTabBar items={teacherItems} layout={layoutOf(teacherItems, "teacher")} />);
      // The mutation observer reports on a microtask.
      await Promise.resolve();
    });
    // Beranda, Jadwal, the centre, then Nilai in the fourth slot.
    expect(carrier.style.getPropertyValue("--indicator-x")).toBe(
      `${String(TRACK_PADDING + 3 * SLOT_WIDTH)}px`,
    );
    expect(
      screen.getAllByRole("link").find((link) => link.getAttribute("href") === "/grading"),
    ).toHaveAttribute("aria-current", "page");
  });

  it("moves the pill to Menu for a page reached through the menu", () => {
    pathname.mockReturnValue("/profile");
    renderBar(teacherItems, "teacher");
    expect(pill().style.getPropertyValue("--indicator-x")).toBe(
      `${String(TRACK_PADDING + 4 * SLOT_WIDTH)}px`,
    );
  });

  it("lights nothing on a page the menu does not list", () => {
    // /check-in is reached from the account menu and home, never from Menu.
    expect(teacherItems.find((item) => item.href === "/check-in")?.sidebarPlacement).toBe("hidden");
    pathname.mockReturnValue("/check-in");
    const { container } = renderBar(teacherItems, "teacher");
    expect(container.querySelector("[aria-current='page']")).toBeNull();
    expect(container.querySelector('[data-tab][data-state="active"]')).toBeNull();
    expect(pill().parentElement).not.toHaveAttribute("data-indicator");
  });

  it("marks the centre current on its own pages and gives no tab the pill", () => {
    pathname.mockReturnValue("/attendance/session-1");
    renderBar(teacherItems, "teacher");
    expect(
      screen.getByRole("link", { name: "app.shell.tabBar.centre.attendance.name" }),
    ).toHaveAttribute("aria-current", "page");
    expect(pill().parentElement).not.toHaveAttribute("data-indicator");
  });

  it("says the centre's pending count in its name and on the button", () => {
    pathname.mockReturnValue("/dashboard");
    const can = (permission: string) =>
      ["view_staff_attendance", "view_reports", "view_attendance"].includes(permission);
    const items = consolidateNavigation(filterNavigationFixture(navigation, can, "teacher"), {
      profileKind: "teacher",
      can,
    }).map((item) => (item.key === "inbox" ? { ...item, badgeCount: 3 } : item));
    renderBar(items, "teacher");
    const centre = screen.getByRole("link", { name: "app.shell.tabBar.withCount" });
    expect(centre).toHaveAttribute("href", "/inbox");
    expect(centre).toHaveTextContent("3");
  });

  it("hands the centre to the quick-action sheet when that is the reader's main act", () => {
    pathname.mockReturnValue("/dashboard");
    const layout = mobileTabLayout({
      items: staffItems,
      profile: "staff",
      quickActions: [],
      canOpen: () => true,
    });
    render(
      <MobileTabBar
        items={staffItems}
        layout={{ ...layout, centre: { id: "quick-actions", icon: Zap } }}
      />,
    );
    expect(screen.getByRole("button", { name: "quick-actions-sheet" })).toBeInTheDocument();
  });
});
