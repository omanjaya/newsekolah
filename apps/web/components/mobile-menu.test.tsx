import { fireEvent, render, screen } from "@testing-library/react";
import { Home, LogIn, Users } from "lucide-react";
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
          {
            key: "schedule",
            labelKey: "Schedule",
            href: "/schedule",
            icon: Users,
            group: "Academic",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "app.shell.mobileMenu.title" }));
    expect(screen.getByRole("heading", { name: "Academic" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Classes" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link")).toHaveLength(3);
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

  it("folds a group the reader sees only one page of into the top-level rows, as the sidebar does", () => {
    render(
      <MobileMenu
        items={[
          { key: "home", labelKey: "Home", href: "/dashboard", icon: Home },
          { key: "loans", labelKey: "Loans", href: "/library/me", icon: Users, group: "Library" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "app.shell.mobileMenu.title" }));
    expect(screen.queryByRole("heading", { name: "Library" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Loans" })).toBeInTheDocument();
  });

  it("lists the quick actions the bar's centre does not cover, and closes after one", () => {
    render(
      <MobileMenu
        items={[{ key: "home", labelKey: "Home", href: "/dashboard", icon: Home }]}
        quickActions={[
          { id: "check-in", labelKey: "checkIn", icon: LogIn, path: "/check-in" },
          {
            id: "record-violation",
            labelKey: "recordViolation",
            icon: Users,
            path: "/discipline/violations",
            query: { quick: "record-violation" },
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "app.shell.mobileMenu.title" }));
    expect(screen.getByRole("heading", { name: "app.quickActions.title" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "actions.checkIn" })).toHaveAttribute(
      "href",
      "/check-in",
    );
    expect(screen.getByRole("link", { name: "actions.recordViolation" })).toHaveAttribute(
      "href",
      "/discipline/violations?quick=record-violation",
    );
    fireEvent.click(screen.getByRole("link", { name: "actions.checkIn" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows no quick-action section when there is nothing to add", () => {
    render(
      <MobileMenu items={[{ key: "home", labelKey: "Home", href: "/dashboard", icon: Home }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "app.shell.mobileMenu.title" }));
    expect(
      screen.queryByRole("heading", { name: "app.quickActions.title" }),
    ).not.toBeInTheDocument();
  });

  it("carries the count of what waits behind entries that only live in the menu", () => {
    render(
      <MobileMenu
        items={[{ key: "home", labelKey: "Home", href: "/dashboard", icon: Home }]}
        badgeCount={4}
      />,
    );
    expect(screen.getByRole("button", { name: /app\.shell\.mobileMenu\.title/ })).toHaveTextContent(
      "4",
    );
  });

  it("shows favorite stars only while editing favorites", () => {
    render(
      <MobileMenu
        scope="edit-scope"
        items={[
          { key: "home", labelKey: "Home", href: "/dashboard", icon: Home },
          { key: "classes", labelKey: "Classes", href: "/school/classes", icon: Users },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "app.shell.mobileMenu.title" }));
    expect(
      screen.queryByRole("button", { name: "app.shell.phoneMenu.favoriteAdd" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "app.shell.phoneMenu.edit" }));
    const stars = screen.getAllByRole("button", { name: "app.shell.phoneMenu.favoriteAdd" });
    expect(stars).toHaveLength(2);
    const [first] = stars;
    if (first) fireEvent.click(first);
    expect(
      screen.getAllByRole("button", { name: "app.shell.phoneMenu.favoriteRemove" }).length,
    ).toBeGreaterThan(0);
    window.localStorage.removeItem("newsekolah:navigation:edit-scope");
  });
});
