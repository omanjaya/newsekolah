import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/discipline/violations",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => mocks.permissions.has(permission),
}));
vi.mock("../../student-services/components/service-workspace-nav", () => ({
  DisciplineWorkspaceNav: () => null,
}));
vi.mock("./violations-ledger-view", () => ({
  ViolationsLedgerView: () => <div>ledger-panel</div>,
}));
vi.mock("./violation-catalog-view", () => ({ ViolationCatalogView: () => null }));
vi.mock("./discipline-policy-view", () => ({ DisciplinePolicyView: () => null }));
vi.mock("./at-risk-panel", () => ({ AtRiskPanel: () => <div>at-risk-panel</div> }));
vi.mock("./issued-letters-panel", () => ({ IssuedLettersPanel: () => <div>letters-panel</div> }));

import { ViolationsView } from "./violations-view";

describe("ViolationsView warning-letter tabs", () => {
  beforeEach(() => {
    mocks.permissions = new Set();
    window.history.replaceState(null, "", "/discipline/violations");
  });

  it("hides the candidate and letter tabs without view_discipline", () => {
    render(<ViolationsView />);

    expect(screen.queryByRole("tab", { name: "tabs.atRisk" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "tabs.letters" })).not.toBeInTheDocument();
    expect(screen.getByText("ledger-panel")).toBeInTheDocument();
  });

  it("shows the candidate and letter tabs with view_discipline", () => {
    mocks.permissions = new Set(["view_discipline"]);
    render(<ViolationsView />);

    expect(screen.getByRole("tab", { name: "tabs.atRisk" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tabs.letters" })).toBeInTheDocument();
  });

  it("opens the candidates panel from the tab URL param", () => {
    mocks.permissions = new Set(["view_discipline"]);
    window.history.replaceState(null, "", "/discipline/violations?tab=atRisk");
    render(<ViolationsView />);

    expect(screen.getByText("at-risk-panel")).toBeInTheDocument();
  });

  it("ignores a letters tab param when the permission is missing", () => {
    window.history.replaceState(null, "", "/discipline/violations?tab=letters");
    render(<ViolationsView />);

    expect(screen.queryByText("letters-panel")).not.toBeInTheDocument();
    expect(screen.getByText("ledger-panel")).toBeInTheDocument();
  });
});
