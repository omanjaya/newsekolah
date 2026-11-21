import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { PromotionPlanItem } from "../api";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../students/components/student-link", () => ({
  StudentLink: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { PromotionPlanTable } from "./promotion-plan-table";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});

const ROWS: PromotionPlanItem[] = [
  { student_user_id: "s-1", from_class_id: "x-a", action: "promote", unresolved: true },
  {
    student_user_id: "s-2",
    from_class_id: "x-a",
    action: "promote",
    target_class_id: "xi-a",
    unresolved: false,
  },
  { student_user_id: "s-3", from_class_id: "x-b", action: "graduate", unresolved: false },
];

function renderTable(onOverride = vi.fn()) {
  render(
    <PromotionPlanTable
      rows={ROWS}
      studentName={(id) => `Siswa ${id}`}
      fromClasses={[
        { value: "x-a", label: "X-A" },
        { value: "x-b", label: "X-B" },
      ]}
      toClasses={[{ value: "xi-a", label: "XI-A" }]}
      onOverride={onOverride}
    />,
  );
  return onOverride;
}

describe("PromotionPlanTable", () => {
  it("narrows the plan to the students that still need a class", async () => {
    renderTable();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Siswa s-3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /showUnresolved/ }));
    expect(within(screen.getByRole("table")).getByText("Siswa s-1")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("Siswa s-3")).not.toBeInTheDocument();
  });

  it("lays the show filter and the class select out by the card's width, not the screen's", () => {
    renderTable();
    const strip = screen.getByRole("radiogroup", { name: "showLabel" });
    const bar = strip.closest("[data-slot=filter-bar]");
    expect(bar).toHaveClass("@container/filter-bar");
    const classSelect = screen.getByRole("combobox", { name: "table.fromClass" });
    expect(bar).toContainElement(classSelect);
    // Its own width at the row's end; the bar stretches it when stacked.
    expect(classSelect).toHaveClass("ml-auto", "w-56");
    expect(classSelect.className).not.toMatch(/(^|\s)sm:/);
  });

  it("sets one decision for every ticked student", async () => {
    const onOverride = renderTable();
    const [selectAll] = within(screen.getByRole("table")).getAllByRole("checkbox");
    if (!selectAll) throw new Error("no select-all checkbox");
    await userEvent.click(selectAll);
    await userEvent.click(screen.getByRole("button", { name: "bulkSetAction" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "action.retain" }));
    expect(onOverride).toHaveBeenCalledWith([
      { student_user_id: "s-1", action: "retain", target_class_id: undefined },
      { student_user_id: "s-2", action: "retain", target_class_id: "xi-a" },
      { student_user_id: "s-3", action: "retain", target_class_id: undefined },
    ]);
  });

  it("shows a placeholder, never the raw id, while a name is loading", () => {
    render(
      <PromotionPlanTable
        rows={ROWS}
        studentName={(id) => (id === "s-1" ? undefined : `Siswa ${id}`)}
        fromClasses={[{ value: "x-a", label: "X-A" }]}
        toClasses={[{ value: "xi-a", label: "XI-A" }]}
        onOverride={vi.fn()}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).queryByText("s-1")).not.toBeInTheDocument();
    expect(within(table).getByText("table.studentLoading")).toBeInTheDocument();
    expect(within(table).getByText("Siswa s-2")).toBeInTheDocument();
  });
});
