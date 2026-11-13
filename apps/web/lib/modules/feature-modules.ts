/**
 * The feature modules the vendor can switch off per school. Mirrors
 * `AllModules` in apps/api/internal/modules/platform/domain/platform.go;
 * keep the two lists identical (the API reports the switched-off ones in
 * `Me.disabled_modules`, and refuses their operations with 403
 * MODULE_DISABLED).
 */
export const FEATURE_MODULES = [
  "library",
  "discipline",
  "grading",
  "permits",
  "announcements",
  "reports",
  "activities",
  "mentoring",
  "supervision",
  "staff_attendance",
  "visitors",
  "billing",
] as const;

export type FeatureModule = (typeof FEATURE_MODULES)[number];

/** The slice of the session that decides whether a module is on. */
export interface ModuleFlags {
  disabled_modules?: readonly string[];
}

/**
 * Whether `module` is switched on for the school. An unknown session (still
 * loading) counts as on: nothing is hidden before the API has said so, and
 * the module gate on the API remains the real enforcement.
 */
export function isModuleEnabled(me: ModuleFlags | undefined, module: FeatureModule): boolean {
  return !me?.disabled_modules?.includes(module);
}

/**
 * The slice of the public branding (`GET /v1/tenant/branding`) that says
 * which modules with anonymous pages (library's OPAC) are off. It never
 * lists the other modules: those reach a signed-in reader through
 * `Me.disabled_modules`.
 */
export interface PublicModuleFlags {
  disabled_public_modules?: readonly string[];
}

/**
 * Whether a public page of `module` may be offered to an anonymous visitor.
 * Unknown branding (still loading, or failed to load) counts as on, the
 * same rule `isModuleEnabled` follows; the API still refuses the module's
 * public endpoints.
 */
export function isPublicModuleEnabled(
  branding: PublicModuleFlags | undefined,
  module: FeatureModule,
): boolean {
  return !branding?.disabled_public_modules?.includes(module);
}
