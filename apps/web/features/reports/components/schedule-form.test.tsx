import { ApiError } from "@newsekolah/api-client";
import type * as Ui from "@newsekolah/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScheduleForm } from "./schedule-form";

const updateMutate = vi.fn();
const toastError = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
      { has: () => false },
    ),
  useLocale: () => "id",
}));
vi.mock("@newsekolah/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof Ui>()),
  useToast: () => ({ success: vi.fn(), error: toastError }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `error:${code}`,
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: undefined, isLoading: false }),
  useSubjectsQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("../api", () => ({
  useReportsQuery: () => ({
    data: { data: [{ kind: "discipline.points", arguments: [] }] },
    isLoading: false,
  }),
  useReportTermsQuery: () => ({ data: undefined, isLoading: false }),
  useCreateReportScheduleMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateReportScheduleMutation: () => ({ mutate: updateMutate, isPending: false }),
}));

afterEach(() => {
  cleanup();
  updateMutate.mockReset();
  toastError.mockReset();
});

const initial = {
  id: "s1",
  report_kind: "discipline.points",
  params: {},
  cadence: "daily" as const,
  format: "xlsx" as const,
  hour: 11,
  recipients: ["kepala@contoh.sch.id", "tu@contoh.sch.id"],
  enabled: true,
  next_run_at: "2026-11-21T03:00:00Z",
  created_by: "u1",
  created_at: "2026-11-20T00:00:00Z",
  updated_at: "2026-11-20T00:00:00Z",
};

describe("ScheduleForm", () => {
  it("marks the recipients field with the address that is not a school account", () => {
    updateMutate.mockImplementation((_body, { onError }: { onError: (e: unknown) => void }) => {
      onError(
        new ApiError({
          status: 400,
          code: "VALIDATION_FAILED",
          message: "invalid",
          details: [
            { field: "recipients", code: "NOT_TENANT_USER", message: "kepala@contoh.sch.id" },
          ],
        }),
      );
    });
    render(<ScheduleForm initial={initial} onDone={vi.fn()} />);
    expect(screen.getByText("recipientsHint")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(
      screen.getByText('recipientNotUser:{"email":"kepala@contoh.sch.id"}'),
    ).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();

    // Removing the rejected address clears the server's verdict.
    fireEvent.click(
      screen.getByRole("button", { name: 'removeRecipient:{"email":"kepala@contoh.sch.id"}' }),
    );
    expect(
      screen.queryByText('recipientNotUser:{"email":"kepala@contoh.sch.id"}'),
    ).not.toBeInTheDocument();
  });

  it("falls back to a toast for an error that is not about recipients", () => {
    updateMutate.mockImplementation((_body, { onError }: { onError: (e: unknown) => void }) => {
      onError(new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "boom" }));
    });
    render(<ScheduleForm initial={initial} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(toastError).toHaveBeenCalledWith("error:INTERNAL_ERROR");
  });
});
