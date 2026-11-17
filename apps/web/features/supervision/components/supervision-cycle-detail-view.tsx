"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Avatar,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  FirstUseEmptyState,
  List,
  ListRow,
  SectionHeader,
  SkeletonDetail,
  Stat,
  StatGrid,
  Stepper,
  domainIcons,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarCheck,
  CalendarPlus,
  ClipboardPen,
  ListChecks,
  Ruler,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  type ScheduledObservation,
  useScheduledObservationsQuery,
  useSupervisionCycleQuery,
} from "../api";

import { CycleNav } from "./cycle-nav";
import { ScheduleObservationForm } from "./schedule-observation-form";

/**
 * One supervision cycle, laid out as its workflow: the instrument it
 * scores with, the observations scheduled against teachers' lessons (each
 * filled in from its row), and the results one tab over. The figures on
 * top say how far the cycle has got.
 */
export function SupervisionCycleDetailView({ cycleId }: { cycleId: string }): ReactElement {
  const t = useTranslations("app.supervision.cycleDetail");
  const locale = useLocale() as Locale;
  const canManage = useCan("manage_supervision");

  const cycle = useSupervisionCycleQuery(cycleId);
  const scheduled = useScheduledObservationsQuery(cycleId);

  const [scheduling, setScheduling] = useState(false);

  const items = useMemo(() => scheduled.data?.data ?? [], [scheduled.data]);
  const people = useDirectoryNames(
    items.flatMap((item) => [item.teacher_user_id, item.observer_user_id]),
  );
  const teacherCount = new Set(items.map((item) => item.teacher_user_id)).size;
  const startScheduling = () => {
    setScheduling(true);
  };

  const columns = useMemo<ColumnDef<ScheduledObservation>[]>(
    () => [
      {
        id: "teacher",
        header: t("columns.teacher"),
        enableSorting: false,
        meta: { card: "title", skeleton: "avatar" },
        cell: ({ row }) => {
          const name = people.get(row.original.teacher_user_id)?.name ?? t("unknownTeacher");
          return (
            <span className="flex min-w-0 items-center gap-3">
              <Avatar name={name} size={32} decorative />
              <span className="truncate">{name}</span>
            </span>
          );
        },
      },
      {
        id: "lessonDate",
        header: t("columns.lessonDate"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => formatDate(row.original.lesson_date, { locale, timeZone: "UTC" }),
      },
      {
        id: "observer",
        header: t("columns.observer"),
        enableSorting: false,
        cell: ({ row }) => people.get(row.original.observer_user_id)?.name ?? "–",
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: t("columns.actions"),
              enableSorting: false,
              cell: ({ row }: { row: { original: ScheduledObservation } }) => (
                <Button asChild size="sm" variant="secondary" icon={<ClipboardPen />}>
                  <Link href={`/supervision/cycles/${cycleId}/observe/${row.original.id}`}>
                    {t("complete")}
                  </Link>
                </Button>
              ),
            } satisfies ColumnDef<ScheduledObservation>,
          ]
        : []),
    ],
    [t, locale, people, canManage, cycleId],
  );

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

  const { instrument } = cycle.data;
  const empty = {
    icon: <domainIcons.supervision />,
    title: t("emptyTitle"),
    description: t("emptyBody"),
  };

  return (
    <AppPage
      title={cycle.data.name}
      description={t("summary", {
        instrument: instrument.name,
        criteria: instrument.criteria.length,
      })}
      nav={<CycleNav cycleId={cycleId} current="observations" />}
      primaryAction={
        canManage ? (
          <Button icon={<CalendarPlus />} onClick={startScheduling}>
            {t("schedule")}
          </Button>
        ) : undefined
      }
      toolbar={
        // The toolbar is a wrapping row that sizes each child to its
        // content; the compact stepper's steps share its width, so give it
        // a width of its own or the labels collapse onto two lines.
        <Stepper
          className="w-full max-w-lg"
          variant="compact"
          currentIndex={items.length > 0 ? 2 : 1}
          steps={[
            { id: "instrument", label: t("steps.instrument") },
            { id: "schedule", label: t("steps.schedule") },
            { id: "observe", label: t("steps.observe") },
            { id: "report", label: t("steps.report") },
          ]}
        />
      }
    >
      <StatGrid variant="strip" aria-label={t("summaryLabel")}>
        <Stat
          icon={<CalendarCheck />}
          tone="green"
          label={t("stats.scheduled")}
          value={items.length}
          loading={scheduled.isLoading}
        />
        <Stat
          icon={<UsersRound />}
          tone="blue"
          label={t("stats.teachers")}
          value={teacherCount}
          loading={scheduled.isLoading}
        />
        <Stat
          icon={<ListChecks />}
          tone="purple"
          label={t("stats.criteria")}
          value={instrument.criteria.length}
        />
        <Stat
          icon={<Ruler />}
          tone="amber"
          label={t("stats.scale")}
          value={t("scaleRange", { min: instrument.scale_min, max: instrument.scale_max })}
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <section className="flex min-w-0 flex-col gap-3">
          <SectionHeader title={t("scheduledTitle")} count={items.length} />
          <DataTable
            stateKey="features/supervision/components/supervision-cycle-detail-view:1"
            mode="local"
            searchable={false}
            data={items}
            columns={columns}
            rowCount={items.length}
            isLoading={scheduled.isLoading}
            error={scheduled.isError ? scheduled.error : undefined}
            onRetry={() => void scheduled.refetch()}
            getRowId={(item) => item.id}
            emptyState={
              canManage ? (
                <FirstUseEmptyState
                  {...empty}
                  actionLabel={t("schedule")}
                  onAction={startScheduling}
                />
              ) : (
                <EmptyState {...empty} />
              )
            }
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("instrumentTitle")}</CardTitle>
            <CardDescription>
              {t("instrumentMeta", {
                name: instrument.name,
                min: instrument.scale_min,
                max: instrument.scale_max,
              })}
            </CardDescription>
          </CardHeader>
          <List dense aria-label={t("instrumentTitle")}>
            {instrument.criteria.map((criterion, index) => (
              <ListRow
                key={criterion.key}
                leading={
                  <span className="w-5 text-right text-label text-fg-muted tabular-nums">
                    {index + 1}
                  </span>
                }
                title={criterion.name}
                titleLines={2}
              />
            ))}
          </List>
        </Card>
      </div>

      <Dialog open={scheduling} onOpenChange={setScheduling}>
        <DialogContent title={t("scheduleTitle")}>
          <ScheduleObservationForm
            cycleId={cycleId}
            onDone={() => {
              setScheduling(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}
