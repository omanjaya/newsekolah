"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ReactElement, ReactNode } from "react";

import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";
import { studentProfileHref } from "../href";
import type { StudentProfileTab } from "../lib/profile-tabs";

interface StudentLinkProps {
  studentId: string | undefined | null;
  /** The student's name (or whatever stands for it). */
  children: ReactNode;
  /** Opens the profile on this tab instead of the overview. */
  tab?: StudentProfileTab;
  className?: string;
  /**
   * Set false when the person may be a teacher or staff (library members):
   * the name then stays plain text. Defaults to true.
   */
  isStudent?: boolean;
}

/**
 * A student's name as a link to their profile when the reader may open it,
 * plain text otherwise. The decision reuses the route guard's own registry
 * entry (`canOpenPath`), so the link never points at a page that would
 * refuse the reader; students themselves never get one.
 */
export function StudentLink({
  studentId,
  children,
  tab,
  className,
  isStudent = true,
}: StudentLinkProps): ReactElement {
  const { me } = useSession();
  const href = studentId && isStudent ? studentProfileHref(studentId, tab) : undefined;
  const canOpen = useMemo(() => {
    if (!me || !href) return false;
    return canOpenPath(href, (permission) => me.permissions.includes(permission), me.profile_kind);
  }, [me, href]);

  if (!href || !canOpen) return <>{children}</>;
  return (
    <Link
      href={href}
      className={className ?? "hover:underline focus-visible:underline"}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      {children}
    </Link>
  );
}
