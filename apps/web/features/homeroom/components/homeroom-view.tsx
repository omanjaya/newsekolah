"use client";

import type { components } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { UsersRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useModuleEnabled } from "../../../lib/modules/use-module-enabled";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import { todayInZone, useHomeroomAttendanceQuery } from "../../attendance/api";
import { DayStepper } from "../../attendance/components/day-stepper";
import { statusToken } from "../../attendance/lib/status-tokens";
import { useLeaveReviewQueueQuery } from "../../permits/api";
import { useClassesQuery } from "../../reference/api";
import { StudentLink } from "../../students/components/student-link";

import { HomeroomDisciplineTab } from "./homeroom-discipline-tab";
import { HomeroomOutOfTerm, isOutsideHomeroomTerm } from "./homeroom-out-of-term";
import { HomeroomOverview, type AttentionCode } from "./homeroom-overview";
import { HomeroomParentsTab } from "./homeroom-parents-tab";
import { HomeroomPermitsTab } from "./homeroom-permits-tab";
import { readFailure } from "./homeroom-queue-card";

type Entry = components["schemas"]["AttendanceHomeroomEntry"];

const STATUS_FILTER_CODES = ["H", "S", "I", "D", "A", "INCOMPLETE"] as const;
const STATUS_VALUES = ["", ...STATUS_FILTER_CODES] as const;
/** Statuses that put a student on the "needs attention today" list. */
const ATTENTION_CODES = new Set(["A", "INCOMPLETE"]);

/** Tabs that read the chosen day; the others carry no day stepper. */
const DATED_TABS = new Set(["overview", "attendance", "parents"]);

const PAGE_SIZE = 25;
/** Large enough to hold a whole homeroom class in one page for the
 * dashboard's own summary sections, which need every student regardless
 * of the searchable table's own filter/pagination state below. */
const DASHBOARD_LIMIT = 200;

