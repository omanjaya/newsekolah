"use client";

import type { components } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  HeroCard,
  Stat,
  StatGrid,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { CircleDashed, ClipboardList, UserX, UsersRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

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

import { HomeroomDashboard } from "./homeroom-dashboard";
import { HomeroomDisciplineTab } from "./homeroom-discipline-tab";
import { HomeroomParentsTab } from "./homeroom-parents-tab";
import { HomeroomPermitsTab } from "./homeroom-permits-tab";

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
  const [statusCode, setStatusCode] = useUrlState<(typeof STATUS_VALUES)[number]>(
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

  const rows = data?.data ?? [];
  const isFiltered = search !== "" || statusCode !== "";

  const filters: DataTableFilterDef[] = [
    {
      id: "status",
      label: t("statusFilterLabel"),
      value: statusCode,
      onChange: (value) => {
        setStatusCode(value as (typeof STATUS_VALUES)[number]);
        setPagination((p) => ({ ...p, pageIndex: 0 }));
      },
      options: STATUS_FILTER_CODES.map((code) => ({ value: code, label: t(`codes.${code}`) })),
    },
  ];

  const attentionRows = useMemo(
    () => (dashboard.data?.data ?? []).filter((row) => ATTENTION_CODES.has(row.status_code)),
    [dashboard.data],
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
          <span className={row.original.complete ? undefined : "text-warning"}>
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
    [t, disciplineOn],
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

  // The day's figures come from the unfiltered dashboard read: the table's
  // own read counts only the rows its search and status filter keep.
  const counts = dashboard.data?.status_counts ?? {};
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const absent = counts.A ?? 0;
  const incomplete = counts.INCOMPLETE ?? 0;
  // The duty names its class; an older assignment without the label falls
  // back to the class list.
  const className =
    homeroom.scope_label ?? classes.data?.data.find((c) => c.id === homeroom.scope_id)?.name;

  function changeDate(next: string) {
    setDate(next);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  /** Opens class attendance filtered to one status, from the first page. */
  function showStatus(code: (typeof STATUS_VALUES)[number]) {
    setStatusCode(code);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setTab("attendance");
  }

  // The status filter matches one code, so the hero opens the list that has
  // rows: alpha first (the guardian needs a call), else the students whose
  // attendance is not complete yet. The two stat cells below open each list
  // on its own (audit teaching-1).
  function showAttention() {
    showStatus(absent > 0 ? "A" : "INCOMPLETE");
  }

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
        <TabsContent value="overview" className="flex flex-col gap-6 pt-0">
          {/* Who needs the homeroom teacher today, first. */}
          <HeroCard
            tone={dashboard.isLoading || attentionRows.length === 0 ? "accent-soft" : "warning"}
            // A calm day gets a neutral eyebrow, not "Perlu perhatian".
            eyebrow={attentionRows.length > 0 ? t("attentionTitle") : t("today")}
            title={
              attentionRows.length > 0
                ? t("attentionCount", { count: attentionRows.length })
                : t("attentionNoneTitle")
            }
            meta={
              attentionRows.length > 0
                ? t("attentionBreakdown", { absent, incomplete })
                : t("attentionEmpty")
            }
            action={
              attentionRows.length > 0 ? (
                <Button variant="secondary" onClick={showAttention}>
                  {t("attentionOpen")}
                </Button>
              ) : undefined
            }
          />

          <StatGrid variant="strip" aria-label={t("statsLabel")}>
            <Stat icon={<UsersRound />} tone="blue" value={total} label={t("statTotal")} />
            <Stat
              icon={<UserX />}
              tone="red"
              value={absent}
              label={t("statAbsent")}
              onClick={
                absent > 0
                  ? () => {
                      showStatus("A");
                    }
                  : undefined
              }
            />
            <Stat
              icon={<CircleDashed />}
              tone="amber"
              value={incomplete}
              label={t("statIncomplete")}
              onClick={
                incomplete > 0
                  ? () => {
                      showStatus("INCOMPLETE");
                    }
                  : undefined
              }
            />
            {permitsOn && (
              <Stat
                icon={<ClipboardList />}
                tone="purple"
                value={pendingLeave.length}
                label={t("statPendingLeave")}
              />
            )}
          </StatGrid>

          <HomeroomDashboard
            attentionRows={attentionRows}
            disciplineRows={disciplineRows}
            pendingLeave={pendingLeave}
            dashboardLoading={dashboard.isLoading}
            leaveLoading={leaveQueue.isLoading}
            showLeave={permitsOn}
            showDiscipline={disciplineOn}
          />
        </TabsContent>
        <TabsContent value="attendance" className="pt-0">
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
        <TabsContent value="parents" className="pt-0">
          <HomeroomParentsTab rows={dashboard.data?.data ?? []} isLoading={dashboard.isLoading} />
        </TabsContent>
      </AppPage>
    </Tabs>
  );
}
