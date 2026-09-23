"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatCurrency, formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type LibraryLoan,
  printMemberCard,
  useMemberLoanHistoryQuery,
  useMemberReservationsQuery,
} from "../api";
import {
  printLibraryClearanceLetter,
  useClearLibraryMemberMutation,
  useLibraryMemberQuery,
  useLibraryMemberTypesQuery,
} from "../members-api";

import { LibraryTitleName } from "./library-title-name";
import { LoanRenewalsDialog } from "./loan-renewals-dialog";
import { MarkLostDialog } from "./mark-lost-dialog";
import { MemberProfileForm } from "./member-profile-form";
import { MemberStatusMenu } from "./member-status-menu";

export function MemberDetailView({ userId }: { userId: string }): ReactElement {
  const t = useTranslations("app.library.memberDetail");
  const tHistory = useTranslations("app.library.memberHistory");
  const tReserve = useTranslations("app.library.me.reserve");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_library_members");

  const member = useLibraryMemberQuery(userId);
  const memberTypes = useLibraryMemberTypesQuery();
  const memberTypeMap = useLookup(memberTypes.data?.data);
  const directory = useDirectoryQuery();
  const directoryMap = useLookup(directory.data?.data);
  const loans = useMemberLoanHistoryQuery(userId);
  const reservations = useMemberReservationsQuery(userId);
  const clearMember = useClearLibraryMemberMutation();

  const [editing, setEditing] = useState(false);
  const [markingLost, setMarkingLost] = useState<string | null>(null);
  const [viewingRenewals, setViewingRenewals] = useState<string | null>(null);
  const [clearanceError, setClearanceError] = useState("");

  const items = loans.data?.data ?? [];
  const hasActiveLoan = items.some((loan) => loan.status === "active");
  const userName = directoryMap.get(userId)?.name;

  const columns = useMemo<ColumnDef<LibraryLoan>[]>(
    () => [
      {
        accessorKey: "title_id",
        header: tHistory("columns.title"),
        enableSorting: false,
        cell: ({ row }) => <LibraryTitleName titleId={row.original.title_id} />,
      },
      {
        accessorKey: "borrowed_at",
        header: tHistory("columns.borrowedAt"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.borrowed_at, { locale }),
      },
      {
        accessorKey: "due_on",
        header: tHistory("columns.dueOn"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.due_on, { locale }),
      },
      {
        accessorKey: "status",
        header: tHistory("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "accent" : "neutral"}>
            {tHistory(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        accessorKey: "fine_amount",
        header: tHistory("columns.fine"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.fine_amount > 0
            ? formatCurrency(row.original.fine_amount, "IDR", { locale })
            : "-",
      },
      {
        id: "actions",
        header: tHistory("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            {row.original.renewal_count > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setViewingRenewals(row.original.id);
                }}
              >
                {tHistory("renewals.viewHistory")}
              </Button>
            )}
            {row.original.status === "active" && (
              <Button
                size="sm"
                variant="ghost"
                className="text-status-absent"
                onClick={() => {
                  setMarkingLost(row.original.id);
                }}
              >
                {tHistory("markLost")}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [tHistory, locale],
  );

  if (member.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!member.data) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("notFoundTitle")}
          description={t("notFoundBody")}
        />
      </div>
    );
  }

  const data = member.data;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={userName ?? data.member_no}
        actions={
          <div className="flex gap-2">
            {canManage && (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(true);
                }}
              >
                {t("edit")}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                void printMemberCard(userId);
              }}
            >
              {tHistory("printCard")}
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4 md:flex-row md:flex-wrap md:items-center md:gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-fg-muted">{t("memberNo")}</span>
          <span className="text-[14px] text-fg">{data.member_no}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-fg-muted">{t("memberType")}</span>
          <span className="text-[14px] text-fg">
            {memberTypeMap.get(data.member_type_id)?.name ?? "-"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-fg-muted">{t("validUntil")}</span>
          <span className="text-[14px] text-fg">
            {data.valid_until ? formatDate(data.valid_until, { locale }) : "-"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-fg-muted">{t("statusLabel")}</span>
          {canManage ? (
            <MemberStatusMenu userId={userId} status={data.status} />
          ) : (
            <Badge variant={data.status === "active" ? "accent" : "neutral"}>
              {t(`status.${data.status}`)}
            </Badge>
          )}
        </div>
        {canManage && data.status !== "cleared" && (
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-fg-muted">{t("clearance")}</span>
            <Button
              size="sm"
              variant="secondary"
              loading={clearMember.isPending}
              onClick={() => {
                setClearanceError("");
                clearMember.mutate(userId, {
                  onSuccess: () => {
                    toast.success(t("cleared"));
                  },
                  onError: (error) => {
                    setClearanceError(
                      error instanceof ApiError
                        ? apiErrorMessage(error.code)
                        : apiErrorMessage("UNKNOWN"),
                    );
                  },
                });
              }}
            >
              {t("grantClearance")}
            </Button>
          </div>
        )}
        {data.status === "cleared" && (
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-fg-muted">{t("clearance")}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void printLibraryClearanceLetter(userId);
              }}
            >
              {t("printClearanceLetter")}
            </Button>
          </div>
        )}
      </div>
      {clearanceError && <p className="text-[13px] text-status-absent">{clearanceError}</p>}
      {hasActiveLoan && data.status !== "cleared" && (
        <p className="text-[13px] text-fg-muted">{t("clearanceBlockedByLoan")}</p>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium text-fg">{tHistory("title")}</h2>
        <DataTable
          stateKey="features/library/components/member-detail-view:1"
          mode="local"
          data={items}
          columns={columns}
          rowCount={items.length}
          pagination={{ pageIndex: 0, pageSize: 50 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter=""
          isLoading={loans.isLoading}
          getRowId={(item) => item.id}
          emptyState={
            <EmptyState
              icon={<domainIcons.library aria-hidden="true" />}
              title={tHistory("emptyTitle")}
            />
          }
        />
      </div>

      {(reservations.data?.data.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-fg">{tHistory("reservationsHeading")}</h2>
          <ul className="flex flex-col gap-1 text-[13px]">
            {reservations.data?.data.map((r) => (
              <li key={r.id} className="rounded-sm border border-border bg-surface p-2">
                <LibraryTitleName titleId={r.title_id} />
                {" - "}
                {r.status === "waiting" && r.position
                  ? tReserve("queuePosition", { position: r.position })
                  : tReserve(`status.${r.status}`)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={t("edit")}>
          {editing && (
            <MemberProfileForm
              member={data}
              onDone={() => {
                setEditing(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <MarkLostDialog
        loanId={markingLost}
        onOpenChange={(open) => {
          if (!open) setMarkingLost(null);
        }}
        onDone={() => {
          setMarkingLost(null);
        }}
      />

      <LoanRenewalsDialog
        loanId={viewingRenewals}
        onOpenChange={(open) => {
          if (!open) setViewingRenewals(null);
        }}
      />
    </div>
  );
}
