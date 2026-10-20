"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Skeleton,
  domainIcons,
  Dialog,
  DialogContent,
} from "@newsekolah/ui";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { StudentRiskPanel } from "../../analytics/components/student-risk-panel";
import { todayInZone } from "../../attendance/api";
import { MonthlyAttendanceTable } from "../../attendance/components/monthly-attendance-table";
import { StudentCounselingHistory } from "../../discipline/components/student-counseling-history";
import { StudentDisciplinePanel } from "../../discipline/components/student-discipline-panel";
import { useMemberLoanHistoryQuery } from "../../library/api";
import { MemberLoanRow, loanRowSortKey } from "../../library/components/member-loan-row";
import { useLibraryMemberQuery, useLibraryMemberTypesQuery } from "../../library/members-api";
import { useMemberViolationsQuery } from "../../library/violations-api";
import { useMentorStudentSnapshotQuery } from "../../mentoring/api";
import {
  SnapshotAttendanceSection,
  SnapshotDisciplineSection,
  SnapshotGradesSection,
} from "../../mentoring/components/student-snapshot-sections";
import { useLeaveReviewQueueQuery } from "../../permits/api";
import { LeaveRequestDetail } from "../../permits/components/leave-request-detail";
import { useLookup } from "../../reference/api";
import { useUserQuery } from "../../school/api";

/*
 * One component per profile tab. Each reuses the panel or hook its own
 * feature already ships; none owns data logic of its own. Which tab a
 * reader sees is decided by `visibleStudentProfileTabs`, so a panel here
 * can assume its endpoint's permission.
 */

export function StudentOverviewTab({ studentId }: { studentId: string }): ReactElement {
  const canRisk = useCan("view_early_warning");
  const canSnapshot = useCan("view_mentoring");
  return (
    <div className="flex flex-col gap-6">
      {canRisk && <StudentRiskPanel studentId={studentId} />}
      {canSnapshot && <StudentSnapshotOverview studentId={studentId} />}
    </div>
  );
}

function StudentSnapshotOverview({ studentId }: { studentId: string }): ReactElement {
  const snapshot = useMentorStudentSnapshotQuery(studentId);
  if (snapshot.isError && !snapshot.data) return <QueryError retry={() => snapshot.refetch()} />;
  if (!snapshot.data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="flex flex-col gap-6">
      <SnapshotAttendanceSection snapshot={snapshot.data} />
      <SnapshotDisciplineSection snapshot={snapshot.data} />
    </div>
  );
}

export function StudentAttendanceTab({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.studentProfile.attendance");
  const { me } = useSession();
  const [month, setMonth] = useDateFilter(
    "month",
    todayInZone(me?.tenant.timezone).slice(0, 7),
    true,
  );
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("month")}</span>
        <Input
          type="month"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
          }}
          aria-label={t("month")}
          className="w-40"
        />
      </label>
      <MonthlyAttendanceTable studentId={studentId} month={month} />
    </div>
  );
}

export function StudentGradesTab({ studentId }: { studentId: string }): ReactElement {
  const snapshot = useMentorStudentSnapshotQuery(studentId);
  if (snapshot.isError && !snapshot.data) return <QueryError retry={() => snapshot.refetch()} />;
  if (!snapshot.data) return <Skeleton className="h-40 w-full" />;
  return <SnapshotGradesSection snapshot={snapshot.data} />;
}

