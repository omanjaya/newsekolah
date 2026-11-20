import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { getMessages } from "../../../lib/i18n/get-messages";
import "../../../messages/features";
import type { LibraryImportPreview } from "../import-api";

import { ImportPreviewTable } from "./import-preview-table";

function renderPreview(locale: "id" | "en", rows: LibraryImportPreview["rows"]) {
  const preview: LibraryImportPreview = {
    rows,
    summary: { new_titles: 1, existing_titles: 1, copies: 5, errors: 2 },
  };
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale) as never}>
      <ImportPreviewTable
        preview={preview}
        onBack={vi.fn()}
        onCommit={vi.fn()}
        committing={false}
      />
    </NextIntlClientProvider>,
  );
}

const rows: LibraryImportPreview["rows"] = [
  {
    row_number: 2,
    status: "new_title",
    message_code: "NEW_TITLE",
    title: "Laskar Pelangi",
    copies: 3,
  },
  {
    row_number: 3,
    status: "existing_title",
    message_code: "EXISTING_TITLE",
    title: "Bumi",
    copies: 2,
  },
  {
    row_number: 4,
    status: "error",
    message_code: "MATERIAL_TYPE_UNKNOWN",
    title: "Ronggeng",
    copies: 0,
  },
  { row_number: 5, status: "error", message_code: "SOMETHING_NEW", title: "Cantik", copies: 0 },
  {
    row_number: 6,
    status: "error",
    message_code: "BARCODE_IN_FILE",
    message_value: "B-0100",
    message_row: 3,
    title: "Kembar",
    copies: 0,
  },
];

describe("ImportPreviewTable", () => {
  it("translates each row's message code in the admin's language", () => {
    renderPreview("id", rows);
    expect(screen.getAllByText("Judul baru, 3 eksemplar akan dibuat.").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Judul sudah ada, 2 eksemplar akan ditambahkan.").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Kode jenis bahan tidak dikenali.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Baris ini tidak bisa diimpor.").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Barcode B-0100 sudah dipakai di baris 3.").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/MATERIAL_TYPE_UNKNOWN|SOMETHING_NEW/)).not.toBeInTheDocument();
  });

  it("shows the same codes in English for an English-locale admin", () => {
    renderPreview("en", rows);
    expect(screen.getAllByText("New title, 3 copies will be created.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Material type code not recognised.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("This row cannot be imported.").length).toBeGreaterThan(0);
  });
});
