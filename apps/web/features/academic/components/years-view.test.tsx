import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAcademicYearsQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: (value: Date) => value.toISOString().slice(0, 10) }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/academic/years",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => false }));
vi.mock("./academic-workspace-links", () => ({ AcademicWorkspaceLinks: () => null }));
vi.mock("./terms-panel", () => ({ TermsPanel: () => null }));
vi.mock("./year-form-dialog", () => ({ YearFormDialog: () => null }));
vi.mock("../api", () => ({
  useAcademicYearsQuery: mocks.useAcademicYearsQuery,
  useActivateAcademicYearMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveAcademicYearMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateAcademicYearMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAcademicYearMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { YearsView } from "./years-view";

describe("YearsView filters", () => {
  beforeEach(() => {
    mocks.useAcademicYearsQuery.mockReset();
    mocks.useAcademicYearsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/academic/years");
  });

  it("passes includeArchived to the query and writes it to the URL when toggled on", async () => {
    const user = userEvent.setup();
    render(<YearsView />);

    expect(mocks.useAcademicYearsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeArchived: false }),
    );

    await user.click(screen.getByRole("button", { name: "showArchived" }));

    expect(mocks.useAcademicYearsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeArchived: true }),
    );
    expect(new URLSearchParams(window.location.search).get("include_archived")).toBe("true");
  });

  it("reads an initial include_archived=true URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/academic/years?include_archived=true");
    render(<YearsView />);

    expect(mocks.useAcademicYearsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeArchived: true }),
    );
    expect(screen.getByRole("button", { name: "showArchived", pressed: true })).toBeInTheDocument();
  });

  it("clears the filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/academic/years?include_archived=true");
    const user = userEvent.setup();
    render(<YearsView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));

    expect(mocks.useAcademicYearsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeArchived: false }),
    );
    expect(new URLSearchParams(window.location.search).get("include_archived")).toBe("");
  });
});
