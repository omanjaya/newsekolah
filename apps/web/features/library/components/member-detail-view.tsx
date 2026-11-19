"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatCurrency } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataList,
  DataListItem,
  Dialog,
  DialogContent,
  EmptyState,
  SkeletonDetail,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  domainIcons,
  useToast,
  type PageHeaderAction,
} from "@newsekolah/ui";
import { BadgeCheck, FileText, Pencil, Printer, Scale } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { RecordNotFoundPage } from "../../../components/record-not-found";
import { isNotFoundError } from "../../../lib/api/not-found";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { useLookup } from "../../reference/api";
import { useDirectoryNames } from "../../reference/directory-names";
import { printMemberCard, useMemberLoanHistoryQuery, useMemberReservationsQuery } from "../api";
import { formatShortDate } from "../lib/short-date";
import { MEMBER_STATUS_TONE, toneOf } from "../lib/status-tones";
import {
  printLibraryClearanceLetter,
  useClearLibraryMemberMutation,
  useLibraryMemberQuery,
  useLibraryMemberTypesQuery,
} from "../members-api";
import { useTenantTimeZone } from "../use-tenant-timezone";
import { useMemberViolationsQuery } from "../violations-api";

import { LoanRenewalsDialog } from "./loan-renewals-dialog";
import { MarkLostDialog } from "./mark-lost-dialog";
import { MemberFines, MemberPastLoans, MemberReservations } from "./member-detail-sections";
import { MemberLoanRow, loanRowSortKey } from "./member-loan-row";
import { MemberProfileForm } from "./member-profile-form";
import { MemberStatusMenu } from "./member-status-menu";

const TABS = ["loans", "history", "fines", "reservations"] as const;
type MemberTab = (typeof TABS)[number];

/**
 * A library member's own page (docs/07-ui-ux.md "Detail"): who they are
 * (avatar, number, type, validity and status) under a breadcrumb back to
 * the member list, then their current loans, history, unpaid fines and
 * holds as tabs. Editing leads the header; printing the card, the fines
 * page and library clearance sit beside it. Changing the status or
 * granting clearance asks first, naming the member and the effect.
 */
