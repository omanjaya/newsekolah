"use client";

import { Alert, Avatar, EmptyState, PageHeader, Skeleton, cn, domainIcons } from "@newsekolah/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useGuardianLeaveQueueQuery } from "../../permits/api";
import {
  type LinkedChild,
  currentMonth,
  useChildAttendanceQuery,
  useChildBillingQuery,
  useChildDisciplineQuery,
  useChildGradesQuery,
  useMyChildrenQuery,
} from "../api";

import {
  AttendanceSection,
  BillingSection,
  DisciplineSection,
  GradesSection,
} from "./child-record-sections";
import { TodayCard } from "./child-today-card";

/**
 * A parent's own children: one screen per child that answers "is my child
 * OK today" first (today's status, this week, pending leave requests --
 * see child-today-card.tsx), then grades, discipline, and bills.
 * Switching children is one tap (a chip row, not a dropdown) since a
 * parent with several kids checks this screen constantly during the
 * school day. Only published data is shown (docs/07-ui-ux.md section 5);
 * nothing here implies a judgement the data does not carry.
 */
export function ChildrenView(): ReactElement {
  const t = useTranslations("app.family.myChildren");
  const children = useMyChildrenQuery();
  const rows = children.data?.data ?? [];
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("child") ?? "";
  const [studentId, setStudentId] = useState("");
  const effectiveId =
    studentId ||
    (rows.some((c) => c.student_user_id === requestedId) ? requestedId : "") ||
    (rows[0]?.student_user_id ?? "");
  const selected = rows.find((c) => c.student_user_id === effectiveId);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <PendingApprovalsBanner />

      {children.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : children.error ? (
        <Alert variant="warning" title={t("loadError")} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {rows.length > 1 && (
            <ChildSwitcher rows={rows} selectedId={effectiveId} onSelect={setStudentId} />
          )}
          {selected && <ChildSections child={selected} />}
        </div>
      )}
    </div>
  );
}

/** One tap to switch: a horizontally scrollable chip row, not a dropdown. */
function ChildSwitcher({
  rows,
  selectedId,
  onSelect,
}: {
  rows: LinkedChild[];
  selectedId: string;
  onSelect: (id: string) => void;
}): ReactElement {
  const t = useTranslations("app.family.myChildren");
  return (
    <div
      role="tablist"
      aria-label={t("pickChild")}
      className={cn(
        "flex snap-x snap-mandatory gap-2 overflow-x-auto py-0.5",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      {rows.map((child) => {
        const name = formatDisplayName(child.student_name);
        const active = child.student_user_id === selectedId;
        return (
          <button
            key={child.student_user_id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              onSelect(child.student_user_id);
            }}
            className={cn(
              "flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-fg-muted hover:bg-bg",
            )}
          >
            <Avatar name={name} size="sm" />
            {name}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A guardian's shortcut to their pending leave-request approvals, shown
 * only once there is something waiting -- this screen is about the
 * child's record, not a second inbox, so it stays silent otherwise.
 */
function PendingApprovalsBanner(): ReactElement | null {
  const t = useTranslations("app.family.myChildren.pendingApprovals");
  const canApproveAsGuardian = useCan("approve_child_leave_requests");
  const queue = useGuardianLeaveQueueQuery(canApproveAsGuardian);
  const count = queue.data?.data.length ?? 0;

  if (!canApproveAsGuardian || count === 0) return null;

  return (
    <Alert variant="warning" title={t("title", { count })}>
      <Link href="/leave-requests" className="underline underline-offset-2">
        {t("link")}
      </Link>
    </Alert>
  );
}

function ChildSections({ child }: { child: LinkedChild }): ReactElement {
  const canSeeGrades = useCan("view_child_grades");
  const canSeeBilling = useCan("view_child_billing");
  const [month, setMonth] = useState(currentMonth());
  const attendance = useChildAttendanceQuery(child.student_user_id, month);
  const grades = useChildGradesQuery(child.student_user_id);
  const discipline = useChildDisciplineQuery(child.student_user_id);
  const billing = useChildBillingQuery(canSeeBilling ? child.student_user_id : "");

  return (
    <div className="flex flex-col gap-6">
      <TodayCard child={child} attendance={attendance} />
      <AttendanceSection month={month} onMonthChange={setMonth} query={attendance} />
      {canSeeGrades && <GradesSection query={grades} />}
      <DisciplineSection query={discipline} />
      {canSeeBilling && <BillingSection query={billing} />}
    </div>
  );
}