/** Homeroom teacher's at-a-glance dashboard, plus the full searchable roster. */
export function HomeroomView(): ReactElement {
  const t = useTranslations("app.homeroom");
  const { me } = useSession();
  const homeroom = me?.duties?.find((d) => d.slug === "homeroom");
  const permitsOn = useModuleEnabled("permits");
  const disciplineOn = useModuleEnabled("discipline");
  const canViewDiscipline = useCan("view_discipline") && disciplineOn;
  const [tab, setTab] = useUrlState<string>(
    "tab",
    [
      "overview",
      "attendance",
      ...(permitsOn ? ["permits"] : []),
      ...(canViewDiscipline ? ["discipline"] : []),
      "parents",
    ],
    "overview",
  );
  const today = todayInZone(me?.tenant.timezone);
  const [date, setDate] = useDateFilter("date", today);
  const classes = useClassesQuery();
  const [search, setSearch] = useRememberedViewState("homeroom-search", "");
  // A filter change replaces the history entry: Back leaves the list
  // rather than stepping through every filter tried (audit r5-n4).
  const [statusCode, , replaceStatusCode] = useUrlState<(typeof STATUS_VALUES)[number]>(
    "status",
    STATUS_VALUES,
    "",
  );
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });

  const { data, isLoading, isError, error, refetch } = useHomeroomAttendanceQuery(
    {
      date,
      search: search || undefined,
      statusCode: statusCode || undefined,
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
    },
    Boolean(homeroom),
  );
  // Independent of the table's own search/status filter and pagination --
  // the dashboard sections below need every student for the day, not just
  // whatever page or filter the searchable table currently shows.
  const dashboard = useHomeroomAttendanceQuery(
    { date, limit: DASHBOARD_LIMIT, offset: 0 },
    Boolean(homeroom),
  );
  const leaveQueue = useLeaveReviewQueueQuery(Boolean(homeroom) && permitsOn);

  const overviewPanel = useRef<HTMLDivElement>(null);
  const attendancePanel = useRef<HTMLDivElement>(null);
  const parentsPanel = useRef<HTMLDivElement>(null);
  const focusAttendance = useRef(false);
  useEffect(() => {
    if (tab !== "attendance" || !focusAttendance.current) return;
    // Radix keeps every panel mounted but shows the chosen one (drops its
    // `hidden`) only in a render after this one commits, and a hidden
    // element takes no focus: focusing it here left focus on <body>
    // (audit r4-r3-n22). A frame later the panel is shown.
    const frame = requestAnimationFrame(() => {
      focusAttendance.current = false;
      attendancePanel.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [tab]);

  const rows = data?.data ?? [];
  const isFiltered = search !== "" || statusCode !== "";

  // A day still to come has had no lessons (ISO dates compare as
  // strings): its unrecorded sessions are "not yet", so nobody needs
  // attention and no guardian a call (audit r6-n4).
  const upcoming = date > today;

  // On a day still to come the INCOMPLETE option reads "not yet", as the
  // rows' badges do, so a deep link or a pick never shows "incomplete"
  // over them.
  const statusOptionLabel = (code: (typeof STATUS_FILTER_CODES)[number]): string =>
    upcoming && code === "INCOMPLETE" ? t("upcomingCode") : t(`codes.${code}`);
  const filters: DataTableFilterDef[] = [
    {
      id: "status",
      label: t("statusFilterLabel"),
      value: statusCode,
      onChange: (value) => {
        replaceStatusCode(value as (typeof STATUS_VALUES)[number]);
        setPagination((p) => ({ ...p, pageIndex: 0 }));
      },
      options: STATUS_FILTER_CODES.map((code) => ({ value: code, label: statusOptionLabel(code) })),
    },
  ];

  const attentionRows = useMemo(
    () =>
      upcoming
        ? []
        : (dashboard.data?.data ?? []).filter((row) => ATTENTION_CODES.has(row.status_code)),
    [dashboard.data, upcoming],
  );
  const disciplineRows = useMemo(
    () => (dashboard.data?.data ?? []).filter((row) => (row.violation_count ?? 0) > 0),
    [dashboard.data],
  );
  const pendingLeave = useMemo(
    () => (leaveQueue.data?.data ?? []).filter((item) => item.class_id === homeroom?.scope_id),
    [leaveQueue.data, homeroom],
  );

  const columns = useMemo<ColumnDef<Entry>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        meta: { card: "title" },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-fg">
              <StudentLink studentId={row.original.student_user_id}>
                {formatDisplayName(row.original.name)}
              </StudentLink>
            </span>
            {row.original.nis && (
              <span className="text-caption font-normal text-fg-muted">{row.original.nis}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "status_code",
        header: t("columns.status"),
        enableSorting: false,
        meta: { card: "meta" },
        cell: ({ row }) => {
          const code = row.original.status_code;
          if (upcoming && code === "INCOMPLETE") {
            return <Badge tone="neutral">{t("upcomingCode")}</Badge>;
          }
          const token = statusToken(code);
          return token ? (
            <StatusBadge status={token} label={t(`codes.${code}`)} />
          ) : (
            <Badge tone="neutral">{t(`codes.${code}`)}</Badge>
          );
        },
      },
      {
        id: "sessions",
        header: t("columns.sessions"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className={row.original.complete || upcoming ? undefined : "text-warning"}>
            {row.original.submitted_sessions}/{row.original.expected_sessions}
          </span>
        ),
      },
      {
        id: "guardian",
        header: t("columns.guardian"),
        enableSorting: false,
        cell: ({ row }) => {
          const { guardian_name, guardian_phone } = row.original;
          if (!guardian_name && !guardian_phone) {
            return <span className="text-fg-muted">{t("noGuardian")}</span>;
          }
          return (
            <div className="flex flex-col">
              {guardian_name && <span className="text-fg">{guardian_name}</span>}
              {guardian_phone && (
                <span className="text-caption font-normal text-fg-muted">{guardian_phone}</span>
              )}
            </div>
          );
        },
      },
      // Discipline off: the API reports no violations for anyone, so the
      // column is left out rather than reading "none" on every row.
      ...(disciplineOn
        ? [
            {
              id: "violations",
              header: t("columns.violations"),
              enableSorting: false,
              cell: ({ row }) => {
                const count = row.original.violation_count ?? 0;
                if (count === 0) {
                  return <span className="text-fg-muted">{t("noViolations")}</span>;
                }
                return (
                  <span className="text-fg">
                    {t("violationSummary", { count, points: row.original.violation_points ?? 0 })}
                  </span>
                );
              },
            } satisfies ColumnDef<Entry>,
          ]
        : []),
    ],
    [t, disciplineOn, upcoming],
  );

  const access = navAccessFromMe(me);
  if (!homeroom) {
    // An administrator can make someone a homeroom teacher; say where.
    const canAssign = canOpenPath("/school/assignments", access);
    return (
      <AppPage>
        <EmptyState
          icon={<UsersRound aria-hidden="true" />}
          title={t("noHomeroomTitle")}
          description={canAssign ? t("noHomeroomAdminBody") : t("noHomeroomBody")}
          action={
            canAssign ? (
              <Button asChild variant="secondary">
                <Link href="/school/assignments">{t("openAssignments")}</Link>
              </Button>
            ) : undefined
          }
        />
      </AppPage>
    );
  }

  // The duty names its class; an older assignment without the label falls
  // back to the class list.
  const className =
    homeroom.scope_label ?? classes.data?.data.find((c) => c.id === homeroom.scope_id)?.name;

  function changeDate(next: string) {
    setDate(next);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  /**
   * Opens class attendance filtered to one status, from the first page. A
   * name still typed in its search from an earlier visit is dropped, or the
   * list could come up empty although students have that status.
   */
  function showStatus(code: AttentionCode) {
    setSearch("");
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    // The control that opened the list goes away with the tab: focus moves
    // to the list's panel rather than falling to <body> (audit r3-n22).
    focusAttendance.current = true;
    // One history entry: the tab change pushes it and the filter is
    // written into that same entry, so Back returns to the summary as it
    // was, not to a summary carrying a hidden filter (audit r5-n4).
    setTab("attendance");
    replaceStatusCode(code);
  }

  // The way back to today, offered where a dated tab explains that the
  // chosen day lies outside the reader's homeroom term (audit r5-n5).
  // The button goes away with the notice once today loads, so focus moves
  // to the tab's own panel, which is shown already, rather than falling to
  // <body> (audit r3-n22).
  const showToday =
    date === today
      ? undefined
      : () => {
          changeDate(today);
          const panels: Record<string, RefObject<HTMLDivElement | null> | undefined> = {
            overview: overviewPanel,
            attendance: attendancePanel,
            parents: parentsPanel,
          };
          panels[tab]?.current?.focus();
        };

  return (
    <Tabs value={tab} onValueChange={setTab} className="contents">
      <AppPage
        description={className ? t("titleWithClass", { className }) : undefined}
        // The day steps only the tabs fed by the dated dashboard; Izin and
        // Pelanggaran ignore it. In the toolbar, like attendance and staff
        // attendance, so a phone keeps the tab strip right under the title.
        toolbar={
          DATED_TABS.has(tab) ? (
            <DayStepper
              value={date}
              onChange={changeDate}
              today={today}
              labels={{
                previous: t("prevDay"),
                next: t("nextDay"),
                today: t("today"),
                date: t("dateLabel"),
              }}
            />
          ) : undefined
        }
        nav={
          <TabsList variant="underline" aria-label={t("tabsLabel")}>
            <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
            <TabsTrigger value="attendance">{t("tabs.attendance")}</TabsTrigger>
            {permitsOn && <TabsTrigger value="permits">{t("tabs.permits")}</TabsTrigger>}
            {canViewDiscipline && (
              <TabsTrigger value="discipline">{t("tabs.discipline")}</TabsTrigger>
            )}
            <TabsTrigger value="parents">{t("tabs.parents")}</TabsTrigger>
          </TabsList>
        }
      >
        <TabsContent ref={overviewPanel} value="overview" className="pt-0">
          {/* Who needs the homeroom teacher on the chosen day, first. */}
          <HomeroomOverview
            date={date}
            today={today}
            dashboard={dashboard}
            leaveQueue={leaveQueue}
            counts={dashboard.data?.status_counts ?? {}}
            attentionRows={attentionRows}
            disciplineRows={disciplineRows}
            pendingLeave={pendingLeave}
            showLeave={permitsOn}
            showDiscipline={disciplineOn}
            onShowStatus={showStatus}
            onShowToday={showToday}
          />
        </TabsContent>
        <TabsContent ref={attendancePanel} value="attendance" className="pt-0">
          {isOutsideHomeroomTerm(error) ? (
            <HomeroomOutOfTerm date={date} onShowToday={showToday} />
          ) : (
            <DataTable
              stateKey="features/homeroom/components/homeroom-view:1"
              data={rows}
              columns={columns}
              rowCount={data?.total ?? 0}
              pagination={pagination}
              onPaginationChange={setPagination}
              sorting={[]}
              onSortingChange={() => undefined}
              globalFilter={search}
              onGlobalFilterChange={(value) => {
                setSearch(value);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
              filters={filters}
              isLoading={isLoading}
              error={isError ? error : undefined}
              onRetry={() => {
                void refetch();
              }}
              getRowId={(r) => r.student_user_id}
              toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
              emptyState={
                <EmptyState
                  icon={<UsersRound aria-hidden="true" />}
                  title={isFiltered ? t("noMatchTitle") : t("emptyTitle")}
                  description={isFiltered ? t("noMatchBody") : t("emptyBody")}
                />
              }
            />
          )}
        </TabsContent>
        {permitsOn && (
          <TabsContent value="permits" className="pt-0">
            <HomeroomPermitsTab classId={homeroom.scope_id ?? ""} timeZone={me?.tenant.timezone} />
          </TabsContent>
        )}
        {canViewDiscipline && (
          <TabsContent value="discipline" className="pt-0">
            <HomeroomDisciplineTab classId={homeroom.scope_id ?? ""} />
          </TabsContent>
        )}
        <TabsContent ref={parentsPanel} value="parents" className="pt-0">
          {isOutsideHomeroomTerm(dashboard.error) ? (
            <HomeroomOutOfTerm date={date} onShowToday={showToday} />
          ) : (
            <HomeroomParentsTab
              rows={dashboard.data?.data ?? []}
              isLoading={dashboard.isLoading}
              failure={readFailure(dashboard)}
            />
          )}
        </TabsContent>
      </AppPage>
    </Tabs>
  );
}
