"use client";

import { formatDate, formatDateRange } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  DataList,
  DataListItem,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  List,
  ListRow,
  MonthPicker,
  SectionHeader,
  SkeletonDetail,
  SkeletonList,
  domainIcons,
} from "@newsekolah/ui";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useSession } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { todayInZone } from "../../attendance/api";
import { MonthlyAttendanceTable } from "../../attendance/components/monthly-attendance-table";
import { StudentCounselingHistory } from "../../discipline/components/student-counseling-history";
import { StudentDisciplinePanel } from "../../discipline/components/student-discipline-panel";
import { useMemberLoanHistoryQuery } from "../../library/api";
import { MemberLoanRow, loanRowSortKey } from "../../library/components/member-loan-row";
import { useLibraryMemberQuery, useLibraryMemberTypesQuery } from "../../library/members-api";
import { useMemberViolationsQuery } from "../../library/violations-api";
import { useMentorStudentSnapshotQuery } from "../../mentoring/api";
import { SnapshotGradesSection } from "../../mentoring/components/student-snapshot-sections";
import { useLeaveReviewQueueQuery } from "../../permits/api";
import { LeaveRequestDetail } from "../../permits/components/leave-request-detail";
import { useLookup } from "../../reference/api";
import { useUserQuery } from "../../school/api";

/*
 * One component per profile tab after the overview (student-overview.tsx).
 * Each reuses the panel or hook its own feature already ships; none owns
 * data logic of its own. Which tab a reader sees is decided by
 * `visibleStudentProfileTabs`, so a panel here can assume its endpoint's
 * permission.
 */

export function StudentAttendanceTab({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.studentProfile.attendance");
  const { me } = useSession();
  const today = todayInZone(me?.tenant.timezone);
  const [month, setMonth] = useDateFilter("month", today.slice(0, 7), true);
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("month")} className="sm:w-56">
        <MonthPicker value={month} onChange={setMonth} today={today} />
      </Field>
      <MonthlyAttendanceTable studentId={studentId} month={month} />
    </div>
  );
}

export function StudentGradesTab({ studentId }: { studentId: string }): ReactElement {
  const snapshot = useMentorStudentSnapshotQuery(studentId);
  if (snapshot.isError && !snapshot.data) {
    return <QueryError retry={() => void snapshot.refetch()} error={snapshot.error} />;
  }
  if (!snapshot.data) return <SkeletonList rows={5} framed />;
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

  if (queue.isError && !queue.data) {
    return <QueryError retry={() => void queue.refetch()} error={queue.error} />;
  }
  if (queue.isLoading) return <SkeletonList rows={3} framed />;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t("title")}
        description={t("note")}
        count={items.length}
        action={
          <Button asChild variant="link">
            <Link href="/leave-requests">{t("openQueue")}</Link>
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.exitPermit aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <List framed>
          {items.map((item) => (
            <ListRow
              key={item.instance_id}
              title={tLeave(`categories.${item.category}`)}
              meta={item.reason}
              trailing={formatDateRange(item.starts_on, item.ends_on, { locale })}
              onClick={() => {
                setOpenId(item.instance_id);
              }}
            />
          ))}
        </List>
      )}
      <Dialog
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DialogContent title={t("detailTitle")} size="lg">
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

  if (member.isLoading) return <SkeletonDetail rows={4} />;
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
    <div className="flex flex-col gap-6">
      <Card padding="md">
        <DataList layout="stacked" columns={2} className="lg:grid-cols-4">
          <DataListItem label={t("memberNo")}>{data.member_no}</DataListItem>
          <DataListItem label={t("memberType")}>
            {memberTypeMap.get(data.member_type_id)?.name}
          </DataListItem>
          <DataListItem label={t("validUntil")}>
            {data.valid_until ? formatDate(data.valid_until, { locale }) : undefined}
          </DataListItem>
          <DataListItem label={t("statusLabel")}>
            <Badge tone={data.status === "active" ? "success" : "neutral"}>
              {t(`status.${data.status}`)}
            </Badge>
          </DataListItem>
        </DataList>
      </Card>
      {unpaid.length > 0 && (
        <Alert tone="warning" title={`${tHistory("fines.title")}: ${unpaid.length}`} />
      )}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title={tHistory("currentLoans")}
          count={activeLoans.length}
          action={
            <Button asChild variant="link">
              <Link href={`/library/members/${encodeURIComponent(studentId)}`}>
                {tProfile("openMember")}
              </Link>
            </Button>
          }
        />
        {loans.isLoading ? (
          <SkeletonList rows={2} framed />
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
    </div>
  );
}

export function StudentGuardiansTab({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.studentProfile.guardians");
  const user = useUserQuery(studentId);

  if (user.isLoading) return <SkeletonDetail rows={5} />;
  const profile = user.data?.profile;
  if (!profile) return <QueryError retry={() => void user.refetch()} error={user.error} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
      </CardHeader>
      <div className="px-5 pb-5">
        <DataList layout="stacked" columns={2}>
          <DataListItem label={t("fatherName")}>{profile.father_name}</DataListItem>
          <DataListItem label={t("motherName")}>{profile.mother_name}</DataListItem>
          <DataListItem label={t("guardianName")}>{profile.guardian_name}</DataListItem>
          <DataListItem label={t("guardianPhone")}>{profile.guardian_phone}</DataListItem>
          <DataListItem label={t("parentOccupation")} fullWidth>
            {profile.parent_occupation}
          </DataListItem>
        </DataList>
      </div>
    </Card>
  );
}
