import type { FeatureModule } from "./modules/feature-modules";
import type { NavProfileKind } from "./navigation";
import type { Me } from "./session/session-provider";

/**
 * One part of a page that mixes feature modules (`NavItem.moduleSections`):
 * the module whose endpoints the part calls, and the permission it needs,
 * if any beyond the page's own checks.
 */
export interface NavModuleSection {
  module: FeatureModule;
  permission?: string;
}

/**
 * Whether a reader can use at least one part of such a page: `ok` when a
 * granted part's module is on, `module-disabled` when every granted part
 * belongs to a switched-off module, `forbidden` when no part is granted.
 */
export function moduleSectionsAccess(
  sections: readonly NavModuleSection[],
  access: Pick<NavAccess, "can" | "disabledModules">,
): "ok" | "forbidden" | "module-disabled" {
  const granted = sections.filter(
    (section) => !section.permission || access.can(section.permission),
  );
  if (granted.length === 0) return "forbidden";
  return granted.some((section) => !access.disabledModules.includes(section.module))
    ? "ok"
    : "module-disabled";
}

/**
 * Everything the navigation registry needs to decide what a reader may see
 * or open. `disabledModules` is required on purpose: a caller that builds
 * this by hand cannot forget the school's switched-off modules, and
 * `navAccessFromMe` fills it from the session.
 */
export interface NavAccess {
  can: (permission: string) => boolean;
  profileKind: NavProfileKind | undefined;
  roleSlugs: readonly string[];
  disabledModules: readonly string[];
}

export function navAccessFromMe(me: Me | undefined): NavAccess {
  return {
    can: (permission) => me?.permissions.includes(permission) ?? false,
    profileKind: me?.profile_kind,
    roleSlugs: (me?.roles ?? []).map((role) => role.slug),
    disabledModules: me?.disabled_modules ?? [],
  };
}
