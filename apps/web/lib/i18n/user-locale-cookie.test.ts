import { afterEach, describe, expect, it } from "vitest";

import {
  clearUserLocaleCookie,
  readUserLocaleCookie,
  resolveLocale,
  writeUserLocaleCookie,
} from "./user-locale-cookie";

afterEach(() => {
  clearUserLocaleCookie();
});

describe("resolveLocale", () => {
  it("puts the user's preference ahead of the school's language", () => {
    expect(resolveLocale("en", "id")).toBe("en");
    expect(resolveLocale("id", "en")).toBe("id");
  });

  it("falls back to the school's language, then Indonesian", () => {
    expect(resolveLocale(undefined, "en")).toBe("en");
    expect(resolveLocale("fr", undefined)).toBe("id");
    expect(resolveLocale(null, null)).toBe("id");
  });
});

describe("user locale cookie", () => {
  it("round-trips and clears", () => {
    expect(readUserLocaleCookie()).toBeUndefined();
    writeUserLocaleCookie("en");
    expect(readUserLocaleCookie()).toBe("en");
    clearUserLocaleCookie();
    expect(readUserLocaleCookie()).toBeUndefined();
  });
});
