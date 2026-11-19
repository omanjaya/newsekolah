"use client";

import {
  Avatar,
  EmptyState,
  List,
  ListRow,
  SectionHeader,
  SkeletonDetail,
  SkeletonList,
  domainIcons,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { isNotFoundError } from "../../../lib/api/not-found";
import { useDirectoryNames } from "../../reference/directory-names";
import { useScheduledObservationsQuery, useSupervisionCycleQuery } from "../api";
import { useCycleTrail } from "../lib/use-cycle-trail";

import { CycleNav } from "./cycle-nav";
import { CycleNotFoundPage } from "./cycle-not-found";

interface TeacherRow {
  teacherUserId: string;
  scheduledCount: number;
  observedCount: number;
}

/**
 * The cycle's results tab: every teacher this cycle has scheduled an
 * observation for, each opening their own report (averages per criterion,
 * every observation). There is no separate cycle-aggregate endpoint; this
 * is built from the same scheduled list the cycle's observations tab shows.
 */
export function SupervisionCycleReportView({ cycleId }: { cycleId: string }): ReactElement {
  const t = useTranslations("app.supervision.cycleReport");
  const tDetail = useTranslations("app.supervision.cycleDetail");
  const trail = useCycleTrail();

  const cycle = useSupervisionCycleQuery(cycleId);
  const scheduled = useScheduledObservationsQuery(cycleId);
  const teacherMap = useDirectoryNames(
    (scheduled.data?.data ?? []).map((item) => item.teacher_user_id),
  );

  const rows = useMemo<TeacherRow[]>(() => {
    const byTeacher = new Map<string, TeacherRow>();
    for (const s of scheduled.data?.data ?? []) {
      const row = byTeacher.get(s.teacher_user_id) ?? {
        teacherUserId: s.teacher_user_id,
        scheduledCount: 0,
        observedCount: 0,
      };
      row.scheduledCount += 1;
      if (s.observation_id) row.observedCount += 1;
      byTeacher.set(s.teacher_user_id, row);
    }
    return [...byTeacher.values()];
  }, [scheduled.data]);

  // An unknown or malformed cycle id is a missing cycle, not a failure to retry.
  if (cycle.isError && !cycle.data && isNotFoundError(cycle.error)) {
    return <CycleNotFoundPage />;
  }

  if (cycle.isError && !cycle.data) {
    return (
      <AppPage nav={false}>
        <QueryError retry={() => cycle.refetch()} error={cycle.error} />
      </AppPage>
    );
  }

  if (cycle.isLoading || !cycle.data) {
    return (
      <AppPage nav={false}>
        <SkeletonDetail />
      </AppPage>
    );
  }

  let body: ReactElement;
  if (scheduled.isLoading) {
    body = <SkeletonList rows={4} />;
  } else if (scheduled.isError && !scheduled.data) {
    body = <QueryError retry={() => scheduled.refetch()} error={scheduled.error} />;
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon={<domainIcons.supervision />}
        title={t("emptyTitle")}
        description={t("emptyBody")}
      />
    );
  } else {
    body = (
      <List framed aria-label={t("teachersTitle")}>
        {rows.map((row) => {
          const name = teacherMap.get(row.teacherUserId)?.name ?? t("unknownTeacher");
          return (
            <ListRow
              key={row.teacherUserId}
              leading={<Avatar name={name} size={40} decorative />}
              title={name}
              meta={t("progress", {
                observed: row.observedCount,
                scheduled: row.scheduledCount,
              })}
              href={`/supervision/cycles/${cycleId}/teachers/${row.teacherUserId}/report`}
            />
          );
        })}
      </List>
    );
  }

  return (
    <AppPage
      // The same head as the cycle's Observasi tab (title, description,
      // trail), so switching tabs moves only the underline.
      title={cycle.data.name}
      documentTitle={t("documentTitle", { cycle: cycle.data.name })}
      description={tDetail("summary", {
        instrument: cycle.data.instrument.name,
        criteria: cycle.data.instrument.criteria.length,
      })}
      breadcrumb={trail.cycle(cycle.data.name)}
      nav={<CycleNav cycleId={cycleId} current="report" />}
    >
      <section className="flex flex-col gap-3">
        <SectionHeader
          title={t("teachersTitle")}
          description={t("teachersHint")}
          count={rows.length}
        />
        {body}
      </section>
    </AppPage>
  );
}
