import { describe, expect, it } from "vitest";

import { buildGradebookSummary } from "./grading-tiles";

const base = {
  studentCount: 32,
  componentCount: 4,
  fillPercent: 75,
  classAverage: 84.567,
  tuntasRate: 60,
  ungradedCount: 5,
};

describe("buildGradebookSummary", () => {
  it("lists the sheet's figures in reading order", () => {
    const items = buildGradebookSummary(base);
    expect(items.map((item) => item.key)).toEqual([
      "students",
      "average",
      "tuntas",
      "ungraded",
      "filled",
    ]);
    expect(items.map((item) => item.value)).toEqual(["32", "84,6", "60%", "5", "75%"]);
  });

  it("shows a dash for an average that has not been computed yet", () => {
    const items = buildGradebookSummary({ ...base, classAverage: undefined });
    expect(items.find((item) => item.key === "average")?.value).toBe("-");
  });

  it("formats the average in the reader's locale", () => {
    const items = buildGradebookSummary({ ...base, locale: "en" });
    expect(items.find((item) => item.key === "average")?.value).toBe("84.6");
  });

  it("does not claim a sheet without components is filled or tuntas", () => {
    const items = buildGradebookSummary({ ...base, componentCount: 0, fillPercent: 100 });
    expect(items.find((item) => item.key === "filled")?.value).toBe("-");
    expect(items.find((item) => item.key === "tuntas")?.value).toBe("-");
  });
});
