import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import { beforeAll, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../api", () => ({
  useRecordStaffAttendanceManualMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./employee-combobox", () => ({ EmployeeCombobox: () => null }));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { ManualEntryDialog } from "./manual-entry-dialog";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});

it("stacks the arrival and departure pickers on a phone, side by side from 640px", () => {
  render(
    <ManualEntryDialog
      open
      onOpenChange={vi.fn()}
      employees={[]}
      defaultDate="2026-11-19"
      today="2026-11-19"
    />,
  );

  const arrival = screen.getByRole("combobox", { name: "manualForm.arrival" });
  const departure = screen.getByRole("combobox", { name: "manualForm.departure" });
  // Two pickers in one row of a phone's sheet cut "Jam datang" short.
  const group = screen.getByRole("group", { name: "manualForm.hours" });
  expect(group).toContainElement(arrival);
  expect(group).toContainElement(departure);
  expect(group).toHaveClass("sm:grid-cols-2");
  expect(group).not.toHaveClass("grid-cols-2");
});
