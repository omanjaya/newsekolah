"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CountBadge,
  EmptyState,
  List,
  SkeletonList,
} from "@newsekolah/ui";
import { CheckCircle2 } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

/**
 * One titled list card of the homeroom screens (Ringkasan and Izin): the
 * title with its count, a skeleton while loading, and the same calm "all
 * clear" line (a success check) when nothing is listed, so the same card
 * reads the same on every tab (audit teaching-16).
 */
export function HomeroomQueueCard({
  title,
  count,
  countTone = "neutral",
  loading,
  empty,
  className,
  children,
}: {
  title: string;
  count: number;
  /**
   * `accent` when the count is work waiting on the teacher (people to
   * contact, requests to review), as `CountBadge` documents; `neutral` for
   * a plain tally.
   */
  countTone?: "accent" | "neutral";
  loading: boolean;
  /** Said in the card when there is nothing to list. */
  empty: string;
  className?: string;
  /** The list rows. */
  children: ReactNode;
}): ReactElement {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          {title}
          {!loading && <CountBadge count={count} tone={countTone} />}
        </CardTitle>
      </CardHeader>
      {loading ? (
        <CardContent className="pt-0">
          <SkeletonList rows={2} framed={false} />
        </CardContent>
      ) : count === 0 ? (
        <CardContent className="pt-0">
          <EmptyState
            variant="compact"
            tone="success"
            icon={<CheckCircle2 aria-hidden="true" />}
            title={empty}
          />
        </CardContent>
      ) : (
        <List>{children}</List>
      )}
    </Card>
  );
}
