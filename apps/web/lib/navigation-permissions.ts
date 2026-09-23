import { navigation, type NavItem } from "./navigation";

/**
 * The permission a path needs, taken from the registry rather than repeated
 * on every page. Matching is longest-prefix so a detail route inherits the
 * permission of the list it belongs to, and a path the registry does not
 * know needs nothing beyond a session.
 *
 * Its own file because navigation.ts is at the 400-line cap.
 */
export function permissionForPath(pathname: string): string | undefined {
  let best: NavItem | undefined;
  for (const item of navigation) {
    if (pathname !== item.href && !pathname.startsWith(`${item.href}/`)) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best?.routePermission ?? best?.permission;
}
