import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => true,
}));
vi.mock("../api", () => ({
  useStaffAttendanceScheduleQuery: () => ({ data: { data: [] }, isLoading: false }),
  useReplaceStaffAttendanceScheduleMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { ScheduleEditorView } from "./schedule-editor-view";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
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

it("offers staff who have no work schedule yet, so a fresh school can give the first one", async () => {
  render(
    <ScheduleEditorView
      employees={[
        { id: "guru", name: "Guru Contoh", has_schedule: false },
        { id: "satpam", name: "Satpam Contoh", has_schedule: true },
      ]}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "schedule.employee" }));

  const guru = screen.getByRole("option", { name: /Guru Contoh/ });
  expect(guru).toHaveTextContent("noSchedule");
  expect(screen.getByRole("option", { name: /Satpam Contoh/ })).not.toHaveTextContent("noSchedule");
  expect(screen.queryByText("empty")).not.toBeInTheDocument();

  await userEvent.click(guru);
  // The weekly form opens for the chosen person.
  expect(screen.getByText("schedule.weekdays.1")).toBeInTheDocument();
});
