import { useSession } from "./session-provider";

/** The roles that make a reader the school's own admin. */
const SCHOOL_ADMIN_ROLES: ReadonlySet<string> = new Set(["admin", "super_admin"]);

/**
 * True when the signed-in reader is the school's admin, so copy that says
 * "ask the school admin" would point back at them and needs another next
 * step. False while loading or anonymous.
 */
export function useIsSchoolAdmin(): boolean {
  const { me } = useSession();
  return me?.roles.some((role) => SCHOOL_ADMIN_ROLES.has(role.slug)) ?? false;
}
