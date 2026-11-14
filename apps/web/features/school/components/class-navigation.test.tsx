import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("../api", () => ({ useGradeLevelsQuery: () => ({ data: { data: [] } }) }));
vi.mock("../../../lib/session/session-provider", () => ({ useSession: () => ({ me: undefined }) }));
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: () => new Map([["teacher-1", { id: "teacher-1", name: "Bu Rina" }]]),
}));
vi.mock("../../students/api", () => ({
  STUDENT_SEARCH_MIN_CHARS: 2,
  useStudentSearchQuery: () => ({ data: undefined }),
}));

import { ClassNavigation } from "./class-navigation";

describe("class picker", () => {
  it("finds classes without scrolling every class and allows restoring the full list", () => {
    const onSelect = vi.fn();
    render(
      <ClassNavigation
        items={[
          {
            id: "class1",
            academic_year_id: "year",
            grade_level_id: "grade",
            name: "X-1",
            homeroom_teacher_id: "teacher-1",
          },
          { id: "class2", academic_year_id: "year", grade_level_id: "grade", name: "X-12" },
        ]}
        selectedId="class1"
        onSelect={onSelect}
      />,
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "searchClasses" }), {
      target: { value: "X-12" },
    });
    expect(screen.queryByRole("button", { name: "X-1" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "X-12" }));
    expect(onSelect).toHaveBeenCalledWith("class2");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
    expect(screen.getByRole("status")).toHaveTextContent("states.noResults");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("names each class's homeroom teacher, or says there is none yet", () => {
    render(
      <ClassNavigation
        items={[
          {
            id: "class1",
            academic_year_id: "year",
            grade_level_id: "grade",
            name: "X-1",
            homeroom_teacher_id: "teacher-1",
          },
          { id: "class2", academic_year_id: "year", grade_level_id: "grade", name: "X-2" },
        ]}
        selectedId="class1"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "X-1" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "X-1" })).toHaveAccessibleDescription("Bu Rina");
    expect(screen.getByRole("button", { name: "X-2" })).toHaveAccessibleDescription(
      "noHomeroomShort",
    );
  });
});
