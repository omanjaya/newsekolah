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
  Select,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, HandCoins, Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type LibraryViolation,
  type LibraryViolationKind,
  type LibraryViolationStatus,
  useLibraryViolationsQuery,
} from "../violations-api";

import { ViolationRecordDialog } from "./violation-record-dialog";
import { ViolationSettleDialog } from "./violation-settle-dialog";

const STATUSES: LibraryViolationStatus[] = ["unpaid", "paid", "waived"];
const KINDS: LibraryViolationKind[] = ["late", "lost", "damaged", "other"];

export function ViolationsView(): ReactElement {
  const t = useTranslations("app.library.violations");
  const locale = useLocale() as Locale;
  const canRecord = useCan("manage_library_circulation");

  const toast = useToast();
  const [status, setStatus] = useState<LibraryViolationStatus | "">("");
  const [kind, setKind] = useState<LibraryViolationKind | "">("");
  const [recording, setRecording] = useState(false);
  const [settling, setSettling] = useState<{
    violation: LibraryViolation;
    status: "paid" | "waived";
  } | null>(null);

  const { data, isLoading } = useLibraryViolationsQuery({ status, kind });
  const directory = useDirectoryQuery();
  const directoryMap = useLookup(directory.data?.data);

  const items = data?.data ?? [];
  const isFiltered = status !== "" || kind !== "";

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

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("filters.status")}</span>
          <Select
            options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
            value={status}
            onValueChange={(v) => {
              setStatus(v as LibraryViolationStatus);
            }}
            placeholder={t("filters.statusAll")}
            className="w-44"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("filters.kind")}</span>
          <Select
            options={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
            value={kind}
            onValueChange={(v) => {
              setKind(v as LibraryViolationKind);
            }}
            placeholder={t("filters.kindAll")}
            className="w-44"
          />
        </label>
        {isFiltered && (
          <button
            type="button"
            className="text-[13px] text-accent underline underline-offset-2"
            onClick={() => {
              setStatus("");
              setKind("");
            }}
          >
            {t("filters.clear")}
          </button>
        )}
      </div>

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
