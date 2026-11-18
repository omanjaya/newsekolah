import { describe, expect, it } from "vitest";

import {
  extractPlaceholders,
  findLegacyPlaceholders,
  fixLegacyPlaceholders,
  listBlockToken,
  placeholderToken,
  renderPreviewHtml,
} from "./template-syntax";

// The API's own leave letter, warning letter and visitor badge bodies
// (apps/api/internal/modules/permits/service/leaverequest.go,
// discipline/service/letters.go, visitors/service/visits.go), cut down.
const LEAVE_LETTER =
  '<p style="text-align:center">Nomor: {{.letter_number}}</p>' +
  "<table><tr><td>Nama</td><td>: {{.student_name}}</td></tr>" +
  "<tr><td>NIS</td><td>: {{.nis}}</td></tr></table>" +
  "<p>pada tanggal {{.starts_on}} sampai {{.ends_on}} ({{.days}} hari)</p>";
const WARNING_LETTER =
  "<h2>SURAT PERINGATAN {{.level}}</h2>" +
  "<table>{{range .violations}}<tr><td>{{.date}}</td><td>{{.name}}</td><td>{{.points}}</td></tr>{{end}}</table>" +
  "<p>{{.closing_text}}</p>";

const label = (name: string, list: string | null) => (list ? `${list}/${name}` : name);

describe("placeholderToken", () => {
  it("writes a value the way the API's html/template reads it", () => {
    expect(placeholderToken("student_name")).toBe("{{.student_name}}");
  });
});

describe("listBlockToken", () => {
  it("walks the list with one paragraph per item", () => {
    expect(listBlockToken("violations", ["date", "name"])).toBe(
      "{{range .violations}}<p>{{.date}} - {{.name}}</p>{{end}}",
    );
  });

  it("names the list and each field once the block is read back", () => {
    const block = listBlockToken("violations", ["date", "name", "points"]);
    expect(extractPlaceholders(block)).toEqual(["violations"]);
    expect(renderPreviewHtml(block, label)).toBe(
      "<p>[violations/date] - [violations/name] - [violations/points]</p>",
    );
  });
});

describe("extractPlaceholders", () => {
  it("lists the values of the API's own leave letter in first-seen order", () => {
    expect(extractPlaceholders(LEAVE_LETTER)).toEqual([
      "letter_number",
      "student_name",
      "nis",
      "starts_on",
      "ends_on",
      "days",
    ]);
  });

  it("reads spaces, trim markers and functions around a value", () => {
    expect(extractPlaceholders('{{ .a }} {{- .b -}} {{.c | html}} {{printf "%s" .d}}')).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("lists a value once however often it appears", () => {
    expect(extractPlaceholders("{{.a}} {{.a}} {{.b}} {{.a}}")).toEqual(["a", "b"]);
  });

  it("counts a list but not the fields of its items", () => {
    expect(extractPlaceholders(WARNING_LETTER)).toEqual(["level", "violations", "closing_text"]);
  });

  it("reads $.name inside a list as a top-level value", () => {
    expect(extractPlaceholders("{{range .items}}{{.title}} {{$.student_name}}{{end}}")).toEqual([
      "items",
      "student_name",
    ]);
  });

  it("reads the else branch of a list with the top-level dot again", () => {
    expect(extractPlaceholders("{{range .items}}{{.title}}{{else}}{{.empty_text}}{{end}}")).toEqual(
      ["items", "empty_text"],
    );
  });

  it("reads a condition and both of its branches", () => {
    expect(extractPlaceholders("{{if .reason}}{{.reason}}{{else}}{{.category}}{{end}}")).toEqual([
      "reason",
      "category",
    ]);
  });

  it("ignores comments, string literals, variables and the old syntax", () => {
    expect(
      extractPlaceholders(
        '{{/* {{.hidden}} */}}{{printf ".not_a_field %s" .real}}{{$x := .a}}{{$x.b}}{{student_name}}',
      ),
    ).toEqual(["real", "a"]);
  });

  it("finds nothing in a body without actions", () => {
    expect(extractPlaceholders("<p>Halo</p>")).toEqual([]);
  });
});

describe("findLegacyPlaceholders", () => {
  it("finds values the first editor wrote without their dot", () => {
    expect(
      findLegacyPlaceholders("{{letter_number}} {{ student_name }} {{.nis}} {{letter_number}}"),
    ).toEqual(["letter_number", "student_name"]);
  });

  it("leaves keywords, built-in functions and dotted values alone", () => {
    expect(
      findLegacyPlaceholders(
        "{{if .a}}{{else}}{{end}}{{range .b}}{{break}}{{end}}{{nil}}{{len .c}}",
      ),
    ).toEqual([]);
  });
});

describe("fixLegacyPlaceholders", () => {
  it("adds the dot to every value written without it", () => {
    expect(fixLegacyPlaceholders("<p>{{letter_number}}</p><p>{{ student_name }}</p>")).toBe(
      "<p>{{.letter_number}}</p><p>{{.student_name}}</p>",
    );
  });

  it("keeps trim markers", () => {
    expect(fixLegacyPlaceholders("{{- nis -}}")).toBe("{{- .nis -}}");
  });

  it("leaves a correct body exactly as it is", () => {
    expect(fixLegacyPlaceholders(LEAVE_LETTER)).toBe(LEAVE_LETTER);
    expect(fixLegacyPlaceholders(WARNING_LETTER)).toBe(WARNING_LETTER);
  });

  it("leaves nothing for findLegacyPlaceholders to find", () => {
    const fixed = fixLegacyPlaceholders("{{a}} {{ b }} {{-  c  -}} {{end}}");
    expect(fixed).toBe("{{.a}} {{.b}} {{- .c -}} {{end}}");
    expect(findLegacyPlaceholders(fixed)).toEqual([]);
    expect(extractPlaceholders(fixed)).toEqual(["a", "b", "c"]);
  });
});

describe("renderPreviewHtml", () => {
  it("shows each value as its label in square brackets", () => {
    expect(renderPreviewHtml("<p>Nomor: {{.letter_number}}, {{ .student_name }}</p>", label)).toBe(
      "<p>Nomor: [letter_number], [student_name]</p>",
    );
  });

  it("escapes the label so it cannot become markup", () => {
    expect(renderPreviewHtml("{{.a}}", () => '<b>"x" & y</b>')).toBe(
      "[&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;]",
    );
  });

  it("draws a list's block once with its items' labels", () => {
    expect(renderPreviewHtml(WARNING_LETTER, label)).toBe(
      "<h2>SURAT PERINGATAN [level]</h2>" +
        "<table><tr><td>[violations/date]</td><td>[violations/name]</td><td>[violations/points]</td></tr></table>" +
        "<p>[closing_text]</p>",
    );
  });

  it("shows only the first branch of a condition and drops comments", () => {
    expect(
      renderPreviewHtml("{{/* note */}}{{if .reason}}A {{.reason}}{{else}}B{{end}}.", label),
    ).toBe("A [reason].");
  });

  it("keeps a value without its dot as written, as the API cannot print it", () => {
    expect(renderPreviewHtml("<p>{{student_name}}</p>", label)).toBe("<p>{{student_name}}</p>");
  });

  it("leaves a body without actions untouched", () => {
    expect(renderPreviewHtml("<p>Halo</p>", label)).toBe("<p>Halo</p>");
  });
});
