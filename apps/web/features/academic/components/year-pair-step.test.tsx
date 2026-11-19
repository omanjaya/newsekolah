import type * as Ui from "@newsekolah/ui";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AcademicYear } from "../api";

import { YearPairStep } from "./year-pair-step";

const state = vi.hoisted(() => ({ canManage: true }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => state.canManage }));
// Radix Select does not open in jsdom; a native select lists the options.
vi.mock("@newsekolah/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof Ui>()),
  Select: ({ options, value }: { options: { value: string; label: string }[]; value: string }) => (
    <select value={value} onChange={() => undefined}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

afterEach(cleanup);
beforeEach(() => {
  state.canManage = true;
});

function year(id: string, label: string, startsOn: string): AcademicYear {
  return { id, label, starts_on: startsOn, ends_on: startsOn, is_active: false };
}

const Y1 = year("y1", "2026/2027", "2026-07-13");
const Y2 = year("y2", "2027/2028", "2027-07-12");
const Y3 = year("y3", "2028/2029", "2028-07-10");

function renderStep(years: AcademicYear[], fromYearId: string, toYearId = "") {
  render(
    <YearPairStep
      years={years}
      fromYearId={fromYearId}
      toYearId={toYearId}
      onFromChange={vi.fn()}
      onToChange={vi.fn()}
      onPreview={vi.fn()}
      previewing={false}
      previewLabel="preview"
    />,
  );
}

describe("YearPairStep", () => {
  it("never offers the year chosen on one side on the other", () => {
    renderStep([Y1, Y2, Y3], "y1", "y2");

    const [source, target] = screen.getAllByRole("combobox");
    if (!source || !target) throw new Error("no selects");
    const labels = (select: HTMLElement) =>
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent);
    expect(labels(target)).toEqual(["2027/2028", "2028/2029"]);
    expect(labels(source)).toEqual(["2026/2027", "2028/2029"]);
  });

  it("with one year, shows the way to add another instead of an empty destination and a dead button", () => {
    renderStep([Y1], "y1");

    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "preview" })).not.toBeInTheDocument();
    expect(screen.getByText("needTwoYears")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "addYear" })).toHaveAttribute(
      "href",
      "/academic/years?new=1",
    );
  });

  it("keeps the preview for two years", () => {
    renderStep([Y1, Y2], "y1", "y2");
    expect(screen.getByRole("button", { name: "preview" })).toBeEnabled();
  });
});
