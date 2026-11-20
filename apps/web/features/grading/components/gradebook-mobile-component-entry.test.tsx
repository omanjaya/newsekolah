import { render, screen } from "@testing-library/react";
import type { useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { AssessmentComponent, GradebookStudent } from "../api";

import { GradebookMobileComponentEntry } from "./gradebook-mobile-component-entry";

const t = ((key: string, params?: Record<string, unknown>) => {
  if (key === "missingCount") return `${String(params?.count)} kosong`;
  if (key === "entryMode.componentPickerMissing") {
    return `Nilai kosong per komponen: ${String(params?.list)}`;
  }
  return key;
}) as unknown as ReturnType<typeof useTranslations>;

const components = [
  { id: "c1", code: "TG1", weight: 1 },
  { id: "c2", code: "UH1", weight: 1 },
  { id: "c3", code: "PTS", weight: 2 },
] as AssessmentComponent[];

function renderEntry(missing: Map<string, number>) {
  return render(
    <GradebookMobileComponentEntry
      t={t}
      components={components}
      students={[] as GradebookStudent[]}
      edits={{}}
      cellValue={() => ""}
      scaleMin={0}
      scaleMax={100}
      rangeHint=""
      formatHint=""
      missingByComponent={missing}
      activeComponentId="c1"
      onActiveComponentChange={vi.fn()}
      onAddComponent={vi.fn()}
      onCommit={vi.fn()}
      onRegisterRef={vi.fn()}
      onNavigate={vi.fn()}
    />,
  );
}

describe("GradebookMobileComponentEntry", () => {
  it("says what each component's count means, not just the active one's", () => {
    renderEntry(
      new Map([
        ["c1", 2],
        ["c3", 5],
      ]),
    );

    expect(screen.getByRole("radiogroup")).toHaveAccessibleDescription(
      "Nilai kosong per komponen: TG1: 2 kosong, PTS: 5 kosong",
    );
  });

  it("names each segment with its missing count", () => {
    renderEntry(
      new Map([
        ["c1", 2],
        ["c3", 5],
      ]),
    );

    expect(screen.getByRole("radio", { name: "TG1, 2 kosong" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "PTS, 5 kosong" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "UH1" })).toBeInTheDocument();
  });

  it("leaves the picker undescribed when no score is missing", () => {
    renderEntry(new Map());

    expect(screen.getByRole("radiogroup")).not.toHaveAttribute("aria-describedby");
  });
});
