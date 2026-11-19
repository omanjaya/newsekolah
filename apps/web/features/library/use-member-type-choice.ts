"use client";

import { useState } from "react";

import { type LibraryMemberType, useLibraryMemberTypesQuery } from "./members-api";

/** The roles a library member is registered from. */
export const MEMBER_ROLES = ["student", "teacher", "staff"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/**
 * The member type set as the default for a role (Jenis anggota settings,
 * "Bawaan untuk peran"), or "" when none is.
 */
export function defaultMemberTypeId(
  types: readonly Pick<LibraryMemberType, "id" | "default_for_role">[],
  role: MemberRole,
): string {
  return types.find((type) => type.default_for_role === role)?.id ?? "";
}

/**
 * The member type picker of a registration form: it starts on the type
 * that is the default for the chosen role, follows the role while the
 * reader has not picked one, and keeps an explicit pick.
 */
export function useMemberTypeChoice(role: MemberRole) {
  const memberTypes = useLibraryMemberTypesQuery();
  const [picked, setPicked] = useState<string | null>(null);
  const types = memberTypes.data?.data ?? [];

  return {
    options: types.map((type) => ({ value: type.id, label: type.name })),
    value: picked ?? defaultMemberTypeId(types, role),
    onValueChange: setPicked,
    reset: () => {
      setPicked(null);
    },
    isLoading: memberTypes.isLoading,
  };
}
