import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));

const gradebookQuery = vi.hoisted(() => vi.fn());
const mappingsQuery = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({
  useGradebookQuery: gradebookQuery,
  useTPMappingsQuery: mappingsQuery,
  useSaveTPMappingMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTPMappingMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

// jsdom has no layout: every element reports this width, so a test sets
// how much room the editor has, independent of the viewport.
const layout = vi.hoisted(() => ({ width: 960 }));
vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
  () => ({ width: layout.width }) as DOMRect,
);
// Even a desktop viewport must not pick the table when the editor is narrow.
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: true,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));

import { TPMappingEditor } from "./tp-mapping-editor";

function load() {
  gradebookQuery.mockReturnValue({
    isLoading: false,
    data: {
      term_id: "term-2",
      scale: {},
      components: [
        { id: "c1", code: "TP1", kind: "formative" },
        { id: "c2", code: "UAS", kind: "summative" },
      ],
    },
  });
  mappingsQuery.mockReturnValue({
    isLoading: false,
    data: {
      data: [
        {
          id: "m1",
          component_id: "c1",
          export_code: "TP-A",
          r_min: 0,
          r_max: 74,
          t_min: 75,
          t_max: 100,
        },
      ],
    },
  });
}

afterEach(() => {
  cleanup();
  gradebookQuery.mockReset();
  mappingsQuery.mockReset();
  layout.width = 960;
});

describe("TPMappingEditor", () => {
  it("reads the page's term instead of keeping a picker of its own", () => {
    load();
    render(<TPMappingEditor classId="class-1" subjectId="subject-1" termId="term-2" />);

    expect(gradebookQuery).toHaveBeenCalledWith({
      classId: "class-1",
      subjectId: "subject-1",
      termId: "term-2",
    });
    expect(mappingsQuery).toHaveBeenCalledWith("class-1", "subject-1", "term-2");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("explains what the mapping feeds and what R and T mean", () => {
    load();
    render(<TPMappingEditor classId="class-1" subjectId="subject-1" />);

    expect(screen.getByText("description")).toBeInTheDocument();
  });

  it("keeps the table when the editor has room for it", () => {
    load();
    render(<TPMappingEditor classId="class-1" subjectId="subject-1" />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    // Only the eligible (formative) component gets a row.
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  it("gives each component its own card on a phone, with both ranges and its save in view", () => {
    layout.width = 358;
    load();
    render(<TPMappingEditor classId="class-1" subjectId="subject-1" />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const rRange = screen.getByRole("group", { name: "columns.rRange" });
    const tRange = screen.getByRole("group", { name: "columns.tRange" });
    expect(within(rRange).getByLabelText("columns.rMin")).toHaveValue("0");
    expect(within(tRange).getByLabelText("columns.tMax")).toHaveValue("100");
    expect(screen.getByRole("textbox", { name: "columns.exportCode" })).toHaveValue("TP-A");
    expect(screen.getByRole("button", { name: "save" })).toHaveClass("w-full");
  });

  it("switches to cards when the sidebar leaves a tablet-width window too little room", () => {
    // An 800px window beside the desktop sidebar leaves the card about 510px.
    layout.width = 510;
    load();
    render(<TPMappingEditor classId="class-1" subjectId="subject-1" />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "columns.tRange" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "save" })).toBeInTheDocument();
  });
});
