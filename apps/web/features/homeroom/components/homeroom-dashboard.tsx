"use client";

import type { components } from "@newsekolah/api-client";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CountBadge,
  EmptyState,
  List,
  ListRow,
  SkeletonList,
  StatusBadge,
} from "@newsekolah/ui";
import { CheckCircle2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { formatDisplayName } from "../../../lib/text/format-name";
import { statusToken } from "../../attendance/lib/status-tokens";
import { studentProfileHref } from "../../students/href";

import { GuardianContactActions } from "./guardian-contact-actions";

type Entry = components["schemas"]["AttendanceHomeroomEntry"];
type LeaveRequestSummary = components["schemas"]["LeaveRequestSummary"];

/**
 * The homeroom teacher's three at-a-glance cards, under the summary hero:
 * who needs attention today (absent or incomplete attendance) with a call
 * or a WhatsApp to their guardian one tap away, leave requests waiting on
 * this teacher's approval, and any discipline record for the class. Split
 * out of `homeroom-view.tsx` to keep that file under the line budget.
 */
export function HomeroomDashboard({
  attentionRows,
  disciplineRows,
  pendingLeave,
  dashboardLoading,
  leaveLoading,
  showLeave,
  showDiscipline,
}: {
  attentionRows: Entry[];
  disciplineRows: Entry[];
  pendingLeave: LeaveRequestSummary[];
  dashboardLoading: boolean;
  leaveLoading: boolean;
  /** False when the school switched permits off: the pending-leave card goes away. */
  showLeave: boolean;
  /** False when the school switched discipline off: the discipline card goes away. */
  showDiscipline: boolean;
}): ReactElement {
  const t = useTranslations("app.homeroom");
  const format = useFormatter();

  return (
    // The cards stretch to one height, so the row ends on one line.
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <DashboardCard
        title={t("attentionListTitle")}
        count={attentionRows.length}
        loading={dashboardLoading}
        // Its own line: the hero above already says everyone is recorded.
        empty={t("contactEmpty")}
      >
        {attentionRows.map((row) => {
          const token = statusToken(row.status_code);
          const name = formatDisplayName(row.name);
          return (
            <ListRow
              key={row.student_user_id}
              title={name}
              meta={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {token ? (
                    <StatusBadge status={token} size="sm" label={t(`codes.${row.status_code}`)} />
                  ) : (
                    <Badge tone="warning" size="sm">
                      {t(`codes.${row.status_code}`)}
                    </Badge>
                  )}
                  {row.nis}
                </span>
              }
              href={studentProfileHref(row.student_user_id)}
              action={
                row.guardian_phone ? (
                  <GuardianContactActions phone={row.guardian_phone} studentName={name} />
                ) : undefined
              }
            />
          );
        })}
      </DashboardCard>

      {showLeave && (
        <DashboardCard
          title={t("pendingLeaveTitle")}
          count={pendingLeave.length}
          loading={leaveLoading}
          empty={t("pendingLeaveEmpty")}
        >
          {pendingLeave.map((item) => (
            <ListRow
              key={item.instance_id}
              title={formatDisplayName(item.student_name)}
              meta={format.dateTimeRange(
                new Date(`${item.starts_on}T12:00:00Z`),
                new Date(`${item.ends_on}T12:00:00Z`),
                { day: "numeric", month: "short", timeZone: "UTC" },
              )}
              trailing={
                <Badge tone="warning" size="sm">
                  {t("pendingLeaveReview")}
                </Badge>
              }
              href={`/leave-requests/${item.instance_id}`}
            />
          ))}
        </DashboardCard>
      )}

      {showDiscipline && (
        <DashboardCard
          title={t("disciplineTitle")}
          count={disciplineRows.length}
          loading={dashboardLoading}
          empty={t("disciplineEmpty")}
        >
          {disciplineRows.map((row) => (
            <ListRow
              key={row.student_user_id}
              title={formatDisplayName(row.name)}
              meta={t("violationSummary", {
                count: row.violation_count ?? 0,
                points: row.violation_points ?? 0,
              })}
              href={studentProfileHref(row.student_user_id, "discipline")}
            />
          ))}
        </DashboardCard>
      )}
    </div>
  );
}

function DashboardCard({
  title,
  count,
  loading,
  empty,
  children,
}: {
  title: string;
  count: number;
  loading: boolean;
  /** Said in the card when there is nothing to list. */
  empty: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          {title}
          {!loading && <CountBadge count={count} />}
        </CardTitle>
      </CardHeader>
      {loading ? (
        <CardContent className="pt-0">
          <SkeletonList rows={2} framed={false} />
        </CardContent>
      ) : count === 0 ? (
        <CardContent className="pt-0">
          <EmptyState
            variant="compact"
            tone="success"
            icon={<CheckCircle2 aria-hidden="true" />}
            title={empty}
          />
        </CardContent>
      ) : (
        <List>{children}</List>
      )}
    </Card>
  );
}
