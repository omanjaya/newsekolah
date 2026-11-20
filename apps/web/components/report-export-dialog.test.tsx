import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportExportDialog, type ReportExportOptions } from "./report-export-dialog";

vi.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string, params?: Record<string, unknown>): string =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

const COLUMNS = [
  { key: "no", label: "No" },
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
];

function renderDialog(onExport: (options: ReportExportOptions) => Promise<void>) {
  return render(
    <ReportExportDialog
      open
      onOpenChange={vi.fn()}
      reportKey="test.report"
      defaultTitle="Test Report"
      availableColumns={COLUMNS}
      onExport={onExport}
    />,
  );
}

describe("ReportExportDialog", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("exports every column, in order, by default", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    renderDialog(onExport);

    await userEvent.click(screen.getByRole("button", { name: "export" }));

    expect(onExport).toHaveBeenCalledWith({
      format: "xlsx",
      title: "Test Report",
      showLetterhead: true,
      columns: [
        { key: "no", label: "No" },
        { key: "name", label: "Name" },
        { key: "status", label: "Status" },
      ],
    });
  });

  it("keeps Unduh disabled while the caller's scope is incomplete", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(
      <ReportExportDialog
        open
        onOpenChange={vi.fn()}
        reportKey="test.report"
        defaultTitle="Test Report"
        availableColumns={COLUMNS}
        onExport={onExport}
        exportDisabled
        scopeSlot={<p>pick a class</p>}
      />,
    );

    const button = screen.getByRole("button", { name: "export" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onExport).not.toHaveBeenCalled();
  });

  it("excludes a column the user unchecks", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    renderDialog(onExport);

    await userEvent.click(
      screen.getByRole("checkbox", { name: 'includeColumn:{"column":"Name"}' }),
    );
    await userEvent.click(screen.getByRole("button", { name: "export" }));

    const call = onExport.mock.calls[0]?.[0] as ReportExportOptions;
    expect(call.columns.map((c) => c.key)).toEqual(["no", "status"]);
  });

  it("moving a column down changes the exported order", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    renderDialog(onExport);

    await userEvent.click(screen.getByRole("button", { name: 'moveDown:{"column":"No"}' }));
    await userEvent.click(screen.getByRole("button", { name: "export" }));

    const call = onExport.mock.calls[0]?.[0] as ReportExportOptions;
    expect(call.columns.map((c) => c.key)).toEqual(["name", "no", "status"]);
  });

  it("sends the label shown for every column, so the file matches the dialog", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    renderDialog(onExport);

    const nameField = screen.getByRole("textbox", { name: 'columnLabel:{"column":"Name"}' });
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "Nama Siswa");
    await userEvent.click(screen.getByRole("button", { name: "export" }));

    const call = onExport.mock.calls[0]?.[0] as ReportExportOptions;
    expect(call.columns).toContainEqual({ key: "name", label: "Nama Siswa" });
    // An untouched column sends its default too: the server's own label
    // for it may be worded differently.
    expect(call.columns.find((c) => c.key === "no")).toEqual({ key: "no", label: "No" });
  });

  it("switches format to pdf and back through the segmented control", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    renderDialog(onExport);

    await userEvent.click(screen.getByRole("radio", { name: "formatPdf" }));
    await userEvent.click(screen.getByRole("button", { name: "export" }));

    const call = onExport.mock.calls[0]?.[0] as ReportExportOptions;
    expect(call.format).toBe("pdf");
  });

  it("restore defaults undoes column and format changes", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    renderDialog(onExport);

    await userEvent.click(screen.getByRole("radio", { name: "formatPdf" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: 'includeColumn:{"column":"Name"}' }),
    );
    await userEvent.click(screen.getByRole("button", { name: "restoreDefaults" }));
    await userEvent.click(screen.getByRole("button", { name: "export" }));

    const call = onExport.mock.calls[0]?.[0] as ReportExportOptions;
    expect(call.format).toBe("xlsx");
    expect(call.columns.map((c) => c.key)).toEqual(["no", "name", "status"]);
  });

  it("recalls the last choice from localStorage on the next mount", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderDialog(onExport);

    await userEvent.click(
      screen.getByRole("checkbox", { name: 'includeColumn:{"column":"Status"}' }),
    );
    await userEvent.click(screen.getByRole("button", { name: "export" }));
    unmount();

    const secondExport = vi.fn().mockResolvedValue(undefined);
    renderDialog(secondExport);
    await userEvent.click(screen.getByRole("button", { name: "export" }));

    const call = secondExport.mock.calls[0]?.[0] as ReportExportOptions;
    expect(call.columns.map((c) => c.key)).toEqual(["no", "name"]);
  });

  it("remembers a renamed label but lets an untouched one follow the report's default", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderDialog(onExport);

    const statusField = screen.getByRole("textbox", { name: 'columnLabel:{"column":"Status"}' });
    await userEvent.clear(statusField);
    await userEvent.type(statusField, "Keterangan");
    await userEvent.click(screen.getByRole("button", { name: "export" }));
    unmount();

    // The report's default header changes (another language, or a
    // rewording); the reader never renamed "Name", so it follows.
    const secondExport = vi.fn().mockResolvedValue(undefined);
    render(
      <ReportExportDialog
        open
        onOpenChange={vi.fn()}
        reportKey="test.report"
        defaultTitle="Test Report"
        availableColumns={[
          { key: "no", label: "No." },
          { key: "name", label: "Student name" },
          { key: "status", label: "Status" },
        ]}
        onExport={secondExport}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: 'columnLabel:{"column":"Student name"}' }),
    ).toHaveValue("Student name");
    await userEvent.click(screen.getByRole("button", { name: "export" }));

    const call = secondExport.mock.calls[0]?.[0] as ReportExportOptions;
    expect(call.columns).toEqual([
      { key: "no", label: "No." },
      { key: "name", label: "Student name" },
      { key: "status", label: "Keterangan" },
    ]);
  });

  it("drops the labels of a choice saved before renames alone were kept, but keeps its order", async () => {
    // Saved by the earlier dialog, which stored every label: the defaults
    // of its day in Title Case Indonesian, whatever the reader's language.
    window.localStorage.setItem(
      "newsekolah:report-export:test.report",
      JSON.stringify({
        format: "pdf",
        showLetterhead: false,
        columns: [
          { key: "name", label: "Nama Siswa", included: true },
          { key: "no", label: "No", included: true },
          { key: "status", label: "Status", included: false },
        ],
      }),
    );
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(
      <ReportExportDialog
        open
        onOpenChange={vi.fn()}
        reportKey="test.report"
        defaultTitle="Test Report"
        availableColumns={[
          { key: "no", label: "No" },
          { key: "name", label: "Nama siswa" },
          { key: "status", label: "Status" },
        ]}
        onExport={onExport}
      />,
    );

    expect(
      screen.getByRole("textbox", { name: 'columnLabel:{"column":"Nama siswa"}' }),
    ).toHaveValue("Nama siswa");
    await userEvent.click(screen.getByRole("button", { name: "export" }));

    expect(onExport).toHaveBeenCalledWith({
      format: "pdf",
      title: "Test Report",
      showLetterhead: false,
      columns: [
        { key: "name", label: "Nama siswa" },
        { key: "no", label: "No" },
      ],
    });
    // The choice moves to the current store, and the old entry goes.
    expect(window.localStorage.getItem("newsekolah:report-export:test.report")).toBeNull();
    expect(window.localStorage.getItem("newsekolah:report-export:v2:test.report")).not.toBeNull();
  });

  it("hides the column list and exports without needing one when columnsCustomizable is false", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(
      <ReportExportDialog
        open
        onOpenChange={vi.fn()}
        reportKey="test.no-columns"
        defaultTitle="Ringkasan Katalog"
        availableColumns={[]}
        columnsCustomizable={false}
        onExport={onExport}
      />,
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const exportButton = screen.getByRole("button", { name: "export" });
    expect(exportButton).toBeEnabled();

    await userEvent.click(exportButton);

    expect(onExport).toHaveBeenCalledWith({
      format: "xlsx",
      title: "Ringkasan Katalog",
      showLetterhead: true,
      columns: [],
    });
  });
});
