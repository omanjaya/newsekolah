import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SPLevel } from "../api";

import { PointsMeter, nextLevel } from "./points-meter";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => "id",
}));

const levels: SPLevel[] = [
  { level: 3, min_points: 100, label: "SP 3" },
  { level: 1, min_points: 25, label: "SP 1" },
  { level: 2, min_points: 50, label: "SP 2" },
];

describe("PointsMeter", () => {
  it("draws one meter with a marked line per level, from zero to the last one", () => {
    const { container } = render(<PointsMeter total={40} levels={levels} />);
    const bar = screen.getByRole("progressbar", { name: 'label:{"points":40}' });
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar.firstElementChild).toHaveClass("bg-warning");
    const lines = Array.from(
      container.querySelectorAll<HTMLElement>("[data-slot=progress-marker]"),
    ).map((line) => line.style.getPropertyValue("--marker"));
    expect(lines).toEqual(["0.25", "0.5", "1"]);
    // The levels are named on the scale and said in text under it.
    expect(screen.getByText("SP 2")).toBeInTheDocument();
    expect(screen.getByText('threshold:{"level":"SP 1","points":25}')).toBeInTheDocument();
  });

  it("turns red once the last level is reached and says when each level was reached", () => {
    render(
      <PointsMeter
        total={120}
        levels={levels}
        crossings={[{ level: 1, label: "SP 1", occurred_on: "2026-10-02" }]}
      />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar.firstElementChild).toHaveClass("bg-danger");
    // Past the last threshold the scale follows the total.
    expect(bar).toHaveAttribute("aria-valuemax", "120");
    expect(screen.getByText('reachedOn:{"date":"2 Okt"}')).toBeInTheDocument();
    expect(screen.getAllByText("notReached")).toHaveLength(2);
  });

  it("renders nothing without levels", () => {
    const { container } = render(<PointsMeter total={10} levels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("nextLevel", () => {
  it("finds the next threshold ahead of the total", () => {
    expect(nextLevel(30, levels)?.label).toBe("SP 2");
    expect(nextLevel(100, levels)).toBeUndefined();
  });
});
