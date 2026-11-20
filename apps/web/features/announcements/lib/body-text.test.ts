import { describe, expect, it } from "vitest";

import { htmlToText, textToHtml } from "./body-text";

const TEXT = "Seluruh warga sekolah wajib hadir.\n\nPakaian: seragam putih abu-abu.\nBawa topi.";
const HTML =
  "<p>Seluruh warga sekolah wajib hadir.</p><p>Pakaian: seragam putih abu-abu.<br>Bawa topi.</p>";

describe("announcement body text", () => {
  it("writes paragraphs and line breaks", () => {
    expect(textToHtml(TEXT)).toBe(HTML);
  });

  it("reads the stored HTML back as the same paragraphs and lines", () => {
    expect(htmlToText(HTML)).toBe(TEXT);
  });

  it("round-trips, so saving an unchanged announcement keeps its HTML", () => {
    const tricky = "Harga < 5 & > 2 \"kutip\" 'satu'\n\n&lt; ditulis apa adanya";
    expect(htmlToText(textToHtml(tricky))).toBe(tricky);
    expect(textToHtml(htmlToText(textToHtml(tricky)))).toBe(textToHtml(tricky));
  });

  it("decodes the entities the server's sanitiser writes", () => {
    expect(htmlToText("<p>Tom &amp; Jerry &#39;99 &#34;ok&#34;</p>")).toBe('Tom & Jerry \'99 "ok"');
  });

  it("keeps the line breaks of a <br /> written by another editor", () => {
    expect(htmlToText("<p>a<br />b</p><ul><li>c</li><li>d</li></ul>")).toBe("a\nb\n\nc\n\nd");
  });
});
