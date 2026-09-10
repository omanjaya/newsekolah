import { describe, expect, it } from "vitest";

import { parseImportCsv } from "./import-csv";

describe("parseImportCsv", () => {
  it("reads the columns it recognises, whatever their order", () => {
    const { rows, problems } = parseImportCsv(
      ["Tanggal,NIP,Pulang,Masuk", "2026-09-10,19850101,15:30,07:12"].join("\n"),
    );

    expect(problems).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        employeeKey: "19850101",
        date: "2026-09-10",
        arrivalAt: "2026-09-10T07:12:00",
        departureAt: "2026-09-10T15:30:00",
        notes: undefined,
      },
    ]);
  });

  it("accepts a day-first date and normalises it", () => {
    const { rows } = parseImportCsv(["nip,tanggal,masuk", "19850101,10/09/2026,07:05"].join("\n"));

    expect(rows[0]?.date).toBe("2026-09-10");
    expect(rows[0]?.arrivalAt).toBe("2026-09-10T07:05:00");
  });

  it("reports a row it cannot read rather than dropping it", () => {
    const { rows, problems } = parseImportCsv(
      [
        "nip,tanggal,masuk",
        "19850101,2026-09-10,07:12",
        ",2026-09-10,07:12",
        "19850102,bukan tanggal,07:12",
        "19850103,2026-09-10,pagi",
      ].join("\n"),
    );

    expect(rows).toHaveLength(1);
    expect(problems.map((p) => [p.line, p.reason])).toEqual([
      [3, "missing_employee"],
      [4, "bad_date"],
      [5, "bad_time"],
    ]);
  });

  it("takes a semicolon-separated file, which some devices write", () => {
    const { rows } = parseImportCsv(["nip;tanggal;masuk", "19850101;2026-09-10;07:12"].join("\n"));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.employeeKey).toBe("19850101");
  });

  it("returns nothing for an empty file instead of throwing", () => {
    expect(parseImportCsv("")).toEqual({ rows: [], problems: [] });
  });
});
