"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatCurrency, formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import { printMemberCard, useMemberLoanHistoryQuery, useMemberReservationsQuery } from "../api";
import {
  printLibraryClearanceLetter,
  useClearLibraryMemberMutation,
  useLibraryMemberQuery,
  useLibraryMemberTypesQuery,
} from "../members-api";
import { useMemberViolationsQuery } from "../violations-api";

import { LibraryTitleName } from "./library-title-name";
import { LoanRenewalsDialog } from "./loan-renewals-dialog";
import { MarkLostDialog } from "./mark-lost-dialog";
import { MemberLoanRow, loanRowSortKey } from "./member-loan-row";
import { MemberProfileForm } from "./member-profile-form";
import { MemberStatusMenu } from "./member-status-menu";

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function MemberDetailView({ userId }: { userId: string }): ReactElement {
  const t = useTranslations("app.library.memberDetail");
  const tHistory = useTranslations("app.library.memberHistory");
  const tReserve = useTranslations("app.library.me.reserve");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_library_members");
  const today = todayIso();

  const member = useLibraryMemberQuery(userId);
  const memberTypes = useLibraryMemberTypesQuery();
  const memberTypeMap = useLookup(memberTypes.data?.data);
  const directory = useDirectoryQuery();
  const directoryMap = useLookup(directory.data?.data);
  const loans = useMemberLoanHistoryQuery(userId);
  const reservations = useMemberReservationsQuery(userId);
  const violations = useMemberViolationsQuery(userId);
  const clearMember = useClearLibraryMemberMutation();

  const [editing, setEditing] = useState(false);
  const [markingLost, setMarkingLost] = useState<string | null>(null);
  const [viewingRenewals, setViewingRenewals] = useState<string | null>(null);
  const [clearanceError, setClearanceError] = useState("");

  const activeLoans = useMemo(
    () =>
      (loans.data?.data ?? [])
        .filter((loan) => loan.status === "active")
        .sort((a, b) => loanRowSortKey(a, today) - loanRowSortKey(b, today)),
    [loans.data, today],
  );
  const pastLoans = useMemo(
    () => (loans.data?.data ?? []).filter((loan) => loan.status !== "active"),
    [loans.data],
  );
  const unpaidViolations = (violations.data?.data ?? []).filter((v) => v.status === "unpaid");
  const unpaidTotal = unpaidViolations.reduce((sum, v) => sum + v.amount, 0);
  const hasActiveLoan = activeLoans.length > 0;
  const userName = directoryMap.get(userId)?.name;

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
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <Button asChild variant="secondary" size="sm" className="self-start">
        <Link href="/library/members">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("backToList")}
        </Link>
      </Button>

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
              icon={<Printer />}
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

      {unpaidViolations.length > 0 && (
        <div className="flex flex-col gap-2 rounded-sm border border-status-late/40 bg-status-late/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-fg">{tHistory("fines.title")}</h2>
            <Badge variant="neutral">{formatCurrency(unpaidTotal, "IDR", { locale })}</Badge>
          </div>
          <ul className="flex flex-col gap-1">
            {unpaidViolations.map((violation) => (
              <li key={violation.id} className="flex items-center justify-between text-[13px]">
                <span className="text-fg">{tHistory(`fines.kind.${violation.kind}`)}</span>
                <span className="tabular-nums text-status-late">
                  {formatCurrency(violation.amount, "IDR", { locale })}
                </span>
              </li>
            ))}
          </ul>
          <Button asChild variant="secondary" size="sm" className="self-start">
            <Link href="/library/violations">{tHistory("fines.manage")}</Link>
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium text-fg">{tHistory("currentLoans")}</h2>
        {loans.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : activeLoans.length === 0 ? (
          <EmptyState
            icon={<domainIcons.library aria-hidden="true" />}
            title={tHistory("emptyTitle")}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {activeLoans.map((loan) => (
              <MemberLoanRow
                key={loan.id}
                loan={loan}
                today={today}
                locale={locale}
                canManage={canManage}
                onViewRenewals={() => {
                  setViewingRenewals(loan.id);
                }}
                onMarkLost={() => {
                  setMarkingLost(loan.id);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {pastLoans.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[16px] font-medium text-fg">{tHistory("pastLoans")}</h2>
          <ul className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface">
            {pastLoans.map((loan) => (
              <li
                key={loan.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]"
              >
                <span className="min-w-0 truncate text-fg">
                  <LibraryTitleName titleId={loan.title_id} />
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-fg-muted">
                    {loan.returned_at ? formatDate(loan.returned_at, { locale }) : "-"}
                  </span>
                  <Badge variant={loan.status === "lost" ? "neutral" : "accent"}>
                    {tHistory(`status.${loan.status}`)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

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
