import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarDays, Home } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NavItem } from "../lib/navigation";
import { NAV_GROUP } from "../lib/navigation-groups";

import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("../lib/tenant/tenant-provider", () => ({
  useTenant: () => ({ branding: undefined, displayName: "SMA Contoh", isLoading: false }),
}));

const ITEMS: NavItem[] = [
  { key: "home", labelKey: "nav.home", href: "/dashboard", icon: Home },
  {
    key: "schedule",
    labelKey: "nav.schedule",
    href: "/schedule",
    icon: CalendarDays,
    group: NAV_GROUP.academic,
  },
];

/** jsdom has none; the sidebar only uses it to place its scroll fades. */
class NoopResizeObserver {
  observe() {
    return undefined;
  }
  unobserve() {
    return undefined;
  }
  disconnect() {
    return undefined;
  }
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("Sidebar", () => {
  // The toggle was wrapped in a tooltip only on the rail, so switching
  // width remounted it and focus dropped to the page (audit r3-n13).
  it("keeps focus on the collapse toggle as the sidebar narrows and widens", async () => {
    const user = userEvent.setup();
    render(<Sidebar items={ITEMS} />);

    const toggle = screen.getByRole("button", { name: "sidebar.collapse" });
    toggle.focus();
    await user.keyboard("{Enter}");

    const expand = screen.getByRole("button", { name: "sidebar.expand" });
    expect(expand).toBe(toggle);
    expect(expand).toHaveFocus();
    expect(expand).toHaveAttribute("aria-expanded", "false");

    await user.keyboard(" ");
    const collapse = screen.getByRole("button", { name: "sidebar.collapse" });
    expect(collapse).toBe(toggle);
    expect(collapse).toHaveFocus();
  });
});
