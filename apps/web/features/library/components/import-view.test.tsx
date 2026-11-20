import { ApiError } from "@newsekolah/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string, values?: Record<string, unknown>): string =>
      values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/import",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("./library-workspace-nav", () => ({
  LibraryWorkspaceNav: () => null,
  useLibraryShortcuts: () => [],
}));
// The shared catalog is told apart from the library's own messages, which
// the next-intl mock renders as their bare key.
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `shared:${code}`,
}));
vi.mock("../import-lib", () => ({
  parseImportFile: () =>
    Promise.resolve({
      headers: ["Judul*", "Jenis Bahan (kode)", "Kategori (kode)", "Barcode"],
      rows: [
        { "Judul*": "Laskar Pelangi", "Jenis Bahan (kode)": "bk", "Kategori (kode)": "fiksi" },
        {
          "Judul*": "Bumi Manusia",
          "Jenis Bahan (kode)": "bk",
          "Kategori (kode)": "fiksi",
          Barcode: "2026/00001",
        },
      ],
    }),
}));
vi.mock("../import-api", () => ({
  downloadLibraryImportTemplate: vi.fn(),
  useLibraryImportPreviewMutation: () => ({ mutateAsync: mocks.preview, isPending: false }),
  useLibraryImportCommitMutation: () => ({ mutateAsync: mocks.commit, isPending: false }),
}));

import { ImportView } from "./import-view";

async function reachPreview() {
  const user = userEvent.setup();
  const { container } = render(<ImportView />);
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input");
  await user.upload(input, new File(["x"], "koleksi.xlsx"));
  await user.click(await screen.findByRole("button", { name: "continue" }));
  await user.click(await screen.findByRole("button", { name: "commit" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue({
    rows: [
      { row_number: 1, status: "new_title", message: "", title: "Laskar Pelangi", copies: 1 },
      { row_number: 2, status: "new_title", message: "", title: "Bumi Manusia", copies: 1 },
    ],
    summary: { new_titles: 2, existing_titles: 0, copies: 2, errors: 0 },
  });
});

describe("ImportView commit failure", () => {
  // A copy number taken between preview and commit used to stop the whole
  // file with only "Barcode eksemplar ini sudah dipakai", leaving the
  // librarian to hunt for the row.
  it("names the row the API reports", async () => {
    mocks.commit.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "LIBRARY_COPY_BARCODE_EXISTS",
        message: "Barcode eksemplar sudah dipakai.",
        details: [{ field: "row_number", code: "2" }],
      }),
    );
    await reachPreview();
    await waitFor(() => {
      expect(
        screen.getByText(
          'commitRowError {"row":"2","message":"shared:LIBRARY_COPY_BARCODE_EXISTS."}',
        ),
      ).toBeInTheDocument();
    });
  });

  // The accession code is a library message, not one from the shared
  // catalog, so it used to fall back to the generic "try again".
  it("words a taken accession number with the library's own message", async () => {
    mocks.commit.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "LIBRARY_COPY_ACCESSION_EXISTS",
        message: "Nomor induk sudah dipakai.",
        details: [{ field: "row_number", code: "5" }],
      }),
    );
    await reachPreview();
    await waitFor(() => {
      expect(
        screen.getByText('commitRowError {"row":"5","message":"LIBRARY_COPY_ACCESSION_EXISTS."}'),
      ).toBeInTheDocument();
    });
  });

  it("keeps the plain message when no row is named", async () => {
    mocks.commit.mockRejectedValue(
      new ApiError({ status: 403, code: "LIBRARY_MODULE_DISABLED", message: "x" }),
    );
    await reachPreview();
    expect(await screen.findByText("LIBRARY_MODULE_DISABLED")).toBeInTheDocument();
  });

  it("maps the template's coded columns before asking for a preview", async () => {
    mocks.commit.mockResolvedValue({ created_titles: 2, created_copies: 2 });
    await reachPreview();
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        mapping: {
          title: "Judul*",
          material_type: "Jenis Bahan (kode)",
          category: "Kategori (kode)",
          barcode: "Barcode",
        },
      }),
    );
  });
});
