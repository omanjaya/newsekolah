import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowDefinitionsView } from "./workflow-definitions-view";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../school/duties-api", () => ({
  useDutyTypesQuery: () => ({ data: { data: [] } }),
}));
vi.mock("../api", () => ({
  WORKFLOW_KINDS: ["exit_permit", "leave_request"],
  useWorkflowDefinitionsQuery: () => ({ data: { data: [] }, isLoading: false }),
}));
vi.mock("./stage-editor", () => ({ StageEditor: () => <div data-testid="editor" /> }));

describe("WorkflowDefinitionsView", () => {
  it("renders the editor inside the panel the active kind tab controls", () => {
    render(<WorkflowDefinitionsView />);

    const controls = screen.getByRole("tab", { selected: true }).getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    const panel = document.getElementById(controls ?? "");
    expect(panel).toHaveAttribute("role", "tabpanel");
    expect(panel).toContainElement(screen.getByTestId("editor"));
  });
});
