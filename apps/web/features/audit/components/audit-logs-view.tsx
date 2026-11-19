"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime, formatRelative } from "@newsekolah/i18n";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilteredEmptyState,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { History, X } from "lucide-react";
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
import { SettingsPage } from "../../settings/components/settings-page";
import { type AuditLogEntry, useAuditLogsQuery } from "../api";

import { AuditLogDetailSheet } from "./audit-log-detail-dialog";
import { AUDIT_ENTITY_TYPES, shortId, useAuditLabels } from "./use-audit-labels";

const PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The audit trail: one dense, filterable table, newest first. Actions and
 * entities read as words, the time is relative within a day (the exact
 * time on hover), and a row opens the change in a side sheet. Filters live
 * in the URL; paging follows the API's cursor.
 */
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

  const { data, isLoading, isError, error, refetch, isRefetching } = useAuditLogsQuery({
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

  const filtering = actorUserId !== "" || entityType !== "" || from !== "" || to !== "";

  function clearFilters() {
    setActorUserId("");
    setEntityType("");
    setFrom("");
    setTo("");
    resetPaging();
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
      options: AUDIT_ENTITY_TYPES.map((type) => ({ value: type, label: labels.entityType(type) }))
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label)),
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

  function actorName(id: string | undefined): string | undefined {
    if (!id) return undefined;
    return actorMap.get(id)?.name ?? shortId(id);
  }

  const columns = useMemo<ColumnDef<AuditLogEntry>[]>(
    () => [
      {
        accessorKey: "action",
        header: t("columns.action"),
        enableSorting: false,
        meta: { card: "title" },
        cell: ({ row }) => (
          <span className="font-medium text-fg">{labels.action(row.original.action)}</span>
        ),
      },
      {
        id: "actor",
        header: t("columns.actor"),
        enableSorting: false,
        meta: { card: "subtitle", skeleton: "lines" },
        cell: ({ row }) => {
          const entry = row.original;
          const name = actorName(entry.actor_user_id);
          return (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              {name ? (
                <span className="text-fg">{name}</span>
              ) : (
                <Badge size="sm">{t("system")}</Badge>
              )}
              {entry.acting_as_user_id && (
                <Badge size="sm" tone="warning">
                  {t("actingAs", { name: actorName(entry.acting_as_user_id) ?? "" })}
                </Badge>
              )}
            </span>
          );
        },
      },
      {
        id: "entity",
        header: t("columns.entity"),
        enableSorting: false,
        cell: ({ row }) => {
          const { entity_type: type, entity_id: id } = row.original;
          // A user entity resolves to a name through the same directory as
          // the actor column; anything else shows a short id tail, and the
          // full id stays in the detail sheet.
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
        accessorKey: "occurred_at",
        header: t("columns.when"),
        enableSorting: false,
        meta: { card: "meta" },
        cell: ({ row }) => {
          const at = row.original.occurred_at;
          const exact = formatDateTime(at, { locale, timeZone });
          const recent = Date.now() - new Date(at).getTime() < DAY_MS;
          return (
            <time dateTime={at} title={exact} className="whitespace-nowrap text-fg-muted">
              {recent ? formatRelative(at, { locale, timeZone }) : exact}
            </time>
          );
        },
      },
      {
        accessorKey: "ip",
        header: t("columns.ip"),
        enableSorting: false,
        meta: { card: "hidden" },
        cell: ({ row }) => (
          <span className="font-mono text-fg-muted">{row.original.ip ?? "-"}</span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actorName closes over actorMap
    [t, locale, timeZone, actorMap, labels],
  );

  const items = data?.data ?? [];
  // A failed read with no error object still counts as failed.
  const loadError: unknown = isError && !data ? error : undefined;
  const isImpersonating = Boolean(me?.impersonated_by);

  return (
    <SettingsPage navKey="settings-audit" variant="fit" description={t("description")}>
      {isImpersonating && (
        <Alert
          variant="info"
          title={t("impersonationNote")}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/profile">{t("impersonationLink")}</Link>
            </Button>
          }
        />
      )}
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/audit/components/audit-logs-view:2"
          mode="cursor"
          fillHeight
          density="compact"
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
          toolbarActions={
            <div className="flex items-center gap-1">
              <DirectoryPicker
                value={actorUserId}
                onValueChange={(id) => {
                  setActorUserId(id);
                  resetPaging();
                }}
                labels={actorLabels}
                // A filter among the filter pills, so it takes their shape
                // and their compact height where the pointer is fine.
                className="w-full sm:w-56 sm:rounded-full md:pointer-fine:h-8 md:pointer-fine:text-body-sm"
              />
              {actorUserId !== "" && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<X />}
                  onClick={() => {
                    setActorUserId("");
                    resetPaging();
                  }}
                >
                  <span className="sr-only">{t("filters.clearActor")}</span>
                </Button>
              )}
            </div>
          }
          isLoading={isLoading}
          // A failed read keeps the filter bar, so a bad filter can still be changed.
          error={isError && !data ? (loadError ?? true) : undefined}
          onRetry={() => void refetch()}
          retrying={isRefetching}
          getRowId={(entry) => entry.id}
          onRowActivate={setSelected}
          cursorPagination={{
            hasPrevious: cursors.length > 1,
            hasNext: Boolean(data?.next_cursor),
            onPrevious: () => {
              setCursors((p) => p.slice(0, -1));
            },
            onNext: () => {
              const next = data?.next_cursor;
              if (next) setCursors((p) => [...p, next]);
            },
            page: cursors.length,
            pageSize: PAGE_SIZE,
          }}
          emptyState={
            filtering ? (
              <FilteredEmptyState onReset={clearFilters} />
            ) : (
              <EmptyState
                icon={<History aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
              />
            )
          }
        />
      </div>

      <AuditLogDetailSheet
        entry={selected}
        actorName={actorName}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </SettingsPage>
  );
}
