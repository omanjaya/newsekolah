import { describe, expect, it } from "vitest";

import { FEATURE_MODULES, type FeatureModule } from "../../lib/modules/feature-modules";
import platformEn from "../../messages/features/platform.en.json";
import platformId from "../../messages/features/platform.id.json";

import type { PlatformModule } from "./api";

/** true only when A and B are the same union, checked in both directions. */
type SameUnion<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// Compile-time drift check: FEATURE_MODULES and the API's PlatformModule
// enum (openapi/modules/platform.yaml) must name the same modules. If one
// side gains or loses a module, this line stops type-checking.
const sameModules: SameUnion<FeatureModule, PlatformModule> = true;

// Runtime copy of the generated enum: the `satisfies` clause fails to
// type-check when a PlatformModule is missing here or an extra key appears.
const API_MODULES = {
  library: true,
  discipline: true,
  grading: true,
  permits: true,
  announcements: true,
  reports: true,
  activities: true,
  mentoring: true,
  supervision: true,
  staff_attendance: true,
  visitors: true,
  billing: true,
} satisfies Record<PlatformModule, true>;

describe("platform console module contract", () => {
  it("lists the same modules as the API enum", () => {
    expect(sameModules).toBe(true);
    expect([...FEATURE_MODULES].sort()).toEqual(Object.keys(API_MODULES).sort());
  });

  it.each([
    ["id", platformId],
    ["en", platformEn],
  ])("has a %s label for every module and nothing else", (_locale, messages) => {
    const labels: Record<string, string> = messages.tenants.detail.modules;
    expect(Object.keys(labels).sort()).toEqual([...FEATURE_MODULES].sort());
    for (const module of FEATURE_MODULES) {
      expect(labels[module]?.trim()).toBeTruthy();
    }
  });
});
