import type * as UiModule from "@newsekolah/ui";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, expect, it, vi } from "vitest";

import { MonthlyReportTab } from "./monthly-report-tab";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/hooks/use-date-filter", () => ({
  useDateFilter: (_key: string, fallback: string) => [fallback, vi.fn()],
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "x-a", name: "X-A" }] }, isLoading: false }),
  useGradeLevelsQuery: () => ({ data: { data: [] }, isLoading: false }),
  useClassEnrollmentsQuery: () => ({ data: { data: [] }, isLoading: false }),
}));
vi.mock("../../reference/directory-names", () => ({ useDirectoryNames: () => new Map() }));
vi.mock("./monthly-attendance-table", () => ({ MonthlyAttendanceTable: () => null }));

beforeAll(() => {
  // Radix Select reads pointer-capture and scroll APIs jsdom does not implement.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
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

it("starts the recap download from the class on screen, and cannot send it without one", async () => {
  const user = userEvent.setup();
  render(<MonthlyReportTab />);

  // No class yet: the dialog asks for one and Unduh stays off.
  await user.click(screen.getByRole("button", { name: "downloadRecap" }));
  let dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("exportScopeHint")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "export" })).toBeDisabled();
  await user.keyboard("{Escape}");

  await user.click(screen.getByRole("combobox", { name: "class" }));
  await user.click(screen.getByRole("option", { name: "X-A" }));
  await user.click(screen.getByRole("button", { name: "downloadRecap" }));

  dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("combobox", { name: "class" })).toHaveTextContent("X-A");
  expect(within(dialog).queryByText("exportScopeHint")).not.toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "export" })).toBeEnabled();
});
