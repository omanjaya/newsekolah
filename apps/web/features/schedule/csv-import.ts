import type { ScheduleWrite } from "./api";

export interface RefByName {
  id: string;
  name: string;
}

export interface BulkImportRefs {
  academicYearId: string;
  classes: RefByName[];
  subjects: RefByName[];
  teachers: RefByName[];
  periods: RefByName[];
}

export interface BulkImportRow {
  line: number;
  raw: Record<string, string>;
  /** Present once every reference in the row resolved; absent otherwise. */
  resolved?: ScheduleWrite;
  /** Column names that failed to resolve against the tenant's reference data. */
  errors: string[];
}

const REQUIRED_COLUMNS = ["class", "subject", "teacher", "day", "start_period", "end_period"];

function findByName(refs: RefByName[], name: string): RefByName | undefined {
  const needle = name.trim().toLowerCase();
  return refs.find((ref) => ref.name.trim().toLowerCase() === needle);
}

/** Splits one CSV line on commas, honoring double-quoted fields with escaped `""`. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i] ?? "";
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/**
 * Parses a comma-separated schedule sheet into rows resolved against the
 * tenant's classes, subjects, teachers and periods (by name, case-insensitive),
 * for `POST /v1/schedules/bulk-import`. Pure and dependency-free so it can
 * run before anything is sent to the server, driving the preview table.
 *
 * Expected header: class,subject,teacher,day,start_period,end_period,notes
 * (notes optional). `day` is the ISO weekday (1 Monday - 7 Sunday).
 */
export function parseBulkImportCsv(csvText: string, refs: BulkImportRefs): BulkImportRow[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  const header = splitCsvLine(lines[0] ?? "").map((h) => h.toLowerCase());
  const rows: BulkImportRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i] ?? "");
    const raw: Record<string, string> = {};
    header.forEach((col, index) => {
      raw[col] = cells[index] ?? "";
    });

    const errors: string[] = [];
    for (const column of REQUIRED_COLUMNS) {
      if (!raw[column]) errors.push(column);
    }

    const classRef = raw.class ? findByName(refs.classes, raw.class) : undefined;
    if (raw.class && !classRef) errors.push("class");
    const subjectRef = raw.subject ? findByName(refs.subjects, raw.subject) : undefined;
    if (raw.subject && !subjectRef) errors.push("subject");
    const teacherRef = raw.teacher ? findByName(refs.teachers, raw.teacher) : undefined;
    if (raw.teacher && !teacherRef) errors.push("teacher");
    const startRef = raw.start_period ? findByName(refs.periods, raw.start_period) : undefined;
    if (raw.start_period && !startRef) errors.push("start_period");
    const endRef = raw.end_period ? findByName(refs.periods, raw.end_period) : undefined;
    if (raw.end_period && !endRef) errors.push("end_period");

    const day = Number(raw.day);
    if (raw.day && (!Number.isInteger(day) || day < 1 || day > 7)) errors.push("day");

    const resolved: ScheduleWrite | undefined =
      errors.length === 0 && classRef && subjectRef && teacherRef && startRef && endRef
        ? {
            academic_year_id: refs.academicYearId,
            class_id: classRef.id,
            subject_id: subjectRef.id,
            teacher_user_id: teacherRef.id,
            day_of_week: day,
            start_period_id: startRef.id,
            end_period_id: endRef.id,
            ...(raw.notes ? { notes: raw.notes } : {}),
          }
        : undefined;

    rows.push({ line: i + 1, raw, resolved, errors });
  }

  return rows;
}
