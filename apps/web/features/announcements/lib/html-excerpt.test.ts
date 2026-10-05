import { describe, expect, it } from "vitest";

import { htmlToExcerpt } from "./html-excerpt";

describe("htmlToExcerpt", () => {
  it("strips tags and collapses whitespace", () => {
    expect(htmlToExcerpt("<p>Hello   <strong>world</strong></p>\n<p>Again</p>")).toBe(
      "Hello world Again",
    );
  });

  it("decodes the handful of HTML entities the editor can produce", () => {
    expect(htmlToExcerpt("<p>Budi &amp; Ani &lt;kelas&gt; &nbsp; sip</p>")).toBe(
      "Budi & Ani <kelas> sip",
    );
  });

  it("returns short text unchanged, with no ellipsis", () => {
    expect(htmlToExcerpt("<p>Singkat saja</p>", 160)).toBe("Singkat saja");
  });

  it("truncates long text and appends an ellipsis", () => {
    const long = "a".repeat(200);
    const result = htmlToExcerpt(`<p>${long}</p>`, 160);
    expect(result).toHaveLength(161);
    expect(result.endsWith("…")).toBe(true);
    expect(result.slice(0, 160)).toBe("a".repeat(160));
  });

  it("returns an empty string for empty or whitespace-only markup", () => {
    expect(htmlToExcerpt("")).toBe("");
    expect(htmlToExcerpt("<p>   </p>")).toBe("");
  });
});
