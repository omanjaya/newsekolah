import { ApiError } from "@newsekolah/api-client";
import type * as Ui from "@newsekolah/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type * as PermitsApi from "../api";

const scanGate = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `errors.${code}`,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { disabled_modules: [] } }),
}));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof PermitsApi>();
  return { ...actual, useScanGateMutation: () => ({ mutateAsync: scanGate, isPending: false }) };
});
vi.mock("@newsekolah/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof Ui>();
  return {
    ...actual,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
    // A stand-in for the camera scanner: one button sends a gate payload.
    Scanner: ({
      onScan,
      result,
    }: {
      onScan: (event: { code: string }) => Promise<boolean>;
      result: { title: string; description?: string } | null;
    }) => (
      <div>
        <button type="button" onClick={() => void onScan({ code: "sion:gate:inst-1:tok" })}>
          scan
        </button>
        {result && <p data-testid="result">{result.description}</p>}
      </div>
    ),
  };
});

import { GatePanel } from "./exit-permit-panels";

describe("GatePanel", () => {
  it("tells the guard to ask the student for a new code when the gate QR is gone", async () => {
    scanGate.mockRejectedValue(
      new ApiError({ status: 410, code: "SCAN_TOKEN_GONE", message: "gone" }),
    );
    render(<GatePanel />);

    fireEvent.click(screen.getByRole("button", { name: "scan" }));

    const result = await screen.findByTestId("result");
    expect(result).toHaveTextContent("app.permits.exit.gate.tokenGone");
    expect(result).not.toHaveTextContent("errors.SCAN_TOKEN_GONE");
  });

  it("keeps the shared error copy for other refusals", async () => {
    scanGate.mockRejectedValue(
      new ApiError({ status: 409, code: "WORKFLOW_NOT_APPROVED", message: "no" }),
    );
    render(<GatePanel />);

    fireEvent.click(screen.getByRole("button", { name: "scan" }));

    expect(await screen.findByTestId("result")).toHaveTextContent("errors.WORKFLOW_NOT_APPROVED");
  });
});
