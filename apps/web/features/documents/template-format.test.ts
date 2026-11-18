import { describe, expect, it } from "vitest";

import { applyTemplateFormat, shortcutFormat } from "./template-format";

function selectionOf(result: { body: string; selectionStart: number; selectionEnd: number }) {
  return result.body.slice(result.selectionStart, result.selectionEnd);
}

describe("applyTemplateFormat", () => {
  it("wraps a selected word in an inline tag and keeps it selected", () => {
    const body = "Kode verifikasi: {{.verification_code}}";
    const start = body.indexOf("{{");
    const result = applyTemplateFormat(body, start, body.length, "bold");
    expect(result.body).toBe("Kode verifikasi: <strong>{{.verification_code}}</strong>");
    expect(selectionOf(result)).toBe("{{.verification_code}}");
  });

  it("inserts an empty inline pair at the cursor and puts the cursor inside", () => {
    const result = applyTemplateFormat("Halo ", 5, 5, "italic");
    expect(result.body).toBe("Halo <em></em>");
    expect(result.selectionStart).toBe("Halo <em>".length);
    expect(result.selectionEnd).toBe(result.selectionStart);
  });

  it("puts a block on a line of its own, trimming the selection", () => {
    const body = "awal SURAT IZIN akhir";
    const start = body.indexOf("SURAT");
    const end = body.indexOf(" akhir") + 1;
    const result = applyTemplateFormat(body, start, end, "heading");
    expect(result.body).toBe('awal \n<h2 style="text-align:center;">SURAT IZIN</h2>\nakhir');
    expect(selectionOf(result)).toBe("SURAT IZIN");
  });

  it("adds no extra line breaks at the start and end of the body", () => {
    const result = applyTemplateFormat("Nomor: {{.letter_number}}", 0, 25, "center");
    expect(result.body).toBe('<p style="text-align:center;">Nomor: {{.letter_number}}</p>');
  });

  it("turns each non-empty selected line into a list item", () => {
    const body = "Sakit\n\n  Keperluan keluarga  \nLainnya";
    const result = applyTemplateFormat(body, 0, body.length, "bulletList");
    expect(result.body).toBe(
      "<ul>\n  <li>Sakit</li>\n  <li>Keperluan keluarga</li>\n  <li>Lainnya</li>\n</ul>",
    );
  });

  it("starts an empty numbered list with the cursor in its first item", () => {
    const result = applyTemplateFormat("", 0, 0, "numberedList");
    expect(result.body).toBe("<ol>\n  <li></li>\n</ol>");
    expect(result.body.slice(0, result.selectionStart)).toBe("<ol>\n  <li>");
  });

  it("adds a line break after the selection", () => {
    const result = applyTemplateFormat("Hormat kami,Kepala sekolah", 12, 12, "lineBreak");
    expect(result.body).toBe("Hormat kami,<br>\nKepala sekolah");
    expect(result.selectionStart).toBe("Hormat kami,<br>\n".length);
  });

  it("accepts a selection made from the end backwards", () => {
    const result = applyTemplateFormat("abc", 3, 0, "underline");
    expect(result.body).toBe("<u>abc</u>");
  });
});

describe("shortcutFormat", () => {
  const key = (k: string, extra: Partial<Parameters<typeof shortcutFormat>[0]> = {}) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...extra,
  });

  it("maps Ctrl or Cmd with B, I and U", () => {
    expect(shortcutFormat(key("b", { ctrlKey: true }))).toBe("bold");
    expect(shortcutFormat(key("I", { metaKey: true }))).toBe("italic");
    expect(shortcutFormat(key("u", { ctrlKey: true }))).toBe("underline");
  });

  it("ignores plain keys and other combinations", () => {
    expect(shortcutFormat(key("b"))).toBeNull();
    expect(shortcutFormat(key("b", { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(shortcutFormat(key("z", { ctrlKey: true }))).toBeNull();
  });
});
