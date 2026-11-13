import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportHeaderView } from "./report-header-view";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../api", () => ({
  fetchReportHeaderPreviewURL: vi.fn(() => new Promise(() => undefined)),
  useReportHeaderQuery: () => ({
    data: { show_logo: true, lines: [], place: "", signers: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateReportHeaderMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportHeaderView />
    </QueryClientProvider>,
  );
}

describe("ReportHeaderView", () => {
  it("keeps the save button disabled on an untouched form with no saved lines", () => {
    renderView();
    const save = screen.getByRole("button", { name: "save" });
    expect(save).toBeDisabled();
  });
});
