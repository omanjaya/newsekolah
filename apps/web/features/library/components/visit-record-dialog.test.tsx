import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
const recorded: { visit: Record<string, unknown> } = vi.hoisted(() => ({ visit: {} }));
const mutate = vi.hoisted(() =>
  vi.fn((_body: unknown, options: { onSuccess: (visit: unknown) => void }) => {
    options.onSuccess(recorded.visit);
  }),
);

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations:
    () =>
    (key: string, values?: Record<string, unknown>): string =>
      values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => toast };
});
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Makassar" }));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../visits-api", () => ({
  useRecordLibraryVisitMutation: () => ({ mutate, isPending: false }),
}));

import { VisitRecordDialog } from "./visit-record-dialog";

beforeEach(() => {
  toast.success.mockReset();
  toast.info.mockReset();
  mutate.mockClear();
});

async function recordMemberVisit(purpose: string) {
  render(<VisitRecordDialog open onOpenChange={vi.fn()} onRecorded={vi.fn()} />);
  await userEvent.click(screen.getByRole("combobox", { name: "memberPlaceholder" }));
  if (purpose) await userEvent.type(screen.getByRole("textbox", { name: /^purpose/ }), purpose);
  await userEvent.click(screen.getByRole("button", { name: "submit" }));
}

// Optional fields are marked by Field's muted "(opsional)" suffix, as on
// every other add sheet; Keperluan used to say so only in its placeholder.
describe("VisitRecordDialog", () => {
  it("marks the purpose optional through Field and keeps an example as its placeholder", () => {
    render(<VisitRecordDialog open onOpenChange={vi.fn()} onRecorded={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: "purpose (opsional)" })).toHaveAttribute(
      "placeholder",
      "purposePlaceholder",
    );
  });

  it("confirms a new visit", async () => {
    recorded.visit = { id: "v1", visited_at: "2026-11-20T08:10:00Z", already_recorded: false };
    await recordMemberVisit("Membaca");

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("recorded");
    expect(toast.info).not.toHaveBeenCalled();
  });

  // A repeat inside the 30-minute window used to close the dialog as if
  // saved while the server kept the first visit and dropped the new purpose.
  it("says the visit was already recorded and which purpose was kept", async () => {
    recorded.visit = {
      id: "v1",
      visited_at: "2026-11-20T08:10:00Z",
      purpose: "Membaca pertama",
      already_recorded: true,
    };
    await recordMemberVisit("Membaca kedua");

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      `alreadyRecorded ${JSON.stringify({ time: "16.10" })}`,
      {
        description: `purposeKept ${JSON.stringify({ purpose: "Membaca pertama" })}`,
      },
    );
  });

  it("does not mention the purpose when the one sent was saved", async () => {
    recorded.visit = {
      id: "v1",
      visited_at: "2026-11-20T08:10:00Z",
      purpose: "Membaca",
      already_recorded: true,
    };
    await recordMemberVisit("Membaca");

    expect(toast.info).toHaveBeenCalledWith(
      `alreadyRecorded ${JSON.stringify({ time: "16.10" })}`,
      undefined,
    );
  });
});
