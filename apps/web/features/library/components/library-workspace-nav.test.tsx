import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryWorkspaceNav } from "./library-workspace-nav";

const session = vi.hoisted(() => ({ permissions: [] as string[], pathname: "/library/catalogue" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => session.pathname }));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => session.permissions.includes(permission),
}));

describe("library workspace access", () => {
  beforeEach(() => {
    session.permissions = [];
    session.pathname = "/library/catalogue";
  });

  it("keeps barcode browsing available without exposing import or reports to catalogue readers", () => {
    session.permissions = ["view_library"];
    render(<LibraryWorkspaceNav area="catalogue" />);
    expect(screen.getByRole("link", { name: "titles" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "copies" })).toHaveAttribute("href", "/library/copies");
    expect(screen.queryByRole("link", { name: "importBooks" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "report" })).not.toBeInTheDocument();
  });

  it("keeps circulation workflows reachable without granting configuration or membership access", () => {
    session.permissions = ["manage_library_circulation"];
    session.pathname = "/library/class-loans";
    render(<LibraryWorkspaceNav area="circulation" />);
    expect(screen.getByRole("link", { name: "class" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "sanctions" })).toHaveAttribute(
      "href",
      "/library/violations",
    );
    expect(screen.getByRole("link", { name: "openKiosk" })).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("link", { name: "loanSettings" })).not.toBeInTheDocument();
  });

  it("allows a settings-only user to move between default limits and period rules", () => {
    session.permissions = ["manage_library_settings"];
    session.pathname = "/library/loan-rules";
    render(<LibraryWorkspaceNav area="settings" />);
    expect(screen.getByRole("link", { name: "memberTypes" })).toHaveAttribute(
      "href",
      "/library/member-types",
    );
    expect(screen.getByRole("link", { name: "periodRules" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("link", { name: "members" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "circulation" })).not.toBeInTheDocument();
  });

  it("opens the relevant report using library permission alone", () => {
    session.permissions = ["manage_library_circulation", "view_library_reports"];
    session.pathname = "/library/visits";
    render(<LibraryWorkspaceNav area="visits" />);
    expect(screen.getByRole("link", { name: "report" })).toHaveAttribute(
      "href",
      "/library/reports?tab=visits",
    );
    expect(screen.getByRole("link", { name: "openVisitKiosk" })).toHaveAttribute(
      "href",
      "/library/visit-kiosk",
    );
  });

  it("shows stocktake and import as catalogue tabs only to catalogue managers", () => {
    session.permissions = ["view_library", "manage_library_catalog"];
    session.pathname = "/library/stocktake";
    render(<LibraryWorkspaceNav area="stocktake" />);
    expect(screen.getByRole("link", { name: "stocktake" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "titles" })).toHaveAttribute(
      "href",
      "/library/catalogue",
    );
    expect(screen.getByRole("link", { name: "importBooks" })).toHaveAttribute(
      "href",
      "/library/import",
    );
  });

  it("hides stocktake and import from catalogue readers", () => {
    session.permissions = ["view_library"];
    render(<LibraryWorkspaceNav area="catalogue" />);
    expect(screen.queryByRole("link", { name: "stocktake" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "importBooks" })).not.toBeInTheDocument();
  });

  it("shows visits as a circulation tab and keeps the visits report shortcut", () => {
    session.permissions = ["manage_library_circulation", "view_library_reports"];
    session.pathname = "/library/visits";
    render(<LibraryWorkspaceNav area="visits" />);
    expect(screen.getByRole("link", { name: "visits" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "individual" })).toHaveAttribute(
      "href",
      "/library/desk",
    );
    expect(screen.getByRole("link", { name: "sanctions" })).toBeInTheDocument();
  });

  it("does not expose library operations to a personal borrower", () => {
    session.permissions = ["view_own_library_loans"];
    render(<LibraryWorkspaceNav area="catalogue" />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
