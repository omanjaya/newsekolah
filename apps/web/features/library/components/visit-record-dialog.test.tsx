import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../visits-api", () => ({
  useRecordLibraryVisitMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { VisitRecordDialog } from "./visit-record-dialog";

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
});
