"use client";

import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  domainIcons,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type LibraryVisit,
  useLibraryVisitSummaryQuery,
  useLibraryVisitsQuery,
} from "../visits-api";

import { VisitRecordDialog } from "./visit-record-dialog";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export function VisitsView(): ReactElement {
  const t = useTranslations("app.library.visits");
  const locale = useLocale() as Locale;
  const canRecord = useCan("manage_library_circulation");

  const [from, setFrom] = useState(firstOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [recording, setRecording] = useState(false);

  const { data, isLoading } = useLibraryVisitsQuery(`${from}T00:00:00Z`, `${to}T23:59:59Z`);
  const summary = useLibraryVisitSummaryQuery();
  const directory = useDirectoryQuery();
  const directoryMap = useLookup(directory.data?.data);

  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryVisit>[]>(
    () => [
      {
        id: "who",
        header: t("columns.who"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.member_user_id ? (
            <Link
              href={`/library/members/${row.original.member_user_id}`}
              className="inline-flex min-h-11 items-center font-medium text-accent hover:underline md:min-h-0"
            >
              {directoryMap.get(row.original.member_user_id)?.name ?? t("unknownMember")}
            </Link>
          ) : (
            (row.original.visitor_name ?? "-")
          ),
      },
      {
        id: "kind",
        header: t("columns.kind"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{t(`kinds.${row.original.kind}`)}</span>
            {row.original.kind === "group" && row.original.group_size > 1 && (
              <span className="text-[12px] text-fg-muted">
                {t("groupSizeValue", { count: row.original.group_size })}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "purpose",
        header: t("columns.purpose"),
        enableSorting: false,
        cell: ({ row }) => row.original.purpose ?? "-",
      },
      {
        id: "source",
        header: t("columns.source"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.source === "manual" ? "neutral" : "accent"}>
            {t(`sources.${row.original.source}`)}
          </Badge>
        ),
      },
      {
        id: "visitedAt",
        header: t("columns.visitedAt"),
        enableSorting: false,
        cell: ({ row }) => formatDateTime(row.original.visited_at, { locale }),
      },
    ],
    [t, locale, directoryMap],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canRecord && (
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                setRecording(true);
              }}
            >
              {t("record")}
            </Button>
          )
        }
      />

      <dl className="flex flex-wrap gap-6 rounded-sm border border-border bg-surface p-4 text-[13px]">
        <div className="flex flex-col gap-1">
          <dt className="text-fg-muted">{t("summary.totalVisits")}</dt>
          <dd className="text-[20px] font-medium tabular-nums text-fg">
            {summary.data?.total_visits ?? "-"}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-fg-muted">{t("summary.uniqueMembers")}</dt>
          <dd className="text-[20px] font-medium tabular-nums text-fg">
            {summary.data?.unique_members ?? "-"}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-fg-muted">{t("summary.totalPeople")}</dt>
          <dd className="text-[20px] font-medium tabular-nums text-fg">
            {summary.data?.total_people ?? "-"}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("fromLabel")}</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("toLabel")}</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
            }}
          />
        </label>
      </div>

      <DataTable
        stateKey="features/library/components/visits-view:1"
        mode="local"
        searchable={false}
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 200 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.users aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <VisitRecordDialog
        open={recording}
        onOpenChange={setRecording}
        onRecorded={() => {
          setRecording(false);
        }}
      />
    </div>
  );
}
