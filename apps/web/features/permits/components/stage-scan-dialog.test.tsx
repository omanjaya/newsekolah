import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../api", () => ({ decodeScanPayload: (raw: string) => ({ token: raw }) }));
// The real Scanner needs a camera; this stand-in submits one code.
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return {
    ...actual,
    useToast: () => ({ success: state.success, error: state.error }),
    Scanner: ({ onScan }: UiModule.ScannerProps) => (
      <button
        type="button"
        onClick={() => void onScan({ code: "TOKEN-1", source: "manual", at: 0 })}
      >
        scan
      </button>
    ),
  };
});

import { StageScanDialog } from "./stage-scan-dialog";

beforeEach(() => {
  state.success.mockReset();
});

function renderDialog(successMessage: string | ((result: { done: boolean }) => string)) {
  const onOpenChange = vi.fn();
  render(
    <StageScanDialog
      open
      onOpenChange={onOpenChange}
      title="Pindai QR"
      description="desc"
      manualLabel="manual"
      successMessage={successMessage}
      pending={false}
      onToken={(token: string) => Promise.resolve({ done: token === "TOKEN-1" })}
    />,
  );
  return onOpenChange;
}

it("toasts a fixed success message and closes", async () => {
  const user = userEvent.setup();
  const onOpenChange = renderDialog("Tahap disetujui");
  await user.click(screen.getByRole("button", { name: "scan" }));
  expect(state.success).toHaveBeenCalledWith("Tahap disetujui");
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("derives the success message from the scan's result", async () => {
  const user = userEvent.setup();
  renderDialog((result) => (result.done ? "finished" : "stageApproved"));
  await user.click(screen.getByRole("button", { name: "scan" }));
  expect(state.success).toHaveBeenCalledWith("finished");
});
