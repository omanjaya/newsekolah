"use client";

import { PageShell, Skeleton, SkeletonList } from "@newsekolah/ui";
import type { ReactElement } from "react";

/**
 * What a page shows while its route loads, shaped like the page template
 * (eyebrow, title, a toolbar field, a list card) so the real page replaces
 * it without a jump. It stays invisible for the first 200ms: most
 * navigations finish sooner, and a skeleton that flashes for a frame reads
 * as flicker, not progress. After that it fades in over 120ms.
 */
export default function AppLoading(): ReactElement {
  return (
    <PageShell
      animate={false}
      aria-busy="true"
      className="animate-fade-in [animation-delay:var(--duration-base)]"
      header={
        <div className="flex flex-col gap-1" aria-hidden="true">
          <div className="flex h-4.5 items-center">
            <Skeleton className="h-3 w-24 rounded-full" />
          </div>
          <div className="flex h-7 items-center sm:h-8">
            <Skeleton className="h-5 w-64 max-w-full rounded-full" />
          </div>
        </div>
      }
    >
      <Skeleton className="h-11 w-full max-w-sm rounded-md md:h-9" aria-hidden="true" />
      <SkeletonList rows={6} />
    </PageShell>
  );
}
