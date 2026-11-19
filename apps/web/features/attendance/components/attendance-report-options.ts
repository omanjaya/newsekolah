import type { ReportExportColumn } from "../../../components/report-export-dialog";
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

/** A column header from `app.attendanceReports.exportColumns`. */
export type ExportColumnLabel = (
  key:
    | "no"
    | "nis"
    | "name"
    | "status"
    | "expected"
    | "submitted"
    | "complete"
    | "total"
    | "percentage",
) => string;

/**
 * The daily report export's columns, in the order of
 * apps/api/internal/modules/attendance/service/report.go's
 * dailyReportColumns -- {@link ReportExportDialog}'s `availableColumns`.
 * The headers come from the catalogue, word for word what the server
 * writes for the request's locale (service/report_columns.go), since the
 * dialog only sends a label the reader renamed.
 */
export function dailyReportExportColumns(label: ExportColumnLabel): ReportExportColumn[] {
  return (["no", "name", "status", "expected", "submitted", "complete"] as const).map((key) => ({
    key,
    label: label(key),
  }));
}

/**
 * The default status policy's codes and labels (DefaultStatusPolicy in
 * apps/api/internal/modules/attendance/domain/policy.go). A status label is
 * the school's own content: the server writes it as configured in every
 * locale, so the dialog shows it as is too.
 */
const DEFAULT_POLICY_STATUSES = [
  { code: "H", label: "Hadir" },
  { code: "S", label: "Sakit" },
  { code: "I", label: "Izin" },
  { code: "D", label: "Dispensasi" },
  { code: "A", label: "Alpha" },
];

/**
 * The monthly recap export's columns for the tenant's default status
 * policy (H/S/I/D/A), in the order of
 * apps/api/internal/modules/attendance/service/monthly_export.go's
 * monthlyRecapColumns -- {@link ReportExportDialog}'s `availableColumns`.
 * A tenant with a customised status policy still exports every one of
 * its own configured statuses (the server builds the actual column set
 * from the tenant's policy); this dialog list only drives which of the
 * *default* columns a user can toggle/rename/reorder before download.
 */
export function monthlyRecapExportColumns(label: ExportColumnLabel): ReportExportColumn[] {
  return [
    ...(["no", "nis", "name"] as const).map((key) => ({ key, label: label(key) })),
    ...DEFAULT_POLICY_STATUSES.map((status) => ({
      key: `status_${status.code}`,
      label: status.label,
    })),
    ...(["total", "percentage"] as const).map((key) => ({ key, label: label(key) })),
  ];
}
