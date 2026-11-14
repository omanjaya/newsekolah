import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryWorkspaceNav, useLibraryShortcuts } from "./library-workspace-nav";

const session = vi.hoisted(() => ({ permissions: [] as string[], pathname: "/library/catalogue" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => session.pathname }));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => session.permissions.includes(permission),
}));

const CATALOGUE = "nav.library.items.catalog";
const COPIES = "app.library.copiesBrowser.navLabel";
const IMPORT = "app.library.import.navLabel";
const STOCKTAKE = "nav.library.items.stockOpname";
const DESK = "nav.library.items.circulation";
const CLASS_LOANS = "app.library.classLoans.navLabel";
const VIOLATIONS = "app.library.violations.navLabel";
const VISITS = "app.library.visits.navLabel";

describe("library area tabs", () => {
  beforeEach(() => {
    session.permissions = [];
    session.pathname = "/library/catalogue";
  });

  it("keeps barcode browsing available without exposing import or stocktake to catalogue readers", () => {
    session.permissions = ["view_library"];
    render(<LibraryWorkspaceNav area="catalogue" />);
    expect(screen.getByRole("link", { name: CATALOGUE })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: COPIES })).toHaveAttribute("href", "/library/copies");
    expect(screen.queryByRole("link", { name: IMPORT })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: STOCKTAKE })).not.toBeInTheDocument();
  });

  it("shows stocktake and import as catalogue tabs to catalogue managers", () => {
    session.permissions = ["view_library", "manage_library_catalog"];
    session.pathname = "/library/stocktake/abc";
    render(<LibraryWorkspaceNav area="catalogue" />);
    expect(screen.getByRole("link", { name: STOCKTAKE })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: IMPORT })).toHaveAttribute("href", "/library/import");
  });

  it("keeps the circulation pages together, without the kiosks as tabs", () => {
    session.permissions = ["manage_library_circulation"];
    session.pathname = "/library/class-loans";
    render(<LibraryWorkspaceNav area="circulation" />);
    expect(screen.getByRole("link", { name: CLASS_LOANS })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: DESK })).toHaveAttribute("href", "/library/desk");
    expect(screen.getByRole("link", { name: VIOLATIONS })).toHaveAttribute(
      "href",
      "/library/violations",
    );
    expect(screen.getByRole("link", { name: VISITS })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("does not draw a strip for a personal borrower", () => {
    session.permissions = ["view_own_library_loans"];
    render(<LibraryWorkspaceNav area="catalogue" />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("library page shortcuts", () => {
  beforeEach(() => {
    session.permissions = [];
  });

  it("offers the kiosks and the matching report only to readers who may open them", () => {
    session.permissions = ["manage_library_circulation", "view_library_reports"];
    const { result } = renderHook(() =>
      useLibraryShortcuts(["kiosk", "visitKiosk", "loanRules", { report: "visits" }]),
    );
    expect(result.current.map((action) => action.label)).toEqual([
      "openKiosk",
      "openVisitKiosk",
      "report",
    ]);
    expect(result.current[2]?.href).toBe("/library/reports?tab=visits");
  });

  it("opens a kiosk in a new tab", () => {
    session.permissions = ["manage_library_circulation"];
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { result } = renderHook(() => useLibraryShortcuts(["kiosk"]));
    result.current[0]?.onSelect?.();
    expect(open).toHaveBeenCalledWith("/library/kiosk", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  it("points settings shortcuts at the settings hub for settings managers", () => {
    session.permissions = ["manage_library_settings"];
    const { result } = renderHook(() =>
      useLibraryShortcuts(["memberTypes", "catalogueSettings", { report: "members" }]),
    );
    expect(result.current.map((action) => action.href)).toEqual([
      "/library/settings?section=memberTypes",
      "/library/settings?section=masterData",
    ]);
  });
});
