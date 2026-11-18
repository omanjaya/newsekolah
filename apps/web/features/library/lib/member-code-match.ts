/** The identifiers a printed card or a typed code can legitimately equal. */
export interface CodeMatchableMember {
  user_id: string;
  member_no?: string | null;
  nis?: string | null;
  username?: string | null;
}

export type MemberCodeMatch<T extends CodeMatchableMember> =
  { status: "found"; member: T } | { status: "none" } | { status: "ambiguous" };

function sameCode(candidate: string | null | undefined, code: string): boolean {
  return !!candidate && candidate.trim().toLowerCase() === code;
}

/**
 * `/v1/library/lookup` is a fuzzy substring search, so its first member is
 * not necessarily the person the code belongs to. Accept a member only when
 * the code equals their member number, NIS or username (case-insensitive),
 * and refuse to guess when several different people match exactly.
 */
export function matchMemberByCode<T extends CodeMatchableMember>(
  members: readonly T[],
  code: string,
): MemberCodeMatch<T> {
  const wanted = code.trim().toLowerCase();
  if (!wanted) return { status: "none" };
  const exact = members.filter(
    (member) =>
      sameCode(member.member_no, wanted) ||
      sameCode(member.nis, wanted) ||
      sameCode(member.username, wanted),
  );
  const unique = [...new Map(exact.map((member) => [member.user_id, member])).values()];
  const [first, ...others] = unique;
  if (!first) return { status: "none" };
  if (others.length > 0) return { status: "ambiguous" };
  return { status: "found", member: first };
}
