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
import { useDirectoryNames } from "../../reference/directory-names";
import { useScheduledObservationsQuery, useSupervisionCycleQuery } from "../api";

import { CycleNav } from "./cycle-nav";

interface TeacherRow {
  teacherUserId: string;
  scheduledCount: number;
}

/**
 * The cycle's results tab: every teacher this cycle has scheduled an
 * observation for, each opening their own report (averages per criterion,
 * every observation). There is no separate cycle-aggregate endpoint; this
 * is built from the same scheduled list the cycle's observations tab shows.
 */
export function SupervisionCycleReportView({ cycleId }: { cycleId: string }): ReactElement {
  const t = useTranslations("app.supervision.cycleReport");
  const tRoot = useTranslations("app.supervision");

  const cycle = useSupervisionCycleQuery(cycleId);
  const scheduled = useScheduledObservationsQuery(cycleId);
  const teacherMap = useDirectoryNames(
    (scheduled.data?.data ?? []).map((item) => item.teacher_user_id),
  );

  const rows = useMemo<TeacherRow[]>(() => {
    const counts = new Map<string, number>();
    for (const s of scheduled.data?.data ?? []) {
      counts.set(s.teacher_user_id, (counts.get(s.teacher_user_id) ?? 0) + 1);
    }
    return [...counts.entries()].map(([teacherUserId, scheduledCount]) => ({
      teacherUserId,
      scheduledCount,
    }));
  }, [scheduled.data]);

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
              meta={t("scheduledCount", { count: row.scheduledCount })}
              href={`/supervision/cycles/${cycleId}/teachers/${row.teacherUserId}/report`}
            />
          );
        })}
      </List>
    );
  }

  return (
    <AppPage
      title={cycle.data.name}
      documentTitle={t("documentTitle", { cycle: cycle.data.name })}
      breadcrumb={[
        { label: tRoot("navLabelCycles"), href: "/supervision/cycles" },
        { label: cycle.data.name, href: `/supervision/cycles/${cycleId}` },
        { label: t("breadcrumb") },
      ]}
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
