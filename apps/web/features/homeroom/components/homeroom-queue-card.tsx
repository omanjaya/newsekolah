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

import { QueryError } from "../../../components/query-error";

/** A failed read behind a homeroom card: what failed, and how to read it again. */
export interface ReadFailure {
  error: unknown;
  retry: () => unknown;
}

/**
 * One titled list card of the homeroom screens (Ringkasan and Izin): the
 * title with its count, a skeleton while loading, and the same calm "all
 * clear" line (a success check) when nothing is listed, so the same card
 * reads the same on every tab (audit teaching-16). A failed read says so
 * instead: an error is not "nothing to do" (audit r3-n18).
 */
export function HomeroomQueueCard({
  title,
  count,
  countTone = "neutral",
  loading,
  failure,
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
  /** The card's read failed: no count, no all-clear, the error instead. */
  failure?: ReadFailure | null;
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
          {!loading && !failure && <CountBadge count={count} tone={countTone} />}
        </CardTitle>
      </CardHeader>
      {loading ? (
        <CardContent className="pt-0">
          <SkeletonList rows={2} framed={false} />
        </CardContent>
      ) : failure ? (
        <CardContent className="pt-0">
          <QueryError retry={failure.retry} error={failure.error} />
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

/** The failure of a query result, or `null` while it has not failed. */
export function readFailure(query: {
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}): ReadFailure | null {
  return query.isError ? { error: query.error, retry: () => query.refetch() } : null;
}
