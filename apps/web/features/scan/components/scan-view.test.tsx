import type * as Ui from "@newsekolah/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const dispatch = vi.hoisted(() => vi.fn());

vi.mock("./use-scan-dispatch", () => ({ useScanDispatch: () => dispatch }));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { disabled_modules: [] } }),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@newsekolah/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof Ui>();
  return {
    ...actual,
    useScanFeedback: () => ({ playSuccess: vi.fn(), playError: vi.fn() }),
    // A stand-in for the camera scanner: one button per code, the result
    // banner, and the history slot.
    Scanner: ({
      onScan,
      result,
      children,
    }: {
      onScan: (event: { code: string }) => Promise<boolean>;
      result: { title: string; description: string } | null;
      children: ReactNode;
    }) => (
      <div>
        <button type="button" onClick={() => void onScan({ code: "sion:a" })}>
          scan-a
        </button>
        <button type="button" onClick={() => void onScan({ code: "sion:b" })}>
          scan-b
        </button>
        {result && (
          <p data-testid="result">
            {result.title}: {result.description}
          </p>
        )}
        {children}
      </div>
    ),
  };
});

import { ScanView } from "./scan-view";

describe("ScanView", () => {
  it("shows the latest outcome as the result and earlier ones in the history", async () => {
    dispatch
      .mockResolvedValueOnce({ key: "1", ok: true, message: "Kehadiran tercatat" })
      .mockResolvedValueOnce({ key: "2", ok: false, message: "Kode kedaluwarsa" });
    render(<ScanView />);

    fireEvent.click(screen.getByRole("button", { name: "scan-a" }));
    expect(await screen.findByTestId("result")).toHaveTextContent(
      "successTitle: Kehadiran tercatat",
    );
    expect(screen.queryByRole("heading", { name: "historyTitle" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "scan-b" }));
    expect(await screen.findByRole("heading", { name: "historyTitle" })).toBeInTheDocument();
    expect(screen.getByTestId("result")).toHaveTextContent("errorTitle: Kode kedaluwarsa");
    expect(screen.getByText("Kehadiran tercatat")).toBeInTheDocument();
  });

  it("introduces what the scanner handles under the page title", () => {
    render(<ScanView />);
    expect(screen.getByText("intro")).toBeInTheDocument();
  });
});
