import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowDefinitionsView } from "./workflow-definitions-view";

const definitions = vi.fn<() => unknown>();
const mutateAsync = vi.fn(() => Promise.resolve());

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));
vi.mock("../../../lib/hooks/use-url-state", async () => {
  const { useState } = await import("react");
  return {
    useUrlState: (_key: string, _values: readonly string[], fallback: string) => {
      const [value, setValue] = useState(fallback);
      return [value, setValue, setValue];
    },
  };
});
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../../../lib/navigation/use-unsaved-changes-protection", () => ({
  useUnsavedChangesProtection: () => undefined,
}));
vi.mock("../../school/duties-api", () => ({
  useDutyTypesQuery: () => ({ data: { data: [] } }),
}));
vi.mock("../../settings/components/settings-page", () => ({
  SettingsPage: ({ children, floating }: { children: ReactNode; floating?: ReactNode }) => (
    <div>
      {children}
      {floating}
    </div>
  ),
}));
vi.mock("../api", () => ({
  WORKFLOW_KINDS: ["exit_permit", "leave_request"],
  FIXED_APPROVER_RULES: ["any_teacher", "teacher_of_class_now", "homeroom_of_student"],
  VERIFICATION_MODES: ["qr_scan", "manual", "auto"],
  useWorkflowDefinitionsQuery: () => definitions() as never,
  useReplaceWorkflowDefinitionMutation: () => ({ mutateAsync, isPending: false }),
}));

const exitPermit = {
  id: "d1",
  kind: "exit_permit",
  version: 2,
  is_active: true,
  stages: [
    {
      key: "duty_teacher",
      label: "Guru piket",
      approver_rule: "any_teacher",
      verification: "qr_scan",
    },
  ],
};

beforeEach(() => {
  mutateAsync.mockClear();
  definitions.mockReturnValue({ data: { data: [exitPermit] }, isLoading: false, isError: false });
});

afterEach(cleanup);

describe("WorkflowDefinitionsView", () => {
  it("renders the editor inside the tab panel its selected tab controls", () => {
    render(<WorkflowDefinitionsView />);
    const tab = screen.getByRole("tab", { selected: true });
    const panelId = tab.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = screen.getByRole("tabpanel");
    expect(panel.id).toBe(panelId);
    expect(within(panel).getAllByText("Guru piket").length).toBeGreaterThan(0);
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
    expect(screen.queryByText("Guru piket")).not.toBeInTheDocument();
  });

  it("shows the save bar for a changed stage and asks before switching kind", async () => {
    const user = userEvent.setup();
    render(<WorkflowDefinitionsView />);
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Guru piket/ }));
    const name = screen.getByRole("textbox", { name: "stage.labelField" });
    await user.clear(name);
    await user.type(name, "Guru BK");
    expect(screen.getByText("unsaved")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "kind.leave_request" }));
    expect(screen.getByRole("dialog", { name: "discardTitle" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "kind.exit_permit" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("derives a new stage's code from its name", async () => {
    const user = userEvent.setup();
    render(<WorkflowDefinitionsView />);
    await user.click(screen.getByRole("button", { name: "addStage" }));
    // The new stage opens on its form; the first stays closed.
    await user.type(screen.getByRole("textbox", { name: "stage.labelField" }), "Wali kelas");
    await user.click(screen.getByRole("button", { name: "stage.advanced" }));
    expect(screen.getByRole("textbox", { name: /stage.keyField/ })).toHaveValue("wali_kelas");
  });

  it("asks before saving and saves the stages in order as a new version", async () => {
    const user = userEvent.setup();
    render(<WorkflowDefinitionsView />);
    await user.click(screen.getByRole("button", { name: /Guru piket/ }));
    await user.type(screen.getByRole("textbox", { name: "stage.labelField" }), " pagi");
    const [save] = screen.getAllByRole("button", { name: "save" });
    if (save) await user.click(save);
    const dialog = screen.getByRole("dialog", { name: "confirmTitle" });
    await user.click(within(dialog).getByRole("button", { name: "confirmSave" }));
    expect(mutateAsync).toHaveBeenCalledWith({
      kind: "exit_permit",
      stages: [
        {
          key: "duty_teacher",
          label: "Guru piket pagi",
          approver_rule: "any_teacher",
          verification: "qr_scan",
        },
      ],
      config: undefined,
    });
  });
});
