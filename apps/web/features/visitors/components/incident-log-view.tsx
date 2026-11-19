"use client";

import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  domainIcons,
  EmptyState,
  FilteredEmptyState,
  FirstUseEmptyState,
  SemanticStatusBadge,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useDateRangePresets } from "../../../lib/hooks/use-date-range-presets";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { dayRangeInZone, shiftIsoDate, todayInZone } from "../../../lib/tenant-date";
import { VisitorsWorkspaceNav } from "../../student-services/components/service-workspace-nav";
import { type Incident, useIncidentsQuery } from "../api";
import { SEVERITY_VARIANT } from "../lib/incident-severity";

import { IncidentDetailDialog } from "./incident-detail-dialog";
import { IncidentForm } from "./incident-form";

export { SEVERITY_VARIANT };

/** "14 Okt – 13 Nov 2026" for two calendar dates ("YYYY-MM-DD"). */
function formatDayRange(from: string, to: string, locale: Locale): string {
  const format = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return format.formatRange(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));
}

/**
 * The security office's incident log, defaulting to the last 30 days but
 * adjustable through the date-range filter. An incident may name people, so
 * the server already narrows the list to what this reader may individually
 * open (visitors/service.ListIncidents); this view just renders what came
 * back. Opening a row's detail is what records the audited read, not
 * listing it.
 */
export function IncidentLogView(): ReactElement {
  const t = useTranslations("app.visitors.incidents");
  const locale = useLocale() as Locale;
  const canManage = useCan("manage_visitor_incidents");
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  // Default window: the last 30 days up to today on the school's own calendar.
  const today = todayInZone(timeZone);
  const defaultFrom = shiftIsoDate(today, -30);

  const [from, setFrom] = useDateFilter("from", defaultFrom);
  const [to, setTo] = useDateFilter("to", today);
  const presets = useDateRangePresets();
  const [onlyOpen, setOnlyOpen] = useUrlState<"" | "true">("only_open", ["", "true"], "");
  const [creating, setCreating] = useState(false);
  const [openIncidentId, setOpenIncidentId] = useState<string | null>(null);

  const range = dayRangeInZone(from, to, timeZone);
  const { data, isLoading, isError, error, refetch, isRefetching } = useIncidentsQuery(
    range.from,
    range.to,
    onlyOpen !== "true",
  );
  const items = data?.data ?? [];
  const startCreate = () => {
    setCreating(true);
  };

  const filters: DataTableFilterDef[] = [
    {
      id: "onlyOpen",
      label: t("filters.onlyOpen"),
      value: onlyOpen,
      onChange: (value) => {
        setOnlyOpen(value as "" | "true");
      },
      type: "boolean",
      activeValue: "true",
    },
    {
      id: "period",
      label: t("filters.dateRange"),
      type: "dateRange",
      from,
      to,
      onChangeRange: ({ from: nextFrom, to: nextTo }) => {
        setFrom(nextFrom);
        setTo(nextTo);
      },
      presets,
      today,
    },
  ];

  const columns = useMemo<ColumnDef<Incident>[]>(
    () => [
      {
        accessorKey: "occurred_at",
        header: t("columns.occurredAt"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => formatDateTime(row.original.occurred_at, { locale, timeZone }),
      },
      {
        id: "severity",
        header: t("columns.severity"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <Badge tone={SEVERITY_VARIANT[row.original.severity]} dot>
            {t(`severities.${row.original.severity}`)}
          </Badge>
        ),
      },
      {
        accessorKey: "description",
        header: t("columns.description"),
        enableSorting: false,
        meta: { card: "title", skeleton: "lines" },
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-md">{row.original.description}</span>
        ),
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <SemanticStatusBadge
            status={row.original.is_closed ? "closed" : "open"}
            label={t(row.original.is_closed ? "status.closed" : "status.open")}
          />
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setOpenIncidentId(row.original.id);
            }}
          >
            {t("open")}
          </Button>
        ),
      },
    ],
    [t, locale, timeZone],
  );

  const filtered = onlyOpen === "true" || from !== defaultFrom || to !== today;
  const rangeText = from !== "" && to !== "" ? formatDayRange(from, to, locale) : "";
  const empty = {
    icon: <domainIcons.incident />,
    title: t("emptyTitle"),
    description: rangeText ? t("emptyRange", { range: rangeText }) : t("emptyBody"),
  };

  return (
    <AppPage
      variant="fit"
      nav={<VisitorsWorkspaceNav />}
      documentTitle={t("documentTitle")}
      primaryAction={
        canManage ? (
          <Button icon={<Plus />} onClick={startCreate}>
            {t("record")}
          </Button>
        ) : undefined
      }
      // On a phone the action is an icon on the title's line, as on every
      // Buku tamu page, so the tab row sits at one height across them.
      primaryActionCompact={
        canManage ? { icon: <Plus />, label: t("record"), onSelect: startCreate } : undefined
      }
    >
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/visitors/components/incident-log-view:1"
          mode="local"
          data={items}
          columns={columns}
          rowCount={items.length}
          searchable={false}
          filters={filters}
          filtersLabels={{
            dateRangeFrom: t("filters.from"),
            dateRangeTo: t("filters.to"),
            dateRangeInvalid: t("filters.invalidRange"),
          }}
          isLoading={isLoading}
          error={isError ? error : undefined}
          onRetry={() => void refetch()}
          retrying={isRefetching}
          getRowId={(item) => item.id}
          fillHeight
          onRowActivate={(item) => {
            setOpenIncidentId(item.id);
          }}
          emptyState={
            filtered ? (
              <FilteredEmptyState
                description={empty.description}
                onReset={() => {
                  setOnlyOpen("");
                  setFrom(defaultFrom);
                  setTo(today);
                }}
              />
            ) : canManage ? (
              <FirstUseEmptyState {...empty} actionLabel={t("record")} onAction={startCreate} />
            ) : (
              <EmptyState {...empty} />
            )
          }
        />
      </div>

      <IncidentDetailDialog
        incidentId={openIncidentId}
        onOpenChange={(open) => {
          if (!open) setOpenIncidentId(null);
        }}
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("record")}>
          {creating && (
            <IncidentForm
              onDone={() => {
                setCreating(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}
