import type { Me, PersonaKey } from "./types";

const LEADERSHIP_ROLES = new Set(["admin", "super_admin", "principal"]);

/** Which home-screen personas the signed-in user holds; a user may hold several. */
export function resolvePersonas(me: Me): Set<PersonaKey> {
  const personas = new Set<PersonaKey>();
  const can = (code: string) => me.permissions.includes(code);
  const hasDuty = (slug: string) => (me.duties ?? []).some((duty) => duty.slug === slug);
  if (me.profile_kind === "teacher" && can("manage_attendance")) personas.add("teacher");
  if (hasDuty("homeroom")) personas.add("homeroom");
  if (me.profile_kind === "student") personas.add("student");
  if (me.roles.some((role) => LEADERSHIP_ROLES.has(role.slug))) personas.add("leadership");
  if (can("manage_library_circulation")) personas.add("librarian");
  if (hasDuty("picket") || can("issue_scan_tokens")) personas.add("picket");
  if (hasDuty("counselor")) personas.add("counselor");
  return personas;
}
