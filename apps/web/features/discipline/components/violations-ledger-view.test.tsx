import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useViolationsQuery: vi.fn(),
  canRecord: true,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/discipline/violations",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => mocks.canRecord }));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({
    data: {
      data: [
        { id: "class-7a", name: "7A" },
        { id: "class-7b", name: "7B" },
      ],
    },
    isLoading: false,
  }),
  useDirectoryQuery: () => ({ data: { data: [] }, isLoading: false }),
  useLookup: () => new Map(),
}));
vi.mock("../api", () => ({
  useViolationsQuery: mocks.useViolationsQuery,
  useIssueWarningLetterMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useVoidViolationMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ViolationsLedgerView } from "./violations-ledger-view";

describe("ViolationsLedgerView filters", () => {
  beforeEach(() => {
    mocks.canRecord = true;
    mocks.useViolationsQuery.mockReset();
    mocks.useViolationsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/discipline/violations");
  });

  it("passes the chosen class to the violations query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<ViolationsLedgerView />);

    await user.click(screen.getByRole("button", { name: "filters.class" }));
    await user.click(await screen.findByRole("button", { name: "7B" }));

    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: "class-7b" }),
    );
    expect(new URLSearchParams(window.location.search).get("class_id")).toBe("class-7b");
  });

  it("toggles the include-voided filter directly and writes include_voided=true to the URL", async () => {
    const user = userEvent.setup();
    render(<ViolationsLedgerView />);

    const toggle = screen.getByRole("button", { name: "filters.includeVoided" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);

    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeVoided: true }),
    );
    expect(new URLSearchParams(window.location.search).get("include_voided")).toBe("true");
  });

  it("reads an initial class_id URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/discipline/violations?class_id=class-7a");
    render(<ViolationsLedgerView />);

    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: "class-7a" }),
    );
    expect(screen.getByRole("button", { name: "filters.class: 7A" })).toBeInTheDocument();
  });

  it("clears an active filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/discipline/violations?include_voided=true");
    const user = userEvent.setup();
    render(<ViolationsLedgerView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeVoided: false }),
    );
    expect(new URLSearchParams(window.location.search).get("include_voided")).toBe("");
  });
});