export function MemberDetailView({ userId }: { userId: string }): ReactElement {
  const t = useTranslations("app.library.memberDetail");
  const tHistory = useTranslations("app.library.memberHistory");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_library_members");
  const canCirculate = useCan("manage_library_circulation");
  const today = todayInZone(useTenantTimeZone());

  const member = useLibraryMemberQuery(userId);
  const memberTypes = useLibraryMemberTypesQuery();
  const memberTypeMap = useLookup(memberTypes.data?.data);
  const directoryMap = useDirectoryNames([userId]);
  const loans = useMemberLoanHistoryQuery(userId);
  const reservations = useMemberReservationsQuery(userId);
  const violations = useMemberViolationsQuery(userId);
  const clearMember = useClearLibraryMemberMutation();

  const [tab, setTab] = useUrlState<MemberTab>("tab", TABS, "loans");
  const [editing, setEditing] = useState(false);
  const [confirmingClearance, setConfirmingClearance] = useState(false);
  const [markingLost, setMarkingLost] = useState<string | null>(null);
  const [viewingRenewals, setViewingRenewals] = useState<string | null>(null);

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
  const holds = reservations.data?.data ?? [];
  const userName = directoryMap.get(userId)?.name;

  if (member.isLoading) {
    return (
      <AppPage header={false} nav={false}>
        <SkeletonDetail />
      </AppPage>
    );
  }
  // An unknown or malformed id is a missing member, not a failure to retry.
  if (!member.data && (!member.isError || isNotFoundError(member.error))) {
    return (
      <RecordNotFoundPage
        title={t("notFoundTitle")}
        description={t("notFoundBody")}
        backHref="/library/members"
        backLabel={t("backToList")}
      />
    );
  }
  if (!member.data) {
    return (
      <AppPage title={t("loadErrorTitle")} nav={false}>
        <QueryError retry={() => member.refetch()} error={member.error} />
      </AppPage>
    );
  }

  const data = member.data;
  const name = userName ?? data.member_no;
  const typeName = memberTypeMap.get(data.member_type_id)?.name;
  const clearanceBlocked = activeLoans.length > 0 || unpaidViolations.length > 0;

  const secondaryActions: PageHeaderAction[] = [
    {
      label: tHistory("printCard"),
      icon: <Printer />,
      onSelect: () => {
        void printMemberCard(userId);
      },
    },
    ...(canCirculate
      ? [
          {
            label: t("finesPage"),
            icon: <Scale />,
            href: `/library/violations?member=${encodeURIComponent(userId)}`,
          },
        ]
      : []),
    ...(canManage && data.status !== "cleared"
      ? [
          {
            label: t("grantClearance"),
            icon: <BadgeCheck />,
            disabled: clearanceBlocked || clearMember.isPending,
            onSelect: () => {
              setConfirmingClearance(true);
            },
          },
        ]
      : []),
    ...(data.status === "cleared"
      ? [
          {
            label: t("printClearanceLetter"),
            icon: <FileText />,
            onSelect: () => {
              void printLibraryClearanceLetter(userId);
            },
          },
        ]
      : []),
  ];

  return (
    <AppPage
      title={name}
      leading={<Avatar name={name} size={64} decorative />}
      nav={false}
      primaryAction={
        canManage ? (
          <Button
            icon={<Pencil />}
            onClick={() => {
              setEditing(true);
            }}
          >
            {t("edit")}
          </Button>
        ) : undefined
      }
      secondaryActions={secondaryActions}
    >
      {/* The avatar sits beside the title; the card is the three short
          facts, two to a row on a phone, and the status. */}
      <Card padding="md">
        <DataList layout="stacked" columns={3} className="grid-cols-2">
          <DataListItem label={t("memberNo")}>
            <span className="tabular-nums">{data.member_no}</span>
          </DataListItem>
          <DataListItem label={t("memberType")}>{typeName}</DataListItem>
          <DataListItem label={t("validUntil")}>
            {data.valid_until ? formatShortDate(data.valid_until, locale, { today }) : undefined}
          </DataListItem>
        </DataList>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-label text-fg-muted">{t("statusLabel")}</span>
          {canManage ? (
            <MemberStatusMenu userId={userId} status={data.status} memberName={name} />
          ) : (
            <Badge tone={toneOf(MEMBER_STATUS_TONE, data.status)}>
              {t(`status.${data.status}`)}
            </Badge>
          )}
          {canManage && data.status !== "cleared" && clearanceBlocked && (
            <span className="text-caption text-fg-muted">{t("clearanceBlockedByLoan")}</span>
          )}
        </div>
      </Card>

      {unpaidViolations.length > 0 && (
        <Alert
          tone="warning"
          title={t("unpaidAlert", { amount: formatCurrency(unpaidTotal, "IDR", { locale }) })}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setTab("fines");
              }}
            >
              {t("viewFines")}
            </Button>
          }
        />
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as MemberTab);
        }}
      >
        <TabsList variant="underline" aria-label={t("tabsLabel")}>
          <TabsTrigger value="loans" count={activeLoans.length || undefined}>
            {t("tabs.loans")}
          </TabsTrigger>
          <TabsTrigger value="history" count={pastLoans.length || undefined}>
            {t("tabs.history")}
          </TabsTrigger>
          <TabsTrigger value="fines" count={unpaidViolations.length || undefined}>
            {t("tabs.fines")}
          </TabsTrigger>
          <TabsTrigger value="reservations" count={holds.length || undefined}>
            {t("tabs.reservations")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="loans">
          {loans.isError ? (
            <QueryError retry={() => loans.refetch()} error={loans.error} />
          ) : loans.isLoading ? (
            <SkeletonDetail />
          ) : activeLoans.length === 0 ? (
            <Card>
              <EmptyState
                icon={<domainIcons.library aria-hidden="true" />}
                title={tHistory("emptyTitle")}
              />
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
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
        </TabsContent>

        <TabsContent value="history">
          <MemberPastLoans loans={pastLoans} locale={locale} today={today} />
        </TabsContent>

        <TabsContent value="fines">
          <MemberFines
            violations={unpaidViolations}
            total={unpaidTotal}
            locale={locale}
            manageHref={
              canCirculate ? `/library/violations?member=${encodeURIComponent(userId)}` : undefined
            }
          />
        </TabsContent>

        <TabsContent value="reservations">
          <MemberReservations reservations={holds} />
        </TabsContent>
      </Tabs>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={t("edit")} size="md">
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

      <ConfirmDialog
        open={confirmingClearance}
        onOpenChange={setConfirmingClearance}
        title={t("confirmClearance.title")}
        description={t("confirmClearance.body", { name })}
        confirmLabel={t("grantClearance")}
        confirming={clearMember.isPending}
        onConfirm={() => {
          clearMember.mutate(userId, {
            onSuccess: () => {
              toast.success(t("cleared"));
            },
            onError: (error) => {
              toast.error(
                error instanceof ApiError
                  ? apiErrorMessage(error.code)
                  : apiErrorMessage("UNKNOWN"),
              );
            },
            onSettled: () => {
              setConfirmingClearance(false);
            },
          });
        }}
      />

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
    </AppPage>
  );
}
