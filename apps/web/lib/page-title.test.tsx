import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { setDocumentSchoolName, useDocumentTitle } from "./page-title";
import { composeDocumentTitle } from "./page-title-format";

describe("composeDocumentTitle", () => {
  it("puts the page before the school", () => {
    expect(composeDocumentTitle("Pengguna sekolah", "SMA Contoh")).toBe(
      "Pengguna sekolah · SMA Contoh",
    );
  });

  it("falls back to the school alone, and to the page alone", () => {
    expect(composeDocumentTitle(undefined, "SMA Contoh")).toBe("SMA Contoh");
    expect(composeDocumentTitle("  ", "SMA Contoh")).toBe("SMA Contoh");
    expect(composeDocumentTitle("Beranda", "")).toBe("Beranda");
  });
});

describe("document title", () => {
  beforeEach(() => {
    setDocumentSchoolName("SMA Contoh");
  });

  it("keeps the page's half when the school's arrives after it", () => {
    renderHook(() => {
      useDocumentTitle("Katalog");
    });
    // The tenant provider is an ancestor: its effect runs after the page's.
    setDocumentSchoolName("SMA Negeri 1");
    expect(document.title).toBe("Katalog · SMA Negeri 1");
  });

  it("returns to the school's name when the page leaves", () => {
    const { unmount } = renderHook(() => {
      useDocumentTitle("Katalog");
    });
    expect(document.title).toBe("Katalog · SMA Contoh");
    unmount();
    expect(document.title).toBe("SMA Contoh");
  });

  it("does not clear the next page's title when the previous one unmounts late", () => {
    const first = renderHook(() => {
      useDocumentTitle("Katalog");
    });
    renderHook(() => {
      useDocumentTitle("Eksemplar");
    });
    first.unmount();
    expect(document.title).toBe("Eksemplar · SMA Contoh");
  });
});
