import { describe, expect, it } from "vitest";

import { MODULE_FLAG_REFRESH_MS, moduleFlagRefetchInterval } from "./module-flag-refresh";

describe("moduleFlagRefetchInterval", () => {
  it("polls while the school has any module switched off", () => {
    expect(MODULE_FLAG_REFRESH_MS).toBe(60_000);
    expect(moduleFlagRefetchInterval({ disabled_modules: ["mentoring"] })).toBe(60_000);
  });

  it("never polls while every module is on or the session is unknown", () => {
    expect(moduleFlagRefetchInterval({ disabled_modules: [] })).toBe(false);
    expect(moduleFlagRefetchInterval({})).toBe(false);
    expect(moduleFlagRefetchInterval(undefined)).toBe(false);
  });
});
