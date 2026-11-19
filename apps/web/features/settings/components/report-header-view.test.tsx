import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("asks which line to print in bold only once two lines are filled in", async () => {
    const user = userEvent.setup();
    renderView();
    // With no line, or one, "automatic" would be the only option.
    expect(screen.queryByRole("radiogroup", { name: "emphasisLabel" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "lineLabel" }), "Pemerintah Provinsi");
    expect(screen.queryByRole("radiogroup", { name: "emphasisLabel" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "addLine" }));
    const second = screen.getAllByRole("textbox", { name: "lineLabel" })[1];
    if (!second) throw new Error("Missing the second line");
    await user.type(second, "SMA Harapan");
    expect(screen.getByRole("radiogroup", { name: "emphasisLabel" })).toBeInTheDocument();
  });

  it("draws the letterhead on white paper, whatever the theme", async () => {
    const user = userEvent.setup();
    renderView();
    await user.type(screen.getByRole("textbox", { name: "lineLabel" }), "SMA Harapan");
    const printed = screen
      .getAllByText("SMA Harapan")
      .find((element) => element.closest(".bg-paper"));
    expect(printed).toBeDefined();
    expect(printed).toHaveClass("text-paper-fg");
  });

  it("names the phone preview once, in the sheet, not again on a card inside it", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "preview.title" }));
    const sheet = screen.getByRole("dialog", { name: "preview.title" });
    expect(within(sheet).queryByRole("heading", { name: "title" })).not.toBeInTheDocument();
    expect(within(sheet).getByText("liveHint")).toBeInTheDocument();
  });
});
