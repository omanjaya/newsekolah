import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportHeaderView } from "./report-header-view";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/tenant/tenant-provider", () => ({ useTenant: () => ({ branding: null }) }));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { name: "SMA Contoh", timezone: "Asia/Makassar" } } }),
}));
vi.mock("./settings-page", () => ({
  SettingsPage: ({ children, floating }: { children: ReactNode; floating?: ReactNode }) => (
    <div>
      {children}
      {floating}
    </div>
  ),
}));
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
  it("offers no save on an untouched form with no saved lines", () => {
    renderView();
    expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
  });

  it("draws a typed line on the live sheet and offers to save it", async () => {
    const user = userEvent.setup();
    renderView();
    await user.type(screen.getByRole("textbox", { name: "lineLabel" }), "SMA Harapan");
    // The input keeps the value and the live sheet prints it.
    expect(screen.getAllByText("SMA Harapan").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "save" })).toBeInTheDocument();
  });
});
