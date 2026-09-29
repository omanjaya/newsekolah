"use client";

import { formatCurrency, formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  RowActionsMenu,
  domainIcons,
  useToast,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, HandCoins, Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type LibraryViolation,
  type LibraryViolationKind,
  type LibraryViolationStatus,
  useLibraryViolationsQuery,
  useMemberViolationsQuery,
} from "../violations-api";

import { LibraryWorkspaceNav } from "./library-workspace-nav";
import { ViolationRecordDialog } from "./violation-record-dialog";
import { ViolationSettleDialog } from "./violation-settle-dialog";

const STATUSES: LibraryViolationStatus[] = ["unpaid", "paid", "waived"];
const KINDS: LibraryViolationKind[] = ["late", "lost", "damaged", "other"];
const STATUS_VALUES = ["", ...STATUSES] as const;
const KIND_VALUES = ["", ...KINDS] as const;

export function ViolationsView({ memberUserId }: { memberUserId?: string }): ReactElement {
  const t = useTranslations("app.library.violations");
  const locale = useLocale() as Locale;
  const canRecord = useCan("manage_library_circulation");

  const toast = useToast();
  const [status, setStatus] = useUrlState<(typeof STATUS_VALUES)[number]>(
    "status",
    STATUS_VALUES,
    "",
  );
  const [kind, setKind] = useUrlState<(typeof KIND_VALUES)[number]>("kind", KIND_VALUES, "");
  const [recording, setRecording] = useState(false);
  const [settling, setSettling] = useState<{
    violation: LibraryViolation;
    status: "paid" | "waived";
  } | null>(null);

  const allViolations = useLibraryViolationsQuery({ status, kind }, !memberUserId);
  const memberViolations = useMemberViolationsQuery(memberUserId ?? "");
  const { data, isLoading } = memberUserId ? memberViolations : allViolations;
  const directory = useDirectoryQuery();
  const directoryMap = useLookup(directory.data?.data);

  const rawItems = data?.data ?? [];
  // The all-violations query already filters server-side; the member-scoped
  // endpoint (`/v1/library/members/{userId}/violations`) takes no query
  // params, so that view still filters its (small, single-member) result
  // client-side.
  const items = memberUserId
    ? rawItems.filter(
        (item) => (!status || item.status === status) && (!kind || item.kind === kind),
      )
    : rawItems;
  const isFiltered = status !== "" || kind !== "";

  const filters: DataTableFilterDef[] = [
    {
      id: "status",
      label: t("filters.status"),
      value: status,
      onChange: (value) => {
        setStatus(value as (typeof STATUS_VALUES)[number]);
      },
      options: STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
    },
    {
      id: "kind",
      label: t("filters.kind"),
      value: kind,
      onChange: (value) => {
        setKind(value as (typeof KIND_VALUES)[number]);
      },
      options: KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) })),
    },
  ];

  const columns = useMemo<ColumnDef<LibraryViolation>[]>(
    () => [
      {
        id: "member",
        header: t("columns.member"),
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={`/library/members/${row.original.member_user_id}`}
            className="font-medium text-accent hover:underline"
          >
            {directoryMap.get(row.original.member_user_id)?.name ?? t("unknownMember")}
          </Link>
        ),
      },
      {
        id: "kind",
        header: t("columns.kind"),
        enableSorting: false,
        cell: ({ row }) => t(`kinds.${row.original.kind}`),
      },
      {
        id: "penalty",
        header: t("columns.penalty"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{t(`penalties.${row.original.penalty}`)}</span>
            {row.original.penalty === "fine" && row.original.amount > 0 && (
              <span className="text-[12px] text-fg-muted">
                {formatCurrency(row.original.amount, "IDR", { locale })}
              </span>
            )}
            {row.original.penalty === "suspend" && row.original.suspend_days > 0 && (
              <span className="text-[12px] text-fg-muted">
                {t("suspendDaysValue", { days: row.original.suspend_days })}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "createdAt",
        header: t("columns.createdAt"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.created_at ? formatDate(row.original.created_at, { locale }) : "-",
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "unpaid" ? "neutral" : "accent"}>
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canRecord && row.original.status === "unpaid" ? (
            <ViolationRowActionsMenu
              memberName={directoryMap.get(row.original.member_user_id)?.name ?? t("unknownMember")}
              onMarkPaid={() => {
                setSettling({ violation: row.original, status: "paid" });
              }}
              onWaive={() => {
                setSettling({ violation: row.original, status: "waived" });
              }}
            />
          ) : null,
      },
    ],
    [t, locale, directoryMap, canRecord],
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
      <LibraryWorkspaceNav area="circulation" />

      {memberUserId && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-surface p-3 text-[13px]">
          <span>
            {t("memberScope", { name: directoryMap.get(memberUserId)?.name ?? memberUserId })}
          </span>
          <Button asChild variant="secondary" size="sm">
            <Link href="/library/violations">{t("allMembers")}</Link>
          </Button>
        </div>
      )}

      <DataTable
        stateKey="features/library/components/violations-view:1"
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
        filters={filters}
        filtersLabels={{
          reset: t("filters.clear"),
          removeFilter: (label) => t("filters.removeFilter", { label }),
        }}
        isLoading={isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.violation aria-hidden="true" />}
            title={isFiltered ? t("noMatchTitle") : t("emptyTitle")}
            description={isFiltered ? t("noMatchBody") : t("emptyBody")}
          />
        }
      />

      <ViolationRecordDialog
        key={memberUserId ?? "all"}
        initialMemberUserId={memberUserId}
        open={recording}
        onOpenChange={setRecording}
        onRecorded={() => {
          setRecording(false);
        }}
      />

      <ViolationSettleDialog
        violation={settling?.violation ?? null}
        status={settling?.status ?? null}
        memberName={
          settling
            ? (directoryMap.get(settling.violation.member_user_id)?.name ?? t("unknownMember"))
            : ""
        }
        onOpenChange={(open) => {
          if (!open) setSettling(null);
        }}
        onSettled={(status) => {
          toast.success(status === "paid" ? t("settle.settledPaid") : t("settle.settledWaived"));
          setSettling(null);
        }}
      />
    </div>
  );
}

/**
 * A violation row's two settlement outcomes collapsed behind one "..."
 * button instead of a bare "Selesaikan" that then asked again which
 * outcome -- one tap fewer, and the row never grows a second button
 * (docs/07-ui-ux.md: secondary actions in a labelled "..." menu).
 */
function ViolationRowActionsMenu({
  memberName,
  onMarkPaid,
  onWaive,
}: {
  memberName: string;
  onMarkPaid: () => void;
  onWaive: () => void;
}): ReactElement {
  const t = useTranslations("app.library.violations.settle");
  const tRow = useTranslations("app.library.violations");

  return (
    <RowActionsMenu
      ariaLabel={tRow("rowActions", { member: memberName })}
      items={[
        {
          label: t("markPaid"),
          icon: <HandCoins className="size-4" aria-hidden="true" />,
          onClick: onMarkPaid,
        },
        {
          label: t("waive"),
          icon: <BadgeCheck className="size-4" aria-hidden="true" />,
          onClick: onWaive,
        },
      ]}
    />
  );
}
