import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(
  (): {
    useAcademicYearsQuery: ReturnType<typeof vi.fn>;
    canManage: boolean;
    dialogTarget: unknown;
    dialogClose: (() => void) | undefined;
  } => ({
    useAcademicYearsQuery: vi.fn(),
    canManage: true,
    dialogTarget: undefined,
    dialogClose: undefined,
  }),
);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: (value: Date) => value.toISOString().slice(0, 10) }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/academic/years",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => mocks.canManage }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("./academic-workspace-links", () => ({ AcademicWorkspaceLinks: () => null }));
vi.mock("./terms-panel", () => ({ TermsPanel: () => null }));
vi.mock("./year-form-dialog", () => ({
  YearFormDialog: ({
    target,
    onOpenChange,
  }: {
    target: unknown;
    onOpenChange: (open: boolean) => void;
  }) => {
    mocks.dialogTarget = target;
    mocks.dialogClose = () => {
      onOpenChange(false);
    };
    return null;
  },
}));
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
    mocks.canManage = true;
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

    await user.click(screen.getByRole("button", { name: /^Hapus filter / }));

    expect(mocks.useAcademicYearsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeArchived: false }),
    );
    expect(new URLSearchParams(window.location.search).get("include_archived")).toBe("");
  });

  it("leaves the archive filter out for a reader who cannot manage years", () => {
    mocks.canManage = false;
    render(<YearsView />);
    expect(screen.queryByRole("button", { name: "showArchived" })).not.toBeInTheDocument();
  });
});

describe("YearsView first use", () => {
  beforeEach(() => {
    mocks.useAcademicYearsQuery.mockReset();
    mocks.canManage = true;
    mocks.dialogTarget = undefined;
    mocks.useAcademicYearsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/academic/years");
  });

  it("offers the empty list's add as the outline button, the header keeping the filled one", () => {
    render(<YearsView />);
    const adds = screen.getAllByRole("button", { name: "add" });
    // The header's primary and the empty state's outline button.
    expect(adds).toHaveLength(2);
    expect(adds.filter((button) => button.className.includes("bg-accent"))).toHaveLength(1);
    expect(adds.filter((button) => button.className.includes("border-border"))).toHaveLength(1);
  });

  it("opens the add dialog straight away from ?new=1, and drops the flag once closed", () => {
    window.history.replaceState(null, "", "/academic/years?new=1");
    render(<YearsView />);
    expect(mocks.dialogTarget).toBe("new");
    act(() => {
      mocks.dialogClose?.();
    });
    expect(new URLSearchParams(window.location.search).has("new")).toBe(false);
  });

  it("ignores ?new=1 for a reader who cannot add a year", () => {
    mocks.canManage = false;
    window.history.replaceState(null, "", "/academic/years?new=1");
    render(<YearsView />);
    expect(mocks.dialogTarget).toBeNull();
  });
});
