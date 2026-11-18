import { PageHeader } from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceNav } from "./workspace-nav";

const route = vi.hoisted(() => ({ pathname: "/library/copies" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

const ITEMS = [
  { href: "/library/catalogue", label: "Judul" },
  { href: "/library/copies", label: "Eksemplar" },
  { href: "/library/import", label: "Impor" },
];

describe("WorkspaceNav", () => {
  beforeEach(() => {
    route.pathname = "/library/copies";
  });

  it("is a named navigation of links, the current page marked", () => {
    render(<WorkspaceNav label="Bagian katalog" items={ITEMS} />);
    const nav = screen.getByRole("navigation", { name: "Bagian katalog" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Eksemplar" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Judul" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Impor" })).toHaveAttribute("href", "/library/import");
  });

  it("marks a nested route's page, and honours an explicit active flag", () => {
    route.pathname = "/library/catalogue/t-1";
    const { rerender } = render(<WorkspaceNav label="Bagian" items={ITEMS} />);
    expect(screen.getByRole("link", { name: "Judul" })).toHaveAttribute("aria-current", "page");

    rerender(
      <WorkspaceNav
        label="Bagian"
        items={ITEMS.map((item) => ({ ...item, active: item.label === "Impor" }))}
      />,
    );
    expect(screen.getByRole("link", { name: "Impor" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Judul" })).not.toHaveAttribute("aria-current");
  });

  it("draws the shared underline strip", () => {
    render(<WorkspaceNav label="Bagian" items={ITEMS} />);
    const nav = screen.getByRole("navigation", { name: "Bagian" });
    // The strip indicator of NavTabs' underline variant: a 2px accent bar.
    expect(nav.querySelector('span[aria-hidden="true"]')).toHaveClass("h-0.5", "bg-accent");
  });

  it("leaves out a strip of one page, but keeps the area's actions", () => {
    const { container, rerender } = render(
      <WorkspaceNav label="Bagian" items={[{ href: "/library/copies", label: "Eksemplar" }]} />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <WorkspaceNav
        label="Bagian"
        items={[{ href: "/library/copies", label: "Eksemplar" }]}
        actions={<a href="/library/reports">Laporan</a>}
      />,
    );
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Laporan" })).toBeInTheDocument();
  });

  it("puts the actions after the tabs", () => {
    render(
      <WorkspaceNav
        label="Bagian"
        items={ITEMS}
        actions={<a href="/library/reports">Laporan</a>}
      />,
    );
    const tabs = screen.getByRole("navigation", { name: "Bagian" });
    const action = screen.getByRole("link", { name: "Laporan" });
    expect(tabs.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("moves itself under a PageHeader that follows it, until the view adopts AppPage", () => {
    const { container } = render(
      <>
        <WorkspaceNav label="Bagian" items={ITEMS} />
        <PageHeader title="Eksemplar" />
      </>,
    );
    const strip = container.firstElementChild;
    expect(strip).toHaveAttribute("data-slot", "workspace-nav");
    // Keyed to the header's own data-slot, never to its inner DOM.
    expect(strip).toHaveClass(
      "[&:has(+[data-slot=page-header])]:order-1",
      "[&:has(+[data-slot=page-header])+*~*]:order-1",
    );
    expect(strip?.nextElementSibling).toHaveAttribute("data-slot", "page-header");
  });
});
