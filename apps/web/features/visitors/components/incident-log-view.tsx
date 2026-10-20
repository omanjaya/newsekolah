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
  PageHeader,
  SemanticStatusBadge,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useDateRangePresets } from "../../../lib/hooks/use-date-range-presets";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { VisitorsWorkspaceNav } from "../../student-services/components/service-workspace-nav";
import { type Incident, useIncidentsQuery } from "../api";

import { IncidentDetailDialog } from "./incident-detail-dialog";
import { IncidentForm } from "./incident-form";

const SEVERITY_VARIANT: Record<Incident["severity"], "accent" | "neutral"> = {
  low: "neutral",
  medium: "neutral",
  high: "accent",
  critical: "accent",
};

function daysAgoDateIso(days: number): string {
  const d = businessNow();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayDateIso(): string {
  return businessNow().toISOString().slice(0, 10);
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
  const workspace = useTranslations("app.serviceWorkspace");
  const t = useTranslations("app.visitors.incidents");
  const locale = useLocale() as Locale;
  const canManage = useCan("manage_visitor_incidents");

  const [from, setFrom] = useDateFilter("from", daysAgoDateIso(30));
  const [to, setTo] = useDateFilter("to", todayDateIso());
  const presets = useDateRangePresets();
  const [onlyOpen, setOnlyOpen] = useUrlState<"" | "true">("only_open", ["", "true"], "");
  const [creating, setCreating] = useState(false);
  const [openIncidentId, setOpenIncidentId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useIncidentsQuery(
    `${from}T00:00:00Z`,
    `${to}T23:59:59Z`,
    onlyOpen !== "true",
  );
  const items = data?.data ?? [];

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
    },
  ];

  const columns = useMemo<ColumnDef<Incident>[]>(
    () => [
      {
        accessorKey: "occurred_at",
        header: t("columns.occurredAt"),
        enableSorting: false,
        cell: ({ row }) => formatDateTime(row.original.occurred_at, { locale }),
      },
      {
        id: "severity",
        header: t("columns.severity"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={SEVERITY_VARIANT[row.original.severity]}>
            {t(`severities.${row.original.severity}`)}
          </Badge>
        ),
      },
      {
        accessorKey: "description",
        header: t("columns.description"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-[420px]">{row.original.description}</span>
        ),
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
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
    [t, locale],
  );

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the table scrolls its rows internally while the
    // filter row stays put. See school/components/users-view.tsx for the
    // reference pattern.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <VisitorsWorkspaceNav />
      <PageHeader
        eyebrow={t("eyebrow")}
        title={workspace("visitors")}
        actions={
          canManage && (
            <Button
              icon={<Plus />}
              onClick={() => {
                setCreating(true);
              }}
            >
              {t("record")}
            </Button>
          )
        }
      />

      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/visitors/components/incident-log-view:1"
          mode="local"
          data={items}
          columns={columns}
          rowCount={items.length}
          pagination={{ pageIndex: 0, pageSize: 50 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter=""
          filters={filters}
          filtersLabels={{
            reset: t("filters.reset"),
            removeFilter: (label) => t("filters.removeFilter", { label }),
            dateRangeFrom: t("filters.from"),
            dateRangeTo: t("filters.to"),
            dateRangeInvalid: t("filters.invalidRange"),
          }}
          isLoading={isLoading}
          getRowId={(item) => item.id}
          fillHeight
          onRowActivate={(item) => {
            setOpenIncidentId(item.id);
          }}
          emptyState={
            isError ? (
              <QueryError retry={refetch} />
            ) : (
              <EmptyState
                icon={<domainIcons.incident aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
              />
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

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
        }}
      >
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
    </div>
  );
}
