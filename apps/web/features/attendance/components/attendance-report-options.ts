import type { ClassRef, GradeLevel } from "../../reference/api";

export const STATUS_TOKEN: Record<
  string,
  "present" | "sick" | "excused" | "dispensation" | "absent" | "late"
> = {
  H: "present",
  S: "sick",
  I: "excused",
  D: "dispensation",
  A: "absent",
  INCOMPLETE: "late",
};

export function classOptions(classes: ClassRef[] | undefined) {
  return (classes ?? []).map((item) => ({ value: item.id, label: item.name }));
}

export function gradeLevelOptions(gradeLevels: GradeLevel[] | undefined) {
  return (gradeLevels ?? []).map((item) => ({ value: item.id, label: item.name }));
}

/**
 * The daily report export's columns, mirroring
 * apps/api/internal/modules/attendance/service/report.go's
 * dailyReportColumns exactly (key and default Indonesian label) --
 * {@link ReportExportDialog}'s `availableColumns`.
 */
export const DAILY_REPORT_EXPORT_COLUMNS = [
  { key: "no", label: "No" },
  { key: "name", label: "Nama Siswa" },
  { key: "status", label: "Status" },
  { key: "expected", label: "Jumlah Sesi" },
  { key: "submitted", label: "Sesi Terisi" },
  { key: "complete", label: "Lengkap" },
];

/**
 * The monthly recap export's columns for the tenant's default status
 * policy (H/S/I/D/A), mirroring
 * apps/api/internal/modules/attendance/service/monthly_export.go's
 * monthlyRecapColumns -- {@link ReportExportDialog}'s `availableColumns`.
 * A tenant with a customised status policy still exports every one of
 * its own configured statuses (the server builds the actual column set
 * from the tenant's policy); this dialog list only drives which of the
 * *default* columns a user can toggle/rename/reorder before download.
 */
export const MONTHLY_RECAP_EXPORT_COLUMNS = [
  { key: "no", label: "No" },
  { key: "nis", label: "NIS" },
  { key: "name", label: "Nama Siswa" },
  { key: "status_H", label: "Hadir" },
  { key: "status_S", label: "Sakit" },
  { key: "status_I", label: "Izin" },
  { key: "status_D", label: "Dispensasi" },
  { key: "status_A", label: "Alpha" },
  { key: "total", label: "Total" },
  { key: "percentage", label: "Persentase Hadir" },
];
