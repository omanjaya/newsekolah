"use client";

import { SkeletonList } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { RecordNotFoundPage } from "../../../components/record-not-found";
import { isNotFoundError } from "../../../lib/api/not-found";
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
  const t = useTranslations("app.attendance.session");
  const { data, isLoading, error, isRefetchError, refetch } = useSessionQuery(sessionId);

  // Loading and a failed load keep the page frame and its way back.
  if (isLoading) {
    return (
      <AppPage>
        <SkeletonList rows={8} />
      </AppPage>
    );
  }
  // An unknown or malformed id is a missing session, not a failure to retry.
  if (!data && isNotFoundError(error)) {
    return (
      <RecordNotFoundPage
        title={t("notFoundTitle")}
        backHref="/attendance"
        backLabel={t("backToList")}
      />
    );
  }
  if ((error && !isRefetchError) || !data) {
    return (
      <AppPage>
        <QueryError retry={refetch} error={error} />
      </AppPage>
    );
  }
  return (
    <SessionEditor
      // A new save or a switch to correction mode starts a fresh editor,
      // so an error from the other mode does not linger.
      key={`${data.submitted_at ?? "open"}:${openedInCorrection ? "correction" : "normal"}`}
      session={data}
      openedInCorrection={openedInCorrection}
    />
  );
}
