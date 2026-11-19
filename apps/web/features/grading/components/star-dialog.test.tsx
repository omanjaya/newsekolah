import type * as UiModule from "@newsekolah/ui";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../api", () => ({
  useGiveStarMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { StarDialog } from "./star-dialog";

beforeAll(() => {
  // The segmented control measures its options.
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

function renderDialog(currentBalance: number | null) {
  render(
    <StarDialog
      onOpenChange={vi.fn()}
      studentId="s1"
      studentName="Ani"
      classId="class-1"
      currentBalance={currentBalance}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("StarDialog balance line", () => {
  it("shows a loaded balance", () => {
    renderDialog(4);
    expect(screen.getByText('currentBalance:{"count":4}')).toBeInTheDocument();
  });

  it("says the balance is unknown while it is, never a false zero", () => {
    renderDialog(null);
    expect(screen.getByText("currentBalanceUnknown")).toBeInTheDocument();
    expect(screen.queryByText(/currentBalance:/)).not.toBeInTheDocument();
  });
});
