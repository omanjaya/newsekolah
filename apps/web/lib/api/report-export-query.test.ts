import { describe, expect, it } from "vitest";

import { encodeColumnChoice, withReportExportParams } from "./report-export-query";

describe("withReportExportParams", () => {
  it("encodes a column label once on top of the query string's own encoding", () => {
    const params = withReportExportParams(new URLSearchParams({ month: "2026-11" }), {
      format: "xlsx",
      title: "Rekap",
      showLetterhead: true,
      columns: [
        { key: "no", label: "No" },
        { key: "name", label: "Nama pegawai, kelas" },
        { key: "class" },
      ],
    });

    expect(params.toString()).toBe(
      "month=2026-11&format=xlsx&title=Rekap&letterhead=true&columns=no%3ANo%2Cname%3ANama%2520pegawai%252C%2520kelas%2Cclass",
    );
    // What the API's ParseReportColumns sees after the server decodes the query string.
    expect(params.get("columns")).toBe("no:No,name:Nama%20pegawai%2C%20kelas,class");
  });
});

describe("encodeColumnChoice", () => {
  it("keeps a bare key when no label is chosen", () => {
    expect(encodeColumnChoice({ key: "nis" })).toBe("nis");
  });

  it("escapes a comma and colon so they cannot split the column list", () => {
    expect(encodeColumnChoice({ key: "x", label: "a,b:c" })).toBe("x:a%2Cb%3Ac");
  });
});
