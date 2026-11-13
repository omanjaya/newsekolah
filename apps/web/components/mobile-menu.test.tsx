import { fireEvent, render, screen } from "@testing-library/react";
import { Home, Users } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/school/classes" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { MobileMenu } from "./mobile-menu";

describe("mobile menu", () => {
  it("exposes supplied destinations by group and closes after selecting a page", () => {
    render(
      <MobileMenu
        items={[
          { key: "home", labelKey: "Home", href: "/dashboard", icon: Home },
          {
            key: "classes",
            labelKey: "Classes",
            href: "/school/classes",
            icon: Users,
            group: "Academic",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "app.shell.mobileMenu.title" }));
    expect(screen.getByRole("heading", { name: "Academic" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Classes" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    fireEvent.click(screen.getByRole("link", { name: "Classes" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not list the page being viewed a second time under recent", () => {
    window.localStorage.setItem(
      "newsekolah:navigation:test-scope",
      JSON.stringify({ favorites: [], recent: ["classes", "home"] }),
    );
    render(
      <MobileMenu
        scope="test-scope"
        items={[
          { key: "home", labelKey: "Home", href: "/dashboard", icon: Home },
          { key: "classes", labelKey: "Classes", href: "/school/classes", icon: Users },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "app.shell.mobileMenu.title" }));
    expect(screen.getAllByRole("link", { name: "Classes" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Home" })).toHaveLength(2);
    window.localStorage.removeItem("newsekolah:navigation:test-scope");
  });
});
