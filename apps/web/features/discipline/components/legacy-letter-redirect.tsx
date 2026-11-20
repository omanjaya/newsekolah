"use client";

import { Skeleton } from "@newsekolah/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";

/**
 * Where an old warning-letter notification link (/discipline/letters/{id},
 * a page that never existed) should land for this reader: a student reads
 * their own record, staff open the issued-letters list. Undefined while
 * the session is still loading.
 */
export function legacyLetterTarget(
  me: { profile_kind?: string; permissions: string[] } | undefined,
): string | undefined {
  if (!me) return undefined;
  if (me.profile_kind === "student") return "/my-discipline";
  if (me.permissions.includes("view_discipline")) return "/discipline/warning-letters";
  return "/notifications";
}

/** Sends a stored notification's dead letter link to the page that serves it. */
export function LegacyLetterRedirect(): ReactElement {
  const router = useRouter();
  const { me, isReady } = useSession();
  const target = isReady ? (legacyLetterTarget(me) ?? "/notifications") : undefined;

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  return <Skeleton className="h-32 w-full" />;
}
