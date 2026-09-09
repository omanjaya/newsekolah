// Me carries a single `profile_kind` plus a list of granted `roles`. A user
// can hold roles that belong to more than one tab group (e.g. a teacher who
// is also a parent), so the app derives every group the account can switch
// into rather than trusting profile_kind alone. This mapping is mobile-only
// for now (web has no tab groups); @newsekolah/api-client only provides the
// `Me`/`Role` shapes, not this derivation.

import type { Me, ProfileKind, Role } from "@/lib/api/types";

export const TAB_GROUP_KINDS: readonly ProfileKind[] = ["student", "teacher", "staff", "parent"];

const ROLE_SLUG_TO_KIND: Record<string, ProfileKind> = {
  student: "student",
  teacher: "teacher",
  homeroom_teacher: "teacher",
  substitute_teacher: "teacher",
  parent: "parent",
  guardian: "parent",
  staff: "staff",
  admin: "staff",
  librarian: "staff",
  security: "staff",
  duty_teacher: "staff",
  counselor: "staff",
};

function kindFromRole(role: Role): ProfileKind | null {
  return ROLE_SLUG_TO_KIND[role.slug] ?? null;
}

/** Every tab group this account can switch into, most relevant first. */
export function resolveTabGroups(me: Pick<Me, "roles" | "profile_kind">): ProfileKind[] {
  const found = new Set<ProfileKind>();

  if (me.profile_kind) found.add(me.profile_kind);

  for (const role of me.roles) {
    const kind = kindFromRole(role);
    if (kind) found.add(kind);
  }

  if (found.size === 0) found.add("staff");

  return TAB_GROUP_KINDS.filter((kind) => found.has(kind));
}

/** The tab group shown right after login: the primary role's group when it
 * resolves to a known kind, otherwise profile_kind, otherwise the first
 * available group. */
export function resolveDefaultTabGroup(me: Pick<Me, "roles" | "profile_kind">): ProfileKind {
  const groups = resolveTabGroups(me);
  const primaryRole = me.roles.find((role) => role.is_primary);
  const primaryKind = primaryRole ? kindFromRole(primaryRole) : null;

  if (primaryKind && groups.includes(primaryKind)) return primaryKind;
  if (me.profile_kind && groups.includes(me.profile_kind)) return me.profile_kind;
  return groups[0] ?? "staff";
}

export function hasMultipleTabGroups(me: Pick<Me, "roles" | "profile_kind">): boolean {
  return resolveTabGroups(me).length > 1;
}

/** Whether the account holds a role with this slug, e.g. "homeroom_teacher"
 * or "duty_teacher" -- used to show a role-specific shortcut (homeroom
 * class, review queues) only to the people it applies to, on top of the
 * server's own permission check on the underlying endpoint. */
export function hasRole(me: Pick<Me, "roles">, slug: string): boolean {
  return me.roles.some((role) => role.slug === slug);
}
