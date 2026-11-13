import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { navigation } from "../lib/navigation";
import { filterNavigationFixture } from "../lib/navigation-access.fixture";
import { consolidateNavigation } from "../lib/navigation-workspaces";

import { MobileTabBar } from "./mobile-tab-bar";

const pathname = vi.fn(() => "/");

vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("./mobile-menu", () => ({ MobileMenu: () => null }));
vi.mock("./mobile-quick-actions", () => ({ MobileQuickActions: () => null }));

const items = consolidateNavigation(
  filterNavigationFixture(navigation, () => true, "staff"),
  {
    profileKind: "staff",
  },
);

afterEach(cleanup);

describe("MobileTabBar", () => {
  it("marks no tab current on a page that lives only in the menu", () => {
    pathname.mockReturnValue("/library/desk");
    const { container } = render(<MobileTabBar items={items} profile="staff" />);
    expect(container.querySelector("[aria-current='page']")).toBeNull();
  });

  it("does not let Beranda claim the library home", () => {
    pathname.mockReturnValue("/library");
    const { container } = render(<MobileTabBar items={items} profile="staff" />);
    expect(container.querySelector("[aria-current='page']")).toBeNull();
  });
});
