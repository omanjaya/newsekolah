"use client";

import { Skeleton } from "@newsekolah/ui";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactElement, ReactNode } from "react";

import { useSession } from "../lib/session/session-provider";

import { ForbiddenPage } from "./forbidden-page";

export interface RouteGuardProps {
  children: ReactNode;
  /** Permission code required for this page; omitted means "any signed-in user". */
  requiredPermission?: string;
}

/**
 * Gates the `(app)` route group on the session loaded from `/v1/me`, never
 * on anything cached client-side (docs/05-shared-components.md: "RouteGuard:
 * berbasis permission dari server"). Also enforces the forced
 * password-change redirect here so every page under `(app)` gets it for
 * free instead of each page checking `must_change_password` itself.
 */
export function RouteGuard({ children, requiredPermission }: RouteGuardProps): ReactElement {
  const { status, me, isReady } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isReady) return;
    if (status === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (me?.must_change_password) {
      router.replace("/change-password");
    }
  }, [status, isReady, me?.must_change_password, pathname, router]);

  if (!isReady || status === "anonymous" || me?.must_change_password) {
    return (
      <div className="flex flex-col gap-4 p-6" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (requiredPermission && !me?.permissions.includes(requiredPermission)) {
    return <ForbiddenPage />;
  }

  return <>{children}</>;
}
