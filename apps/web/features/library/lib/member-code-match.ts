/** The identifiers a printed card or a typed code can legitimately equal. */
export interface CodeMatchableMember {
  user_id: string;
  member_no?: string | null;
  nis?: string | null;
  username?: string | null;
}

/** A member identifier a code may be compared with. */
export type MemberCodeField = "member_no" | "nis" | "username";

/** The staffed desk: a librarian is present, so any of the member's identifiers will do. */
export const ALL_MEMBER_CODE_FIELDS: readonly MemberCodeField[] = ["member_no", "nis", "username"];

/**
 * The unattended self-service kiosk: only the member number printed on
 * the card. A classmate's NIS or username is easy to know, and accepting
 * them would let anyone at the screen borrow in that classmate's name.
 */
export const PRINTED_CARD_CODE_FIELDS: readonly MemberCodeField[] = ["member_no"];

export type MemberCodeMatch<T extends CodeMatchableMember> =
  { status: "found"; member: T } | { status: "none" } | { status: "ambiguous" };

function sameCode(candidate: string | null | undefined, code: string): boolean {
  return !!candidate && candidate.trim().toLowerCase() === code;
}

/**
 * `/v1/library/lookup` is a fuzzy substring search, so its first member is
 * not necessarily the person the code belongs to. Accept a member only when
 * the code equals one of `fields` (by default their member number, NIS or
 * username; case-insensitive), and refuse to guess when several different
 * people match exactly.
 */
export function matchMemberByCode<T extends CodeMatchableMember>(
  members: readonly T[],
  code: string,
  fields: readonly MemberCodeField[] = ALL_MEMBER_CODE_FIELDS,
): MemberCodeMatch<T> {
  const wanted = code.trim().toLowerCase();
  if (!wanted) return { status: "none" };
  const exact = members.filter((member) => fields.some((field) => sameCode(member[field], wanted)));
  const unique = [...new Map(exact.map((member) => [member.user_id, member])).values()];
  const [first, ...others] = unique;
  if (!first) return { status: "none" };
  if (others.length > 0) return { status: "ambiguous" };
  return { status: "found", member: first };
}
