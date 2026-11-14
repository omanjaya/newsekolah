import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { StudentRisk } from "../api";

import { RiskLevelSummary } from "./risk-level-summary";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const rows: StudentRisk[] = [
  { student_user_id: "a", class_id: "c", level: "at_risk", score: 9, computed_at: "" },
  { student_user_id: "b", class_id: "c", level: "watch", score: 5, computed_at: "" },
  { student_user_id: "c", class_id: "c", level: "watch", score: 4, computed_at: "" },
];

describe("RiskLevelSummary", () => {
  it("counts each level and filters the list by the tapped one", async () => {
    const onSelect = vi.fn();
    render(<RiskLevelSummary rows={rows} selected="" onSelect={onSelect} />);
    const watch = screen.getByRole("button", { name: /watch/ });
    expect(watch).toHaveAccessibleDescription(/2/);
    await userEvent.click(watch);
    expect(onSelect).toHaveBeenCalledWith("watch");
  });

  it("clears the filter when the selected level is tapped again", async () => {
    const onSelect = vi.fn();
    render(<RiskLevelSummary rows={rows} selected="at_risk" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /at_risk/ }));
    expect(onSelect).toHaveBeenCalledWith("");
  });

  it("says which level filters the list with aria-pressed", () => {
    render(<RiskLevelSummary rows={rows} selected="watch" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /watch/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /at_risk/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /none/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("renders nothing for an empty roster", () => {
    const { container } = render(<RiskLevelSummary rows={[]} selected="" onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
