import { navigation, type NavItem, type NavProfileKind } from "./navigation";

/**
 * The single permission a path needs, taken from the registry rather than
 * repeated on every page. Matching is longest-prefix so a detail route
 * inherits the permission of the list it belongs to, and a path the
 * registry does not know needs nothing beyond a session. Items gated by
 * `anyPermission` instead of one `permission` (see navigation.ts) have no
 * single code to return here; use `canOpenPath` for those.
 *
 * Its own file because navigation.ts is at the 400-line cap.
 */
export function permissionForPath(pathname: string): string | undefined {
  const best = navItemForPath(pathname);
  return best?.routePermission ?? best?.permission;
}

/**
 * Whether a reader may open `pathname`: the permission(s) above, plus the
 * profile kinds the registry scopes the page to or excludes it from (a
 * teacher's journal is not a student's page, and a student's own
 * view_academic_data does not make a master-data roster theirs, even
 * though the list endpoint accepts any session). Checked before the page
 * mounts, so a refused page fires no requests.
 */
export function canOpenPath(
  pathname: string,
  can: (permission: string) => boolean,
  profileKind: NavProfileKind | undefined,
  roleSlugs: string[] = [],
): boolean {
  const best = navItemForPath(pathname);
  if (!best) return true;
  const required = best.routePermission ?? best.permission;
  if (required && !can(required)) return false;
  if (best.anyPermission && !best.anyPermission.some((code) => can(code))) return false;
  if (best.profileKinds && (!profileKind || !best.profileKinds.includes(profileKind))) {
    return false;
  }
  if (best.excludeProfileKinds && profileKind && best.excludeProfileKinds.includes(profileKind)) {
    return false;
  }
  if (best.excludeRoles?.some((slug) => roleSlugs.includes(slug))) {
    return false;
  }
  return true;
}

function navItemForPath(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of navigation) {
    if (pathname !== item.href && !pathname.startsWith(`${item.href}/`)) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best;
}
