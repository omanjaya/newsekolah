"use client";

import { useMemo } from "react";

import { filterNavigation, navigation, type NavItem } from "../navigation";
import { navAccessFromMe } from "../navigation-access";
import { consolidateNavigation } from "../navigation-workspaces";
import type { Me } from "../session/session-provider";
import { useSession } from "../session/session-provider";

/** The permissions that make a reader a school data manager, for the workspace rules. */
const SCHOOL_MANAGER_PERMISSIONS = ["manage_master_data", "manage_enrollments", "view_users"];

/**
 * The reader's menu: the registry filtered by permission, profile kind,
 * role and module, then merged into areas. The same computation as the
 * sidebar's (components/app-shell.tsx), exported so the page template and
 * the shell can share one answer.
 */
export function appNavigationFor(me: Me | undefined): NavItem[] {
  const access = navAccessFromMe(me);
  return consolidateNavigation(filterNavigation(navigation, access), {
    profileKind: me?.profile_kind,
    duties: me?.duties,
    canManageSchool: me?.permissions.some((code) => SCHOOL_MANAGER_PERMISSIONS.includes(code)),
    can: access.can,
  });
}

/** `appNavigationFor` for the signed-in reader, recomputed only when the session changes. */
export function useAppNavigation(): NavItem[] {
  const { me } = useSession();
  return useMemo(() => appNavigationFor(me), [me]);
}
