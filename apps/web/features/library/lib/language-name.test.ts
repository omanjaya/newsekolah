import { describe, expect, it } from "vitest";

import { languageName } from "./language-name";

describe("languageName", () => {
  // The API stores "ind" for a title saved without a language.
  it("names a known ISO 639 code in the reader's language", () => {
    expect(languageName("ind", "id")).toBe("Indonesia");
    expect(languageName("ind", "en")).toBe("Indonesian");
    expect(languageName("en", "id")).toBe("Inggris");
  });

  it("keeps a code it cannot read as stored", () => {
    expect(languageName("not a code", "id")).toBe("not a code");
  });

  it("leaves an empty value empty", () => {
    expect(languageName("", "id")).toBe("");
    expect(languageName("  ", "en")).toBe("");
  });
});
