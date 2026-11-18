"use client";

import { Skeleton } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useTenant } from "../lib/tenant/tenant-provider";

import { SchoolMark } from "./school-mark";

/**
 * The root loading state, outside the app shell: shown while a route
 * group's layout loads (the sign-in pages, the public pages, the shell on
 * its first load after signing in). Nothing of a particular page's shape
 * is known yet, so it fills the screen with the school's mark and name,
 * centred like the full-screen StatePage. Like the shell's own loading
 * state it stays invisible for the first 200ms, since most loads finish
 * sooner and a frame-long flash reads as flicker, then fades in.
 */
export function BrandedLoading(): ReactElement {
  const t = useTranslations("common.states");
  const { displayName, isLoading } = useTenant();

  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-h-dvh animate-fade-in flex-col items-center justify-center gap-4 bg-bg px-4 [animation-delay:var(--duration-base)]"
    >
      <SchoolMark size={64} />
      {isLoading ? (
        <Skeleton className="h-5 w-40 rounded-full" />
      ) : (
        <p className="max-w-md text-center text-title text-fg">{displayName}</p>
      )}
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
