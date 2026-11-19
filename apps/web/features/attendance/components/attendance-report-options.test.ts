import { describe, expect, it } from "vitest";

import en from "../../../messages/features/attendanceReports.en.json";
import id from "../../../messages/features/attendanceReports.id.json";

import {
  type ExportColumnLabel,
  dailyReportExportColumns,
  monthlyRecapExportColumns,
} from "./attendance-report-options";

const fromCatalog =
  (catalog: typeof id): ExportColumnLabel =>
  (key) =>
    catalog.exportColumns[key];

describe("attendance export columns", () => {
  it("names the daily columns from the catalogue, in sentence case like the server's headers", () => {
    expect(dailyReportExportColumns(fromCatalog(id))).toEqual([
      { key: "no", label: "No" },
      { key: "name", label: "Nama siswa" },
      { key: "status", label: "Status" },
      { key: "expected", label: "Jumlah sesi" },
      { key: "submitted", label: "Sesi terisi" },
      { key: "complete", label: "Lengkap" },
    ]);
    expect(dailyReportExportColumns(fromCatalog(en)).map((c) => c.label)).toEqual([
      "No.",
      "Student name",
      "Status",
      "Sessions",
      "Sessions filled",
      "Complete",
    ]);
  });

  it("keeps the school's own status labels in every language, as the export does", () => {
    const columns = monthlyRecapExportColumns(fromCatalog(en));
    expect(columns.map((c) => c.key)).toEqual([
      "no",
      "nis",
      "name",
      "status_H",
      "status_S",
      "status_I",
      "status_D",
      "status_A",
      "total",
      "percentage",
    ]);
    expect(columns.find((c) => c.key === "status_H")?.label).toBe("Hadir");
    expect(columns.find((c) => c.key === "percentage")?.label).toBe("Attendance rate");
  });
});
