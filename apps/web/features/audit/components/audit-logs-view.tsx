"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { History } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useDateRangePresets } from "../../../lib/hooks/use-date-range-presets";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useSession } from "../../../lib/session/session-provider";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import { useDirectoryNames } from "../../reference/directory-names";
import { type AuditLogEntry, useAuditLogsQuery } from "../api";

import { AuditLogDetailDialog } from "./audit-log-detail-dialog";
import { AUDIT_ENTITY_TYPES, shortId, useAuditLabels } from "./use-audit-labels";

const SYSTEM_ACTOR = "system";

export function AuditLogsView(): ReactElement {
  const t = useTranslations("app.audit");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;

  const [actorUserId, setActorUserId] = useUrlState<string>("actor", () => true, "");
  const [entityType, setEntityType] = useUrlState<string>(
    "entity_type",
    ["", ...AUDIT_ENTITY_TYPES],
    "",
  );
  const [from, setFrom] = useDateFilter("from", "");
  const [to, setTo] = useDateFilter("to", "");
  const presets = useDateRangePresets();
  const [cursors, setCursors] = useState<string[]>([""]);
  const cursor = cursors[cursors.length - 1] ?? "";
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const actorLabels = useDirectoryPickerLabels(t("filters.actorAll"));
  const labels = useAuditLabels();

  const { data, isLoading } = useAuditLogsQuery({
    actorUserId: actorUserId || undefined,
    entityType: entityType || undefined,
    from: from || undefined,
    to: to || undefined,
    cursor: cursor || undefined,
  });

  // Actors, acting-as users and user targets on this page; one cached lookup each.
  const actorMap = useDirectoryNames(
    (data?.data ?? []).flatMap((entry) => [
      entry.actor_user_id,
      entry.acting_as_user_id,
      entry.entity_type === "user" ? entry.entity_id : undefined,
    ]),
  );

  function resetPaging() {
    setCursors([""]);
  }

  const filters: DataTableFilterDef[] = [
    {
      id: "entityType",
      label: t("filters.entityType"),
      value: entityType,
      onChange: (value) => {
        setEntityType(value);
        resetPaging();
      },
      options: AUDIT_ENTITY_TYPES.map((type) => ({ value: type, label: labels.entityType(type) })),
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
        resetPaging();
      },
      presets,
    },
  ];

  function actorName(id: string | undefined): string {
    if (!id) return t(SYSTEM_ACTOR);
    return actorMap.get(id)?.name ?? id;
  }

  const columns = useMemo<ColumnDef<AuditLogEntry>[]>(
    () => [
      {
        accessorKey: "occurred_at",
        header: t("columns.when"),
        enableSorting: false,
        cell: ({ row }) => formatDateTime(row.original.occurred_at, { locale, timeZone }),
      },
      {
        id: "actor",
        header: t("columns.actor"),
        enableSorting: false,
        cell: ({ row }) => {
          const entry = row.original;
          return (
            <div className="flex items-center gap-2">
              <span className="text-fg">{actorName(entry.actor_user_id)}</span>
              {entry.acting_as_user_id && (
                <Badge variant="neutral">
                  {t("actingAs", { name: actorName(entry.acting_as_user_id) })}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "action",
        header: t("columns.action"),
        enableSorting: false,
        cell: ({ row }) => labels.action(row.original.action),
      },
      {
        id: "entity",
        header: t("columns.entity"),
        enableSorting: false,
        cell: ({ row }) => {
          const { entity_type: type, entity_id: id } = row.original;
          // A user entity resolves to a name through the same directory as
          // the actor column; anything else shows a short id tail, and the
          // full id stays in the detail dialog.
          const target = id ? (type === "user" ? actorMap.get(id)?.name : undefined) : undefined;
          return (
            <span className="text-fg-muted">
              {labels.entityType(type)}
              {id ? ` · ${target ?? shortId(id)}` : ""}
            </span>
          );
        },
      },
      {
        accessorKey: "ip",
        header: t("columns.ip"),
        enableSorting: false,
        cell: ({ row }) => row.original.ip ?? "-",
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actorName closes over actorMap
    [t, locale, timeZone, actorMap],
  );

  const items = data?.data ?? [];
  const isImpersonating = Boolean(me?.impersonated_by);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      {isImpersonating && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-border bg-surface p-4 text-[13px]">
          <span className="min-w-0 text-fg">{t("impersonationNote")}</span>
          <Button asChild variant="secondary" size="sm">
            <Link href="/profile">{t("impersonationLink")}</Link>
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("filters.actor")}</span>
          <DirectoryPicker
            value={actorUserId}
            onValueChange={(id) => {
              setActorUserId(id);
              resetPaging();
            }}
            labels={actorLabels}
            className="w-64"
          />
        </label>
        {actorUserId !== "" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setActorUserId("");
              resetPaging();
            }}
          >
            {t("filters.clearActor")}
          </Button>
        )}
      </div>

      <DataTable
        stateKey="features/audit/components/audit-logs-view:1"
        mode="cursor"
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
        getRowId={(entry) => entry.id}
        onRowActivate={setSelected}
        emptyState={
          <EmptyState
            icon={<History aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={cursors.length <= 1}
          onClick={() => {
            setCursors((p) => p.slice(0, -1));
          }}
        >
          {t("pagePrev")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!data?.next_cursor}
          onClick={() => {
            const next = data?.next_cursor;
            if (next) setCursors((p) => [...p, next]);
          }}
        >
          {t("pageNext")}
        </Button>
      </div>

      <AuditLogDetailDialog
        entry={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
