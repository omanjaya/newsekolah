import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

const KNOWN = new Set(["rowMessage.CLASS_NOT_FOUND", "rowMessage.unknown"]);

const mocks = vi.hoisted(() => ({ preview: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, { has: (key: string) => KNOWN.has(key) }),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../../../lib/hooks/use-active-year", () => ({
  useActiveYear: () => ({ id: "y1", label: "2026/2027" }),
}));
vi.mock("../../../lib/view-state/view-state-provider", () => ({
  useRememberedViewState: (_key: string, initial: unknown) => [initial, vi.fn()],
}));
vi.mock("../api", () => ({
  useAcademicYearsQuery: () => ({ data: { data: [{ id: "y1", label: "2026/2027" }] } }),
}));
vi.mock("../api-enrollment", () => ({
  useEnrollmentImportMutation: (kind: string) => ({
    mutate: kind === "preview" ? mocks.preview : vi.fn(),
    isPending: false,
  }),
}));
vi.mock("../lib/enrollment-import", () => ({ downloadEnrollmentImportTemplate: vi.fn() }));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { EnrollmentImportView } from "./enrollment-import-view";

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

describe("EnrollmentImportView row notes", () => {
  // The preview used to print the API's English sentence ("class not
  // found in this academic year") inside an Indonesian screen. Notes now
  // arrive as codes and read in the admin's language.
  it("translates each row's message code and never shows the raw code", async () => {
    mocks.preview.mockImplementation((_vars, options: { onSuccess: (data: unknown) => void }) => {
      options.onSuccess([
        {
          row_number: 2,
          nis: "2026101",
          class_name: "X-Z",
          action: "error",
          message_code: "CLASS_NOT_FOUND",
        },
        {
          row_number: 3,
          nis: "2026102",
          class_name: "X-A",
          action: "skipped",
          message_code: "BRAND_NEW",
        },
        { row_number: 4, nis: "2026103", class_name: "X-A", action: "assign" },
      ]);
    });
    const user = userEvent.setup();
    render(<EnrollmentImportView />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("no file input");
    await user.upload(input, new File(["x"], "kelas.xlsx"));

    expect((await screen.findAllByText("rowMessage.CLASS_NOT_FOUND")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("rowMessage.unknown").length).toBeGreaterThan(0);
    expect(screen.queryByText(/BRAND_NEW/)).not.toBeInTheDocument();
  });
});
