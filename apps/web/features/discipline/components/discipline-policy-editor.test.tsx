import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../api", () => ({
  useUpdateDisciplinePolicyMutation: () => ({ mutateAsync: mocks.update, isPending: false }),
}));

import { DisciplinePolicyEditor } from "./discipline-policy-editor";

const LADDER = [
  { level: 1, label: "SP 1", min_points: 25 },
  { level: 2, label: "SP 2", min_points: 50 },
  { level: 3, label: "SP 3", min_points: 75 },
];

describe("DisciplinePolicyEditor validation", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.update.mockResolvedValue({});
  });

  it("marks an out-of-order threshold on its row and does not send the ladder", async () => {
    const user = userEvent.setup();
    render(<DisciplinePolicyEditor initialLevels={LADDER} />);

    // The desktop grid's SP 2 threshold (the phone cards render the same
    // fields again under their own ids).
    const sp2Points = document.getElementById("sp-level-points-1") as HTMLInputElement;
    fireEvent.change(sp2Points, { target: { value: "20" } });
    fireEvent.blur(sp2Points);
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getAllByText("errors.pointsMustIncrease").length).toBeGreaterThan(0);
    expect(document.getElementById("sp-level-points-1")).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).toBe(document.getElementById("sp-level-points-1"));
  });

  it("asks for a missing label before saving", async () => {
    const user = userEvent.setup();
    render(<DisciplinePolicyEditor initialLevels={LADDER} />);

    await user.click(screen.getByRole("button", { name: "addLevel" }));
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getAllByText("errors.labelRequired").length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(document.getElementById("sp-level-label-3"));
  });

  it("saves a valid ladder", async () => {
    const user = userEvent.setup();
    render(<DisciplinePolicyEditor initialLevels={LADDER} />);

    await user.click(screen.getByRole("button", { name: "save" }));

    expect(mocks.update).toHaveBeenCalledWith([
      { level: 1, label: "SP 1", min_points: 25 },
      { level: 2, label: "SP 2", min_points: 50 },
      { level: 3, label: "SP 3", min_points: 75 },
    ]);
  });
});
