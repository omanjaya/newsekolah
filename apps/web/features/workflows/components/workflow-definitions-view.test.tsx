import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkflowDefinitionsView } from "./workflow-definitions-view";

const definitions = vi.fn<() => unknown>();

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../school/duties-api", () => ({
  useDutyTypesQuery: () => ({ data: { data: [] } }),
}));
vi.mock("./stage-editor", () => ({ StageEditor: () => <div>stage editor</div> }));
vi.mock("../api", () => ({
  WORKFLOW_KINDS: ["exit_permit", "leave_request"],
  useWorkflowDefinitionsQuery: () => definitions() as never,
}));

afterEach(cleanup);

describe("WorkflowDefinitionsView", () => {
  it("renders the editor inside the tab panel its selected tab controls", () => {
    definitions.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    render(<WorkflowDefinitionsView />);
    const tab = screen.getByRole("tab", { selected: true });
    const panelId = tab.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = screen.getByRole("tabpanel");
    expect(panel.id).toBe(panelId);
    expect(panel).toHaveTextContent("stage editor");
  });

  it("shows a retry control instead of an empty editor when the definitions fail to load", () => {
    definitions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<WorkflowDefinitionsView />);
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
    expect(screen.queryByText("stage editor")).not.toBeInTheDocument();
  });
});