export function StudentPermitsTab({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.studentProfile.permits");
  const tLeave = useTranslations("app.permits.leave");
  const locale = useLocale() as Locale;
  const queue = useLeaveReviewQueueQuery();
  const [openId, setOpenId] = useState<string | null>(null);
  const items = useMemo(
    () => (queue.data?.data ?? []).filter((item) => item.student_user_id === studentId),
    [queue.data, studentId],
  );

  if (queue.isError && !queue.data) return <QueryError retry={() => queue.refetch()} />;
  if (queue.isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
      <p className="text-[13px] text-fg-muted">{t("note")}</p>
      {items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.exitPermit aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.instance_id}>
              <button
                type="button"
                onClick={() => {
                  setOpenId(item.instance_id);
                }}
                className="flex w-full flex-col gap-1.5 rounded-sm border border-border bg-surface p-3 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">{tLeave(`categories.${item.category}`)}</Badge>
                  <span className="text-[13px] text-fg-muted">
                    {formatDate(item.starts_on, { locale })} -{" "}
                    {formatDate(item.ends_on, { locale })}
                  </span>
                </div>
                {item.reason && <span className="text-[13px] text-fg">{item.reason}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button asChild variant="secondary" size="sm" className="self-start">
        <Link href="/leave-requests">{t("openQueue")}</Link>
      </Button>
      <Dialog
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DialogContent title={t("detailTitle")} className="max-w-xl">
          {openId && <LeaveRequestDetail id={openId} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function StudentDisciplineTab({ studentId }: { studentId: string }): ReactElement {
  return <StudentDisciplinePanel studentId={studentId} showCounseling={false} />;
}

export function StudentCounselingTab({ studentId }: { studentId: string }): ReactElement {
  return <StudentCounselingHistory studentId={studentId} />;
}

export function StudentLibraryTab({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.library.memberDetail");
  const tHistory = useTranslations("app.library.memberHistory");
  const tProfile = useTranslations("app.studentProfile.library");
  const locale = useLocale() as Locale;
  const member = useLibraryMemberQuery(studentId);
  const memberTypes = useLibraryMemberTypesQuery();
  const memberTypeMap = useLookup(memberTypes.data?.data);
  const loans = useMemberLoanHistoryQuery(studentId);
  const violations = useMemberViolationsQuery(studentId);
  const today = businessNow().toLocaleDateString("en-CA");

  const activeLoans = useMemo(
    () =>
      (loans.data?.data ?? [])
        .filter((loan) => loan.status === "active")
        .sort((a, b) => loanRowSortKey(a, today) - loanRowSortKey(b, today)),
    [loans.data, today],
  );
  const unpaid = (violations.data?.data ?? []).filter((v) => v.status === "unpaid");

  if (member.isLoading) return <Skeleton className="h-32 w-full" />;
  if (!member.data) {
    return (
      <EmptyState
        icon={<domainIcons.library aria-hidden="true" />}
        title={t("notFoundTitle")}
        description={t("notFoundBody")}
      />
    );
  }
  const data = member.data;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-6 rounded-sm border border-border bg-surface p-4">
        <Field label={t("memberNo")}>{data.member_no}</Field>
        <Field label={t("memberType")}>{memberTypeMap.get(data.member_type_id)?.name ?? "-"}</Field>
        <Field label={t("validUntil")}>
          {data.valid_until ? formatDate(data.valid_until, { locale }) : "-"}
        </Field>
        <Field label={t("statusLabel")}>
          <Badge variant={data.status === "active" ? "accent" : "neutral"}>
            {t(`status.${data.status}`)}
          </Badge>
        </Field>
      </div>
      {unpaid.length > 0 && (
        <p className="text-[13px] text-status-late">
          {tHistory("fines.title")}: {unpaid.length}
        </p>
      )}
      <section className="flex flex-col gap-3">
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
                canManage={false}
                onViewRenewals={() => undefined}
                onMarkLost={() => undefined}
              />
            ))}
          </ul>
        )}
      </section>
      <Button asChild variant="secondary" size="sm" className="self-start">
        <Link href={`/library/members/${encodeURIComponent(studentId)}`}>
          {tProfile("openMember")}
        </Link>
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-fg-muted">{label}</span>
      <span className="text-[14px] text-fg">{children}</span>
    </div>
  );
}

export function StudentGuardiansTab({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.studentProfile.guardians");
  const user = useUserQuery(studentId);

  if (user.isLoading) return <Skeleton className="h-32 w-full" />;
  const profile = user.data?.profile;
  if (!profile) return <QueryError retry={() => user.refetch()} />;

  const rows: [string, string | undefined][] = [
    [t("fatherName"), profile.father_name],
    [t("motherName"), profile.mother_name],
    [t("guardianName"), profile.guardian_name],
    [t("guardianPhone"), profile.guardian_phone],
    [t("parentOccupation"), profile.parent_occupation],
  ];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
      <dl className="grid grid-cols-1 gap-4 rounded-sm border border-border bg-surface p-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-[12px] text-fg-muted">{label}</dt>
            <dd className="text-[14px] text-fg">
              {value === undefined || value === "" ? t("notRecorded") : value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
