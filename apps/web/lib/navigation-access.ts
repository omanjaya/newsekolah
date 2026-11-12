import type { NavProfileKind } from "./navigation";
import type { Me } from "./session/session-provider";

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
