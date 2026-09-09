"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Badge, Button, DataTable, EmptyState, Input, PageHeader, Select } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { History } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import { type AuditLogEntry, useAuditLogsQuery } from "../api";

import { AuditLogDetailDialog } from "./audit-log-detail-dialog";

const SYSTEM_ACTOR = "system";

export function AuditLogsView(): ReactElement {
  const t = useTranslations("app.audit");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;

  const [actorUserId, setActorUserId] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cursors, setCursors] = useState<string[]>([""]);
  const cursor = cursors[cursors.length - 1] ?? "";
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const directory = useDirectoryQuery();
  const actorMap = useLookup(directory.data?.data);

  const { data, isLoading } = useAuditLogsQuery({
    actorUserId: actorUserId || undefined,
    entityType: entityType || undefined,
    from: from || undefined,
    to: to || undefined,
    cursor: cursor || undefined,
  });

  function resetPaging() {
    setCursors([""]);
  }

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
      },
      {
        id: "entity",
        header: t("columns.entity"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-fg-muted">
            {row.original.entity_type}
            {row.original.entity_id ? ` · ${row.original.entity_id}` : ""}
          </span>
        ),
      },
      {
        accessorKey: "ip",
        header: t("columns.ip"),
        enableSorting: false,
        cell: ({ row }) => row.original.ip ?? "-",
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actorName closes over actorMap, included via directory.data
    [t, locale, timeZone, directory.data],
  );

  const items = data?.data ?? [];
  const isImpersonating = Boolean(me?.impersonated_by);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      {isImpersonating && (
        <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface p-4 text-[13px]">
          <span className="text-fg">{t("impersonationNote")}</span>
          <Button asChild variant="secondary" size="sm">
            <Link href="/profile">{t("impersonationLink")}</Link>
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("filters.actor")}</span>
          <Select
            options={[
              { value: "all", label: t("filters.actorAll") },
              ...(directory.data?.data ?? []).map((user) => ({
                value: user.id,
                label: user.name,
              })),
            ]}
            value={actorUserId || "all"}
            onValueChange={(value) => {
              setActorUserId(value === "all" ? "" : value);
              resetPaging();
            }}
            aria-label={t("filters.actor")}
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("filters.entityType")}</span>
          <Input
            value={entityType}
            placeholder={t("filters.entityTypePlaceholder")}
            onChange={(e) => {
              setEntityType(e.target.value);
              resetPaging();
            }}
            className="w-44"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("filters.from")}</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetPaging();
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("filters.to")}</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetPaging();
            }}
          />
        </label>
        {(actorUserId || entityType || from || to) && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setActorUserId("");
              setEntityType("");
              setFrom("");
              setTo("");
              resetPaging();
            }}
          >
            {t("filters.reset")}
          </Button>
        )}
      </div>

      <DataTable
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
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
