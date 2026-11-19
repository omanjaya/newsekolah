"use client";

import { formatCurrency } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilteredEmptyState,
  RowActionsMenu,
  TextLink,
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

import { AppPage } from "../../../components/app-page";
import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryNames } from "../../reference/directory-names";
import { formatShortDate } from "../lib/short-date";
import { VIOLATION_STATUS_TONE, toneOf } from "../lib/status-tones";
import { useTenantTimeZone } from "../use-tenant-timezone";
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
/** Rows per page; the violations API pages by offset and reports no total. */
const VIOLATIONS_PAGE_SIZE = 50;

export function ViolationsView({ memberUserId }: { memberUserId?: string }): ReactElement {
  const t = useTranslations("app.library.violations");
  const locale = useLocale() as Locale;
  const timeZone = useTenantTimeZone();
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

  const paging = useOffsetPage(VIOLATIONS_PAGE_SIZE);
  const allViolations = useLibraryViolationsQuery(
    { status, kind, limit: paging.limit, offset: paging.offset },
    !memberUserId,
  );
  const memberViolations = useMemberViolationsQuery(memberUserId ?? "");
  const { data, isLoading, error, refetch, isRefetching } = memberUserId
    ? memberViolations
    : allViolations;

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
  const directoryMap = useDirectoryNames([
    memberUserId,
    ...items.map((item) => item.member_user_id),
  ]);
  const isFiltered = status !== "" || kind !== "";

  const filters: DataTableFilterDef[] = [
    {
      id: "status",
      label: t("filters.status"),
      value: status,
      onChange: (value) => {
        setStatus(value as (typeof STATUS_VALUES)[number]);
        paging.resetPage();
      },
      options: STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
    },
    {
      id: "kind",
      label: t("filters.kind"),
      value: kind,
      onChange: (value) => {
        setKind(value as (typeof KIND_VALUES)[number]);
        paging.resetPage();
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
        meta: { card: "title" },
        cell: ({ row }) => (
          <TextLink
            href={`/library/members/${row.original.member_user_id}`}
            className="font-semibold"
          >
            {directoryMap.get(row.original.member_user_id)?.name ?? t("unknownMember")}
          </TextLink>
        ),
      },
      {
        id: "kind",
        header: t("columns.kind"),
        enableSorting: false,
        meta: { card: "subtitle" },
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
              <span className="text-caption text-fg-muted">
                {formatCurrency(row.original.amount, "IDR", { locale })}
              </span>
            )}
            {row.original.penalty === "suspend" && row.original.suspend_days > 0 && (
              <span className="text-caption text-fg-muted">
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
          row.original.created_at
            ? formatShortDate(row.original.created_at, locale, { timeZone })
            : "-",
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <Badge tone={toneOf(VIOLATION_STATUS_TONE, row.original.status)}>
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
    [t, locale, timeZone, directoryMap, canRecord],
  );

  const recordButton = canRecord ? (
    <Button
      icon={<Plus />}
      onClick={() => {
        setRecording(true);
      }}
    >
      {t("record")}
    </Button>
  ) : undefined;

  return (
    <AppPage
      nav={<LibraryWorkspaceNav area="circulation" />}
      primaryAction={recordButton}
      primaryActionCompact={
        canRecord
          ? {
              icon: <Plus />,
              label: t("record"),
              onSelect: () => {
                setRecording(true);
              },
            }
          : undefined
      }
    >
      {memberUserId && (
        <Alert
          title={t("memberScope", { name: directoryMap.get(memberUserId)?.name ?? memberUserId })}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/library/violations">{t("allMembers")}</Link>
            </Button>
          }
        />
      )}

      <DataTable
        stateKey="features/library/components/violations-view:1"
        mode="cursor"
        searchable={false}
        data={items}
        columns={columns}
        rowCount={items.length}
        cursorPagination={
          memberUserId
            ? undefined
            : {
                hasPrevious: paging.hasPrevious,
                hasNext: paging.hasNextFor(items.length),
                onPrevious: paging.goPrevious,
                onNext: paging.goNext,
                page: paging.page,
                pageSize: paging.limit,
              }
        }
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        filters={filters}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        retrying={isRefetching}
        getRowId={(item) => item.id}
        emptyState={
          isFiltered ? (
            <FilteredEmptyState
              title={t("noMatchTitle")}
              description={t("noMatchBody")}
              onReset={() => {
                setStatus("");
                setKind("");
                paging.resetPage();
              }}
            />
          ) : (
            <EmptyState
              icon={<domainIcons.violation aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
              // The header already carries the primary Catat pelanggaran;
              // the empty list repeats it quietly, as a secondary.
              action={
                canRecord ? (
                  <Button
                    variant="secondary"
                    icon={<Plus />}
                    onClick={() => {
                      setRecording(true);
                    }}
                  >
                    {t("record")}
                  </Button>
                ) : undefined
              }
            />
          )
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
    </AppPage>
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
