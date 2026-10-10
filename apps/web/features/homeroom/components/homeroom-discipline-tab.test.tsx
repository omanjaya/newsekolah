import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useViolationsQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/homeroom",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../discipline/api", () => ({ useViolationsQuery: mocks.useViolationsQuery }));
vi.mock("../../reference/api", () => ({
  useDirectoryQuery: () => ({ data: { data: [] }, isLoading: false }),
  useLookup: () => new Map(),
}));

import { HomeroomDisciplineTab } from "./homeroom-discipline-tab";

function records(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `record-${index}`,
    student_user_id: `student-${index}`,
    type_name: "Late",
    points: 5,
    occurred_on: "2026-09-10",
  }));
}

describe("HomeroomDisciplineTab paging", () => {
  beforeEach(() => {
    mocks.useViolationsQuery.mockReset();
    mocks.useViolationsQuery.mockReturnValue({ data: { data: records(50) }, isLoading: false });
    window.history.replaceState(null, "", "/homeroom");
  });

  it("requests the second page at offset 50 and keeps it in the URL", async () => {
    const user = userEvent.setup();
    render(<HomeroomDisciplineTab classId="class-7a" />);

    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: "class-7a" }),
      { limit: 50, offset: 0 },
    );
    await user.click(screen.getByRole("button", { name: "next" }));

    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: "class-7a" }),
      { limit: 50, offset: 50 },
    );
    expect(new URLSearchParams(window.location.search).get("discipline_page")).toBe("2");
  });

  it("keeps the pager when a later page comes back empty", () => {
    window.history.replaceState(null, "", "/homeroom?discipline_page=2");
    mocks.useViolationsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    render(<HomeroomDisciplineTab classId="class-7a" />);

    expect(screen.getByRole("button", { name: "previous" })).toBeEnabled();
  });
});
