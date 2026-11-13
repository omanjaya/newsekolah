import type { NavAccess } from "../../../lib/navigation-access";
import { pathAccess } from "../../../lib/navigation-permissions";

/**
 * The deep link a notification may offer. A notification raised before the
 * school switched a module off still points at that module's screen; the
 * row then stays readable and markable but is no longer a link into a screen
 * that would only say the module is unavailable.
 */
export function openableHref(
  href: string | null | undefined,
  access: NavAccess,
): string | undefined {
  if (!href) return undefined;
  const path = href.split(/[?#]/)[0] ?? href;
  return pathAccess(path, access) === "module-disabled" ? undefined : href;
}
