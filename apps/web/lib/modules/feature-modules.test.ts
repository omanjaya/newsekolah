import { describe, expect, it } from "vitest";

import { FEATURE_MODULES, isModuleEnabled } from "./feature-modules";

describe("isModuleEnabled", () => {
  it("counts an unknown session as on, so nothing is hidden before the API has spoken", () => {
    expect(isModuleEnabled(undefined, "library")).toBe(true);
    expect(isModuleEnabled({}, "library")).toBe(true);
  });

  it("is off only for the listed modules", () => {
    const me = { disabled_modules: ["library", "billing"] };
    expect(isModuleEnabled(me, "library")).toBe(false);
    expect(isModuleEnabled(me, "billing")).toBe(false);
    expect(isModuleEnabled(me, "visitors")).toBe(true);
  });

  it("lists the twelve toggleable modules once each", () => {
    expect(FEATURE_MODULES).toHaveLength(12);
    expect(new Set(FEATURE_MODULES).size).toBe(12);
  });
});
