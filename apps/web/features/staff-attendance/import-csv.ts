/**
 * Parsing an attendance device's export. Machines differ, so the parser
 * takes the columns it recognises by name and reports every row it could
 * not use rather than dropping it: a day silently missing from an import
 * is a day someone is marked absent for.
 */

export interface ParsedImportRow {
  /** 1-based line number in the file, so a person can find the row again. */
  line: number;
  employeeKey: string;
  date: string;
  arrivalAt?: string;
  departureAt?: string;
  notes?: string;
}

export interface ImportProblem {
  line: number;
  reason: "missing_employee" | "missing_date" | "bad_date" | "bad_time" | "unknown_employee";
  value: string;
}

export interface ParsedImport {
  rows: ParsedImportRow[];
  problems: ImportProblem[];
}

const HEADER_ALIASES: Record<string, keyof ParsedImportRow> = {
  nip: "employeeKey",
  nik: "employeeKey",
  pegawai: "employeeKey",
  employee: "employeeKey",
  username: "employeeKey",
  tanggal: "date",
  date: "date",
  masuk: "arrivalAt",
  datang: "arrivalAt",
  arrival: "arrivalAt",
  pulang: "departureAt",
  keluar: "departureAt",
  departure: "departureAt",
  catatan: "notes",
  notes: "notes",
};

function splitLine(line: string): string[] {
  const separator = line.includes(";") && !line.includes(",") ? ";" : ",";
  return line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

/** A date the device wrote as either 2026-09-10 or 10/09/2026. */
function normaliseDate(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return value;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (!dmy) return null;
  const [, day = "", month = "", year = ""] = dmy;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * A clock time on a given day, as the API wants it: a full timestamp. The
 * device writes only "07:12", and the day it belongs to is the row's own
 * date, so the two are combined here rather than guessed later.
 */
function toTimestamp(date: string, value: string): string | null {
  const match = /^(\d{1,2})[:.](\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, hour = "", minute = "00", second = "00"] = match;
  return `${date}T${hour.padStart(2, "0")}:${minute}:${second}`;
}

/** Reads the header row and returns which column holds which field. */
function readHeader(cells: string[]): (keyof ParsedImportRow | undefined)[] {
  return cells.map((cell) => HEADER_ALIASES[cell.toLowerCase().replace(/[\s_]+/g, "")]);
}

export function parseImportCsv(text: string): ParsedImport {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { rows: [], problems: [] };

  const header = readHeader(splitLine(lines[0] ?? ""));
  const rows: ParsedImportRow[] = [];
  const problems: ImportProblem[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const line = index + 1;
    const rawLine = lines[index] ?? "";
    const cells = splitLine(rawLine);
    const raw: Record<string, string> = {};
    header.forEach((field, column) => {
      if (field) raw[field] = cells[column] ?? "";
    });

    if (!raw.employeeKey) {
      problems.push({ line, reason: "missing_employee", value: rawLine });
      continue;
    }
    if (!raw.date) {
      problems.push({ line, reason: "missing_date", value: rawLine });
      continue;
    }
    const date = normaliseDate(raw.date);
    if (!date) {
      problems.push({ line, reason: "bad_date", value: raw.date });
      continue;
    }
    const arrivalAt = raw.arrivalAt ? toTimestamp(date, raw.arrivalAt) : undefined;
    const departureAt = raw.departureAt ? toTimestamp(date, raw.departureAt) : undefined;
    if ((raw.arrivalAt && !arrivalAt) || (raw.departureAt && !departureAt)) {
      problems.push({
        line,
        reason: "bad_time",
        value: `${raw.arrivalAt} ${raw.departureAt}`.trim(),
      });
      continue;
    }

    rows.push({
      line,
      employeeKey: raw.employeeKey,
      date,
      arrivalAt: arrivalAt ?? undefined,
      departureAt: departureAt ?? undefined,
      notes: raw.notes === "" ? undefined : raw.notes,
    });
  }

  return { rows, problems };
}
