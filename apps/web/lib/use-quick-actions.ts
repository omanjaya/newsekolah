"use client";

import { useMemo } from "react";

import { availableQuickActions, type QuickAction } from "./quick-actions";
import { useSession } from "./session/session-provider";

/** The quick actions the signed-in reader may perform (see `availableQuickActions`). */
export function useQuickActions(): QuickAction[] {
  const { me } = useSession();
  const permissions = me?.permissions;
  const profileKind = me?.profile_kind;
  const roles = me?.roles;
  return useMemo(() => {
    const roleSlugs = (roles ?? []).map((role) => role.slug);
    return availableQuickActions(
      (permission) => permissions?.includes(permission) ?? false,
      profileKind,
      roleSlugs,
    );
  }, [permissions, profileKind, roles]);
}
