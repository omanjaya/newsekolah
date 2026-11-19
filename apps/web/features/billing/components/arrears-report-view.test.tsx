import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArrearsReportView } from "./arrears-report-view";

const state = vi.hoisted(() => ({
  arrears: { by_student: [] as unknown[], by_class: [] as unknown[] },
  bills: [] as unknown[],
  canGenerate: true,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/billing",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => state.canGenerate,
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [] } }),
  useLookup: () => new Map(),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("../lib/use-billing-format", () => ({
  useBillingFormat: () => ({ money: (minor: number) => String(minor) }),
}));
vi.mock("../api", () => ({
  useArrearsReportQuery: () => ({ data: state.arrears, isLoading: false, isError: false }),
  useBillsQuery: () => ({ data: { data: state.bills }, isLoading: false }),
}));

afterEach(cleanup);
beforeEach(() => {
  state.arrears = { by_student: [], by_class: [] };
  state.bills = [];
  state.canGenerate = true;
});

describe("ArrearsReportView", () => {
  it("does not call a school without bills fully paid, and points to issuing", () => {
    render(<ArrearsReportView />);
    expect(screen.getByText("noBillsTitle")).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "goToGenerate" })).toHaveAttribute(
      "href",
      "/billing?tab=generate",
    );
  });

  it("says arrears follow issued bills to a reader who cannot issue them", () => {
    state.canGenerate = false;
    render(<ArrearsReportView />);
    expect(screen.getByText("noBillsBody")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "goToGenerate" })).not.toBeInTheDocument();
  });

  it("keeps the all-paid state once bills exist and none is owed", () => {
    state.bills = [{ id: "b1" }];
    render(<ArrearsReportView />);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(screen.queryByText("noBillsTitle")).not.toBeInTheDocument();
  });
});
