"use client";

import { Skeleton } from "@newsekolah/ui";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useSessionQuery } from "../api";

import { SessionEditor } from "./session-editor";

/**
 * The teacher's roster grid (docs/07-ui-ux.md section 4): every student
 * defaults to present, one tap changes status, search and per-status
 * filter chips keep a class of 36 under 30 seconds. Students locked by an
 * issued leave letter or an active permit show why. This component only
 * resolves the session; `SessionEditor` owns all the editing state.
 */
export function SessionView({
  sessionId,
  openedInCorrection = false,
}: {
  sessionId: string;
  /**
   * The session was opened for a class the caller neither teaches nor
   * substitutes for (a corrector or homeroom teacher reaching a past,
   * never-submitted session): the save must go through correction mode
   * from the first save, not only once something has already been
   * submitted.
   */
  openedInCorrection?: boolean;
}): ReactElement {
  const { data, isLoading, error, isRefetchError, refetch } = useSessionQuery(sessionId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error && !isRefetchError) {
    return <QueryError retry={refetch} className="m-6" />;
  }
  if (!data) return <QueryError retry={refetch} className="m-6" />;
  return (
    <SessionEditor
      key={data.submitted_at ?? "open"}
      session={data}
      openedInCorrection={openedInCorrection}
    />
  );
}
