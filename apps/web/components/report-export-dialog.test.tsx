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
      columns: [{ key: "no" }, { key: "name" }, { key: "status" }],
    });
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

  it("sends a label override only for a renamed column", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    renderDialog(onExport);

    const nameField = screen.getByRole("textbox", { name: 'columnLabel:{"column":"Name"}' });
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "Nama Siswa");
    await userEvent.click(screen.getByRole("button", { name: "export" }));

    const call = onExport.mock.calls[0]?.[0] as ReportExportOptions;
    expect(call.columns).toContainEqual({ key: "name", label: "Nama Siswa" });
    expect(call.columns.find((c) => c.key === "no")).toEqual({ key: "no" });
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
});
