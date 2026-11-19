import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/modules/use-module-enabled", () => ({ useModuleEnabled: () => true }));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([
    { id: "s1", name: "Ayu Lestari", profile_kind: "student" },
    { id: "staff-1", name: "Admin Contoh", profile_kind: "staff" },
  ]);
});
vi.mock("./student-risk-panel", () => ({ StudentRiskPanel: () => <div>panel</div> }));

import { StudentRiskDetailView } from "./student-risk-detail-view";

describe("StudentRiskDetailView", () => {
  it("shows the student's signals under their name", () => {
    render(<StudentRiskDetailView studentId="s1" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ayu Lestari");
    expect(screen.getByText("panel")).toBeInTheDocument();
  });

  it("shows the not-found page for a student the school does not have", () => {
    render(<StudentRiskDetailView studentId="00000000-0000-0000-0000-000000000000" />);

    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToList" })).toHaveAttribute("href", "/analytics");
    expect(screen.queryByText("panel")).not.toBeInTheDocument();
  });

  it("shows the not-found page for a staff member's id, not their name as a student", () => {
    render(<StudentRiskDetailView studentId="staff-1" />);

    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
    expect(screen.queryByText("Admin Contoh")).not.toBeInTheDocument();
    expect(screen.queryByText("panel")).not.toBeInTheDocument();
  });
});
