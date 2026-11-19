"use client";

import type { components } from "@newsekolah/api-client";
import { Badge, ListRow, StatusBadge } from "@newsekolah/ui";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatDisplayName } from "../../../lib/text/format-name";
import { statusToken } from "../../attendance/lib/status-tokens";
import { studentProfileHref } from "../../students/href";

import { GuardianContactActions } from "./guardian-contact-actions";
import { HomeroomQueueCard, type ReadFailure } from "./homeroom-queue-card";

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
  dashboardFailure = null,
  leaveFailure = null,
  showLeave,
  showDiscipline,
  datedHidden = false,
}: {
  attentionRows: Entry[];
  disciplineRows: Entry[];
  pendingLeave: LeaveRequestSummary[];
  dashboardLoading: boolean;
  leaveLoading: boolean;
  /** The day's class read failed: the contact and discipline cards say so. */
  dashboardFailure?: ReadFailure | null;
  /** The leave review queue failed: its card says so. */
  leaveFailure?: ReadFailure | null;
  /** False when the school switched permits off: the pending-leave card goes away. */
  showLeave: boolean;
  /** False when the school switched discipline off: the discipline card goes away. */
  showDiscipline: boolean;
  /**
   * The chosen day lies outside the reader's homeroom term: the two cards
   * read from that day (contact, discipline) go away, since they could
   * only repeat the refusal. The leave queue does not depend on the day,
   * so its card stays (audit r5-n5).
   */
  datedHidden?: boolean;
}): ReactElement {
  const t = useTranslations("app.homeroom");
  const format = useFormatter();

  return (
    // The cards stretch to one height, so the row ends on one line.
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {!datedHidden && (
        <HomeroomQueueCard
          className="h-full"
          title={t("attentionListTitle")}
          count={attentionRows.length}
          // Guardians to contact wait on the teacher: the accent count, as
          // on the journal's "Perlu diisi" and the permits tab.
          countTone="accent"
          loading={dashboardLoading}
          failure={dashboardFailure}
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
        </HomeroomQueueCard>
      )}

      {showLeave && (
        <HomeroomQueueCard
          className="h-full"
          title={t("pendingLeaveTitle")}
          count={pendingLeave.length}
          countTone="accent"
          loading={leaveLoading}
          failure={leaveFailure}
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
        </HomeroomQueueCard>
      )}

      {showDiscipline && !datedHidden && (
        // A plain tally of records, nothing to act on: the neutral count.
        <HomeroomQueueCard
          className="h-full"
          title={t("disciplineTitle")}
          count={disciplineRows.length}
          loading={dashboardLoading}
          failure={dashboardFailure}
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
        </HomeroomQueueCard>
      )}
    </div>
  );
}
