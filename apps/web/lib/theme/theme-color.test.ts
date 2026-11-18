import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyThemeColor } from "./theme-color";

function contents(): string[] {
  return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
    (tag) => tag.content,
  );
}

beforeEach(() => {
  document.head.innerHTML = `
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#F7F6F2">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#171613">`;
});

afterEach(() => {
  document.head.innerHTML = "";
});

describe("applyThemeColor", () => {
  it("pins every tag to the forced theme and restores the system pair afterwards", () => {
    applyThemeColor("light");
    expect(contents()).toEqual(["#F7F6F2", "#F7F6F2"]);
    applyThemeColor("dark");
    expect(contents()).toEqual(["#171613", "#171613"]);
    applyThemeColor("system");
    expect(contents()).toEqual(["#F7F6F2", "#171613"]);
  });
});
