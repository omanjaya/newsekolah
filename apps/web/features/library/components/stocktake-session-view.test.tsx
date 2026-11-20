import { ApiError } from "@newsekolah/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StocktakeSessionView } from "./stocktake-session-view";

const sessionFailure = vi.hoisted<{ current: unknown }>(() => ({ current: null }));
const downloadReport = vi.hoisted(() => vi.fn());
const mocks = vi.hoisted(() => ({
  status: "open",
  scan: vi.fn(),
  close: vi.fn(),
  findCopy: vi.fn(),
  titleName: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../desk-api", () => ({
  useFindLibraryCopyByCodeMutation: () => ({ mutateAsync: mocks.findCopy }),
  useLibraryTitleNameMutation: () => ({ mutateAsync: mocks.titleName }),
}));
// The reconciliation has tests of its own; here it only shows which result it got.
vi.mock("./stocktake-results", () => ({
  StocktakeResults: ({ result }: { result: { stocktake_id: string } }) => (
    <section aria-label="reconciliation">{result.stocktake_id}</section>
  ),
}));
vi.mock("../stocktake-api", () => ({
  downloadLibraryStocktakeReportXlsx: downloadReport,
  useLibraryStocktakeQuery: () =>
    sessionFailure.current
      ? {
          data: undefined,
          isLoading: false,
          isError: true,
          error: sessionFailure.current,
          refetch: vi.fn(),
        }
      : {
          data: {
            id: "st-1",
            name: "Opname semester 1",
            started_on: "2026-11-02",
            status: mocks.status,
          },
          isLoading: false,
        },
  useLibraryStocktakeProgressQuery: () => ({
    data: {
      expected_count: 10,
      scanned_count: 3,
      missing_count: 7,
      unexpected_count: 2,
      misplaced_count: 0,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  // The server's reconciliation, fetched only once the session is closed.
  useLibraryStocktakeResultsQuery: (_id: string, enabled: boolean) => ({
    data: enabled ? { stocktake_id: "st-1" } : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useScanStocktakeMutation: () => ({ mutate: mocks.scan, isPending: false }),
  useCloseStocktakeMutation: () => ({ mutate: mocks.close, isPending: false }),
}));

describe("StocktakeSessionView", () => {
  beforeEach(() => {
    mocks.status = "open";
    sessionFailure.current = null;
    mocks.scan.mockReset();
    mocks.close.mockReset();
    mocks.findCopy.mockReset().mockResolvedValue({ title_id: "title-1" });
    mocks.titleName.mockReset().mockResolvedValue("Laskar Pelangi");
  });

  it("names a found copy by its book in the announced result", async () => {
    mocks.scan.mockImplementation(
      (
        _input: unknown,
        options: { onSuccess: (response: { data: { outcome: string }[] }) => void },
      ) => {
        options.onSuccess({ data: [{ outcome: "found" }] });
      },
    );
    const user = userEvent.setup();
    const { container } = render(<StocktakeSessionView stocktakeId="st-1" />);

    await user.type(screen.getByRole("textbox", { name: "scan.label" }), "2026/00001{Enter}");

    // The scanner hands each code over through its queue, after the keystroke.
    await waitFor(() => {
      expect(mocks.scan).toHaveBeenCalledWith(
        { stocktakeId: "st-1", barcode: "2026/00001" },
        expect.any(Object),
      );
    });
    const live = container.querySelector('[aria-live="polite"]');
    if (!(live instanceof HTMLElement)) throw new Error("result region missing");
    expect(await within(live).findByText("Laskar Pelangi")).toBeInTheDocument();
    expect(mocks.findCopy).toHaveBeenCalledWith("2026/00001");
  });

  // A copy on loan or lost was announced as a plain success, and the
  // counters counted it as scanned, so they never added up.
  it("marks a found copy that is not expected on the shelf as unexpected", async () => {
    mocks.findCopy.mockResolvedValue({ title_id: "title-1", status: "on_loan" });
    mocks.scan.mockImplementation(
      (
        _input: unknown,
        options: { onSuccess: (response: { data: { outcome: string }[] }) => void },
      ) => {
        options.onSuccess({ data: [{ outcome: "found" }] });
      },
    );
    const user = userEvent.setup();
    const { container } = render(<StocktakeSessionView stocktakeId="st-1" />);

    await user.type(screen.getByRole("textbox", { name: "scan.label" }), "2026/00003{Enter}");

    const live = container.querySelector('[aria-live="polite"]');
    if (!(live instanceof HTMLElement)) throw new Error("result region missing");
    expect(await within(live).findByText("scan.unexpectedDetail")).toBeInTheDocument();
    expect(container.querySelector('[data-tone="warning"]')).not.toBeNull();
  });

  it("shows unexpected copies apart from the scanned and remaining counts", () => {
    render(<StocktakeSessionView stocktakeId="st-1" />);
    const strip = screen.getByRole("group", { name: "progress.heading" });
    expect(within(strip).getByText("result.unexpected")).toBeInTheDocument();
    expect(within(strip).getByText("2")).toBeInTheDocument();
  });

  it("says a code is not in the collection without looking up a book", async () => {
    mocks.scan.mockImplementation(
      (
        _input: unknown,
        options: { onSuccess: (response: { data: { outcome: string }[] }) => void },
      ) => {
        options.onSuccess({ data: [{ outcome: "rejected" }] });
      },
    );
    const user = userEvent.setup();
    const { container } = render(<StocktakeSessionView stocktakeId="st-1" />);

    await user.type(screen.getByRole("textbox", { name: "scan.label" }), "XX-1{Enter}");

    await waitFor(() => {
      expect(mocks.scan).toHaveBeenCalledTimes(1);
    });
    const live = container.querySelector('[aria-live="polite"]');
    await waitFor(() => {
      expect(live).toHaveTextContent("scan.recent.rejected");
    });
    expect(mocks.findCopy).not.toHaveBeenCalled();
  });

  it("shows the not-found page for an unknown session, without a retry", () => {
    sessionFailure.current = new ApiError({
      status: 404,
      code: "LIBRARY_STOCKTAKE_NOT_FOUND",
      message: "missing",
    });
    render(<StocktakeSessionView stocktakeId="00000000-0000-0000-0000-000000000000" />);

    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToList" })).toHaveAttribute(
      "href",
      "/library/stocktake",
    );
    expect(screen.queryByRole("textbox", { name: "scan.label" })).not.toBeInTheDocument();
  });

  it("offers closing the session from the header only while it runs", () => {
    render(<StocktakeSessionView stocktakeId="st-1" />);
    expect(screen.getByRole("button", { name: "close" })).toBeInTheDocument();
  });

  it("shows the reconciliation and no scanner once the session is closed", () => {
    mocks.status = "closed";
    render(<StocktakeSessionView stocktakeId="st-1" />);
    expect(screen.getByRole("region", { name: "reconciliation" })).toHaveTextContent("st-1");
    expect(screen.queryByRole("textbox", { name: "scan.label" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "close" })).not.toBeInTheDocument();
  });

  it("shows no reconciliation while the session still runs", () => {
    render(<StocktakeSessionView stocktakeId="st-1" />);
    expect(screen.queryByRole("region", { name: "reconciliation" })).not.toBeInTheDocument();
  });

  // A copy not scanned yet in a running session is not lost: "Hilang" is
  // the closed session's verdict.
  it("calls the live unscanned count not scanned yet, never missing", () => {
    render(<StocktakeSessionView stocktakeId="st-1" />);
    expect(screen.getByText("progress.remaining")).toBeInTheDocument();
    expect(screen.queryByText("result.missing")).not.toBeInTheDocument();
  });

  // The download is named from the session it reports on, not its raw id.
  it("hands the loaded session to the report download", async () => {
    mocks.status = "closed";
    const user = userEvent.setup();
    render(<StocktakeSessionView stocktakeId="st-1" />);

    await user.click(screen.getByRole("button", { name: "downloadReport" }));

    expect(downloadReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: "st-1", name: "Opname semester 1", started_on: "2026-11-02" }),
    );
  });
});
