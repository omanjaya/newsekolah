import { ApiError } from "@newsekolah/api-client";
import type * as UiModule from "@newsekolah/ui";
import { Dialog, DialogContent } from "@newsekolah/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: vi.fn(), recordLate: vi.fn(), recordExit: vi.fn() }));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/api", () => ({
  usePeriodsQuery: () => ({
    data: {
      data: [
        { id: "p1", name: "Jam 1", starts_at: "07:00:00", ends_at: "07:45:00", is_break: false },
        {
          id: "b1",
          name: "Istirahat 1",
          starts_at: "07:45:00",
          ends_at: "08:00:00",
          is_break: true,
        },
        { id: "p2", name: "Jam 2", starts_at: "08:00:00", ends_at: "08:45:00", is_break: false },
      ],
    },
    isLoading: false,
  }),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return {
    ...directoryNamesStub([{ id: "s1", name: "Sari" }]),
    useDirectorySearch: mocks.search,
  };
});
vi.mock("../api", () => ({
  useRecordExitPermitByStaffMutation: () => ({ mutate: mocks.recordExit, isPending: false }),
  useRecordLateArrivalByStaffMutation: () => ({
    mutateAsync: mocks.recordLate,
    isPending: false,
  }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { DutyManualRecordPanel } from "./duty-manual-record-panel";

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search.mockReturnValue({
    data: [{ id: "s1", name: "Sari", username: "sari" }],
    isFetching: false,
  });
});

describe("DutyManualRecordPanel student search", () => {
  it("lists a short server page of students and narrows it by the typed query", async () => {
    const user = userEvent.setup();
    render(<DutyManualRecordPanel />);

    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ profileKind: "student", query: "", limit: 30 }),
    );
    expect(screen.getByRole("button", { name: /Sari/ })).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "studentSearchPlaceholder" }), "sar");
    await waitFor(() => {
      expect(mocks.search).toHaveBeenLastCalledWith(expect.objectContaining({ query: "sar" }));
    });
  });

  it("shows the chosen student by name from the lookup", async () => {
    const user = userEvent.setup();
    render(<DutyManualRecordPanel />);

    await user.click(screen.getByRole("button", { name: /Sari/ }));

    expect(screen.getAllByText("Sari").length).toBeGreaterThan(0);
  });
});

describe("DutyManualRecordPanel exit periods", () => {
  it("offers lessons with their times, no breaks, and ends no earlier than the start", async () => {
    // Radix Select reads pointer-capture and scroll APIs jsdom does not implement.
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
    const user = userEvent.setup();
    render(<DutyManualRecordPanel />);

    await user.click(screen.getByRole("combobox", { name: /startPeriod/ }));
    expect(screen.getByRole("option", { name: "Jam 1 (07.00 – 07.45)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Istirahat/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Jam 2 (08.00 – 08.45)" }));

    await user.click(screen.getByRole("combobox", { name: /endPeriod/ }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Jam 2 (08.00 – 08.45)",
    ]);
  });
});

describe("DutyManualRecordPanel in a dialog", () => {
  it("ends with Batal beside the primary action, which closes the dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent title="title">
          <DutyManualRecordPanel layout="dialog" />
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "submit" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("DutyManualRecordPanel kind switch", () => {
  it("starts the late form clean after a refused exit permit", async () => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
    mocks.recordExit.mockImplementation((_body, { onError }: { onError: (e: unknown) => void }) => {
      onError(new ApiError({ status: 409, code: "EXIT_PERMIT_ALREADY_TODAY", message: "x" }));
    });
    const user = userEvent.setup();
    render(<DutyManualRecordPanel />);

    await user.click(screen.getByRole("button", { name: /Sari/ }));
    await user.type(screen.getByRole("textbox", { name: /destination/ }), "Jemput adik");
    await user.click(screen.getByRole("combobox", { name: /startPeriod/ }));
    await user.click(screen.getByRole("option", { name: /Jam 1/ }));
    await user.click(screen.getByRole("combobox", { name: /endPeriod/ }));
    await user.click(screen.getByRole("option", { name: /Jam 2/ }));
    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(mocks.recordExit).toHaveBeenCalled();
    expect(screen.getByText("EXIT_PERMIT_ALREADY_TODAY")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "kindLate" }));

    expect(screen.queryByText("EXIT_PERMIT_ALREADY_TODAY")).not.toBeInTheDocument();
    expect(screen.queryByText("requiredError")).not.toBeInTheDocument();
  });

  it("does not flag the other kind's fields after an empty submit", async () => {
    const user = userEvent.setup();
    render(<DutyManualRecordPanel />);

    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(screen.getByText("studentRequired")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "kindLate" }));

    expect(screen.queryByText("studentRequired")).not.toBeInTheDocument();
    expect(screen.queryByText("requiredError")).not.toBeInTheDocument();
  });
});
