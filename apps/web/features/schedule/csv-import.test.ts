import { describe, expect, it } from "vitest";

import { parseBulkImportCsv } from "./csv-import";

const refs = {
  academicYearId: "year-1",
  classes: [{ id: "class-1", name: "7A" }],
  subjects: [{ id: "subject-1", name: "Matematika" }],
  teachers: [{ id: "teacher-1", name: "Budi Santoso" }],
  periods: [
    { id: "period-1", name: "Jam 1" },
    { id: "period-2", name: "Jam 2" },
  ],
};

describe("parseBulkImportCsv", () => {
  it("resolves a row whose names all match reference data", () => {
    const csv = [
      "class,subject,teacher,day,start_period,end_period,notes",
      "7A,Matematika,Budi Santoso,1,Jam 1,Jam 2,Bawa kalkulator",
    ].join("\n");

    const rows = parseBulkImportCsv(csv, refs);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.errors).toEqual([]);
    expect(rows[0]?.resolved).toEqual({
      academic_year_id: "year-1",
      class_id: "class-1",
      subject_id: "subject-1",
      teacher_user_id: "teacher-1",
      day_of_week: 1,
      start_period_id: "period-1",
      end_period_id: "period-2",
      notes: "Bawa kalkulator",
    });
  });

  it("is case-insensitive and trims whitespace when matching names", () => {
    const csv = [
      "class,subject,teacher,day,start_period,end_period",
      "  7a , matematika ,budi santoso,1,jam 1,jam 2",
    ].join("\n");

    const rows = parseBulkImportCsv(csv, refs);

    expect(rows[0]?.errors).toEqual([]);
    expect(rows[0]?.resolved?.class_id).toBe("class-1");
  });

  it("reports an unresolved reference by column name instead of dropping the row", () => {
    const csv = [
      "class,subject,teacher,day,start_period,end_period",
      "Unknown Class,Matematika,Budi Santoso,1,Jam 1,Jam 2",
    ].join("\n");

    const rows = parseBulkImportCsv(csv, refs);

    expect(rows[0]?.errors).toContain("class");
    expect(rows[0]?.resolved).toBeUndefined();
  });

  it("rejects a day of week outside 1-7", () => {
    const csv = [
      "class,subject,teacher,day,start_period,end_period",
      "7A,Matematika,Budi Santoso,9,Jam 1,Jam 2",
    ].join("\n");

    const rows = parseBulkImportCsv(csv, refs);

    expect(rows[0]?.errors).toContain("day");
  });

  it("flags every missing required column", () => {
    const csv = ["class,subject,teacher,day,start_period,end_period", ",,,,,"].join("\n");

    const rows = parseBulkImportCsv(csv, refs);

    expect(rows[0]?.errors).toEqual(
      expect.arrayContaining(["class", "subject", "teacher", "day", "start_period", "end_period"]),
    );
  });

  it("returns no rows for an empty sheet", () => {
    expect(parseBulkImportCsv("", refs)).toEqual([]);
    expect(parseBulkImportCsv("class,subject,teacher,day,start_period,end_period", refs)).toEqual(
      [],
    );
  });
});
