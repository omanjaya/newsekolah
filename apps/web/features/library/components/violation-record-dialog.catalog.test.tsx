import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, expect, it, vi } from "vitest";

import library from "../../../messages/features/library.id.json";

vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../violations-api", () => ({
  useCreateLibraryViolationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ViolationRecordDialog } from "./violation-record-dialog";

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

describe("ViolationRecordDialog with the real catalog", () => {
  it("resolves the penalty label from the catalog without a missing message", () => {
    render(
      <NextIntlClientProvider
        locale="id"
        messages={{ app: { library }, common: {} }}
        onError={(error) => {
          throw error;
        }}
      >
        <ViolationRecordDialog open onOpenChange={vi.fn()} onRecorded={vi.fn()} />
      </NextIntlClientProvider>,
    );

    expect(screen.getAllByText("Denda").length).toBeGreaterThan(0);
  });
});
