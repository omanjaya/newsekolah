import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LibrarySettingsView } from "./library-settings-view";

const session = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { permissions: session.permissions } }),
}));
vi.mock("./loan-rules-view", () => ({ LoanRulesView: () => <p>loan rules section</p> }));
vi.mock("./member-types-view", () => ({ MemberTypesView: () => <p>member types section</p> }));
vi.mock("./master-data-view", () => ({ MasterDataView: () => <p>catalogue data section</p> }));

describe("LibrarySettingsView", () => {
  beforeEach(() => {
    session.permissions = ["manage_library_settings", "view_library"];
    window.history.replaceState(null, "", "/library/settings");
  });

  it("opens on loan rules with every section as a tab under the header", () => {
    render(<LibrarySettingsView />);
    expect(screen.getByText("loan rules section")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "tabsLabel" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "tabs.loanRules" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "tabs.masterData" })).toHaveAttribute(
      "href",
      "/library/settings?section=masterData",
    );
  });

  it("shows the section named in the address", () => {
    window.history.replaceState(null, "", "/library/settings?section=memberTypes");
    render(<LibrarySettingsView />);
    expect(screen.getByText("member types section")).toBeInTheDocument();
    expect(screen.queryByText("loan rules section")).not.toBeInTheDocument();
  });

  it("keeps a catalogue reader to the one section they may open, without tabs", () => {
    session.permissions = ["view_library"];
    window.history.replaceState(null, "", "/library/settings?section=loanRules");
    render(<LibrarySettingsView />);
    expect(screen.getByText("catalogue data section")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
