import { filterNavigation, type NavItem, type NavProfileKind } from "./navigation";
import type { NavAccess } from "./navigation-access";
import { canOpenPath } from "./navigation-permissions";

/**
 * Builds a `NavAccess` for tests, where the production code gets it from the
 * session (`navAccessFromMe`). Everything but the permission check is optional
 * so a test only spells out what it exercises.
 */
export function navAccessFixture(
  can: (permission: string) => boolean,
  profileKind?: NavProfileKind,
  roleSlugs: string[] = [],
  disabledModules: string[] = [],
): NavAccess {
  return { can, profileKind, roleSlugs, disabledModules };
}

/** `filterNavigation` with the positional shorthand most registry tests use. */
export function filterNavigationFixture(
  items: NavItem[],
  can: (permission: string) => boolean,
  profileKind?: NavProfileKind,
  roleSlugs: string[] = [],
  disabledModules: string[] = [],
): NavItem[] {
  return filterNavigation(items, navAccessFixture(can, profileKind, roleSlugs, disabledModules));
}

/** `canOpenPath` with the same positional shorthand. */
export function canOpenPathFixture(
  pathname: string,
  can: (permission: string) => boolean,
  profileKind?: NavProfileKind,
  roleSlugs: string[] = [],
  disabledModules: string[] = [],
): boolean {
  return canOpenPath(pathname, navAccessFixture(can, profileKind, roleSlugs, disabledModules));
}
