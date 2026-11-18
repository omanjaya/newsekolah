import type { FeatureModule } from "./modules/feature-modules";
import type { NavItem, NavProfileKind } from "./navigation";
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
 * Who a menu entry is offered to, when that is narrower than who may open
 * its route (`NavItem.offeredTo`). Every condition that is set must hold;
 * `duties` and `roles` together read "holds any one of these".
 */
export interface NavAudience {
  /** Only these profile kinds are offered the entry. */
  profileKinds?: NavProfileKind[];
  /** Only a holder of one of these permissions is offered the entry. */
  anyPermission?: string[];
  /** Duty slugs (`Me["duties"]`), any one of which offers the entry (or one of `roles`). */
  duties?: string[];
  /** System role slugs, any one of which offers the entry (or one of `duties`). */
  roles?: string[];
  /** Duty slugs whose holders are never offered the entry. */
  excludeDuties?: string[];
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
  /**
   * The reader's duty slugs. Only menus read them (`NavItem.offeredTo`);
   * left out, the duty rules are skipped and the entry is offered as if
   * they passed.
   */
  duties?: readonly string[];
}

export function navAccessFromMe(me: Me | undefined): NavAccess {
  return {
    can: (permission) => me?.permissions.includes(permission) ?? false,
    profileKind: me?.profile_kind,
    roleSlugs: (me?.roles ?? []).map((role) => role.slug),
    disabledModules: me?.disabled_modules ?? [],
    duties: (me?.duties ?? []).map((duty) => duty.slug),
  };
}

/**
 * The items a reader may see. `access.disabledModules` is required: an item
 * that belongs to a module the school has switched off is dropped for
 * everyone, whatever their permissions. An item's `offeredTo` narrows the
 * menus only; `pathAccess` (navigation-permissions.ts) still opens its route.
 */
export function filterNavigation(items: NavItem[], access: NavAccess): NavItem[] {
  const { can, profileKind, roleSlugs, disabledModules } = access;
  return items.filter((item) => {
    if (item.offeredTo && !isOfferedTo(item.offeredTo, access)) return false;
    if (item.module && disabledModules.includes(item.module)) return false;
    if (item.moduleSections && moduleSectionsAccess(item.moduleSections, access) !== "ok") {
      return false;
    }
    if (item.permission && !can(item.permission)) return false;
    if (item.anyPermission && !item.anyPermission.some((code) => can(code))) return false;
    if (item.profileKinds && (!profileKind || !item.profileKinds.includes(profileKind))) {
      return false;
    }
    if (item.excludeProfileKinds && profileKind && item.excludeProfileKinds.includes(profileKind)) {
      return false;
    }
    if (item.excludeRoles?.some((slug) => roleSlugs.includes(slug))) {
      return false;
    }
    return true;
  });
}

/** Whether a reader is offered an entry with this audience in menus and the command palette. */
export function isOfferedTo(audience: NavAudience, access: NavAccess): boolean {
  const { can, profileKind, roleSlugs, duties } = access;
  if (audience.profileKinds && (!profileKind || !audience.profileKinds.includes(profileKind))) {
    return false;
  }
  if (audience.anyPermission && !audience.anyPermission.some((code) => can(code))) return false;
  if (duties === undefined) return true;
  if (audience.excludeDuties?.some((slug) => duties.includes(slug))) return false;
  if (audience.duties === undefined && audience.roles === undefined) return true;
  return (
    (audience.duties ?? []).some((slug) => duties.includes(slug)) ||
    (audience.roles ?? []).some((slug) => roleSlugs.includes(slug))
  );
}
