"use client";

import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  domainIcons,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { type Incident, useIncidentsQuery } from "../api";

import { IncidentDetailDialog } from "./incident-detail-dialog";
import { IncidentForm } from "./incident-form";

const SEVERITY_VARIANT: Record<Incident["severity"], "accent" | "neutral"> = {
  low: "neutral",
  medium: "neutral",
  high: "accent",
  critical: "accent",
};

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * The security office's incident log, covering the last 30 days. An
 * incident may name people, so the server already narrows the list to what
 * this reader may individually open (visitors/service.ListIncidents); this
 * view just renders what came back. Opening a row's detail is what records
 * the audited read, not listing it.
 */
export function IncidentLogView(): ReactElement {
  const t = useTranslations("app.visitors.incidents");
  const locale = useLocale() as Locale;
  const canManage = useCan("manage_visitor_incidents");

  const [from] = useState(() => daysAgoIso(30));
  const [to] = useState(() => tomorrowIso());
  const [includeClosed, setIncludeClosed] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openIncidentId, setOpenIncidentId] = useState<string | null>(null);

  const { data, isLoading } = useIncidentsQuery(from, to, includeClosed);
  const items = data?.data ?? [];

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
          <Badge variant={row.original.is_closed ? "neutral" : "accent"}>
            {t(row.original.is_closed ? "status.closed" : "status.open")}
          </Badge>
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
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
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

      <label className="flex items-center gap-2 text-[13px] font-medium">
        <Checkbox
          checked={includeClosed}
          onCheckedChange={(v) => {
            setIncludeClosed(v === true);
          }}
        />
        {t("filters.includeClosed")}
      </label>

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
          isLoading={isLoading}
          getRowId={(item) => item.id}
          fillHeight
          onRowActivate={(item) => {
            setOpenIncidentId(item.id);
          }}
          emptyState={
            <EmptyState
              icon={<domainIcons.incident aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
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
