import type { Me, PersonaKey } from "./types";

const LEADERSHIP_ROLES = new Set(["admin", "super_admin", "principal"]);

/** Which home-screen personas the signed-in user holds; a user may hold several. */
export function resolvePersonas(me: Me): Set<PersonaKey> {
  const personas = new Set<PersonaKey>();
  const can = (code: string) => me.permissions.includes(code);
  const hasDuty = (slug: string) => (me.duties ?? []).some((duty) => duty.slug === slug);
  const hasRole = (slug: string) => me.roles.some((role) => role.slug === slug);
  if (me.profile_kind === "teacher" && can("manage_attendance")) personas.add("teacher");
  if (hasDuty("homeroom")) personas.add("homeroom");
  if (me.profile_kind === "student") personas.add("student");
  if (me.roles.some((role) => LEADERSHIP_ROLES.has(role.slug))) personas.add("leadership");
  // A permission alone is not a persona determiner here: an admin (who holds
  // every permission, including manage_library_circulation and
  // issue_scan_tokens) must not also become a librarian or picket persona,
  // and a teacher granted issue_scan_tokens without the picket duty must not
  // get the picket block either. Librarian and picket are read off the
  // caller's role/duty assignment instead.
  if (hasRole("librarian") || hasDuty("librarian")) personas.add("librarian");
  if (hasDuty("picket")) personas.add("picket");
  if (hasDuty("counselor")) personas.add("counselor");
  return personas;
}
