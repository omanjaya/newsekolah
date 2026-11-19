import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import idMessages from "../../../messages/features/library.id.json";

import { ReadInPlaceDialog } from "./read-in-place-dialog";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Makassar" }));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../visits-api", () => ({
  useLibraryReadInPlaceQuery: () => ({ data: { data: [] }, isLoading: false }),
  useStartLibraryReadInPlaceMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("ReadInPlaceDialog", () => {
  it("marks both reader fields optional on their labels, not in a placeholder", () => {
    render(<ReadInPlaceDialog copyId="c1" onOpenChange={vi.fn()} />);

    // Field's own marker, the one every other form uses.
    expect(screen.getByText("member").closest("label")).toHaveTextContent("member (opsional)");
    expect(screen.getByText("visitorName").closest("label")).toHaveTextContent(
      "visitorName (opsional)",
    );
    expect(idMessages.readInPlace.memberPlaceholder).not.toMatch(/opsional/i);
  });
});
