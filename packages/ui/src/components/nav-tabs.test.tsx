import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { NavTabs, type NavTabsLinkProps } from "./nav-tabs.js";

const ITEMS = [
  { href: "/staff-attendance", label: "Hari ini" },
  { href: "/staff-attendance/schedule", label: "Jadwal kerja", current: true },
  { href: "/staff-attendance/corrections", label: "Koreksi", count: 4 },
];

describe("NavTabs", () => {
  it("is a navigation landmark of links, the current one marked with aria-current", () => {
    render(<NavTabs aria-label="Bagian presensi pegawai" items={ITEMS} />);
    const nav = screen.getByRole("navigation", { name: "Bagian presensi pegawai" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jadwal kerja" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Hari ini" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Koreksi 4" })).toHaveAttribute(
      "href",
      "/staff-attendance/corrections",
    );
  });

  it("uses no tab roles, so nothing points at panels that do not exist", () => {
    render(<NavTabs aria-label="Bagian" items={ITEMS} />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("aria-controls");
    }
  });

  it("renders each link through the caller's renderLink (a router link)", () => {
    const renderLink = vi.fn(({ href, className, children, ...rest }: NavTabsLinkProps) => (
      <a data-router="" href={href} className={className} aria-current={rest["aria-current"]}>
        {children}
      </a>
    ));
    render(<NavTabs aria-label="Bagian" items={ITEMS} renderLink={renderLink} />);
    expect(renderLink).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("link", { name: "Hari ini" })).toHaveAttribute("data-router");
  });

  it("renders nothing for a single item", () => {
    const { container } = render(
      <NavTabs aria-label="Absensi" items={[{ href: "/check-in", label: "Absensi saya" }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shares the Tabs look: one row that scrolls, a sliding indicator", () => {
    render(<NavTabs aria-label="Bagian" items={ITEMS} variant="underline" />);
    const scroller = screen.getByRole("navigation").firstElementChild;
    expect(scroller).toHaveClass("overflow-x-auto", "scroll-fade-x");
    expect(scroller?.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("runs an underline strip into the phone's gutter so the next tab peeks in", () => {
    render(<NavTabs aria-label="Bagian" items={ITEMS} variant="underline" />);
    const scroller = screen.getByRole("navigation").firstElementChild;
    // Out to the screen's edges, the first tab where it was, a longer end fade.
    expect(scroller).toHaveClass(
      "max-sm:-mx-4",
      "max-sm:px-4",
      "max-sm:scroll-px-4",
      "[--scroll-fade-end-size:var(--space-12)]",
    );
  });

  it("keeps a pill strip inside its capsule", () => {
    render(<NavTabs aria-label="Bagian" items={ITEMS} variant="pill" />);
    expect(screen.getByRole("navigation").firstElementChild).not.toHaveClass("max-sm:-mx-4");
  });

  it("forwards a ref and other attributes to the landmark, like TabsList", () => {
    const ref = createRef<HTMLElement>();
    render(
      <NavTabs
        ref={ref}
        id="bagian-presensi"
        data-tour="presensi"
        aria-label="Bagian"
        items={ITEMS}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Bagian" });
    expect(ref.current).toBe(nav);
    expect(nav).toHaveAttribute("id", "bagian-presensi");
    expect(nav).toHaveAttribute("data-tour", "presensi");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<NavTabs aria-label="Bagian presensi" items={ITEMS} />);
    await expectNoAxeViolations(container);
  });
});
