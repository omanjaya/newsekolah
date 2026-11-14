"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  EmptyState,
  IconCircle,
  List,
  ListRow,
  SkeletonDetail,
  useToast,
} from "@newsekolah/ui";
import { FileWarning, ShieldAlert, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import {
  type ViolationRecord,
  useIssueWarningLetterMutation,
  useStudentDisciplineQuery,
} from "../api";

import { PointsMeter, nextLevel } from "./points-meter";
import { StudentCounselingHistory } from "./student-counseling-history";
import { ViolationAttachments } from "./violation-attachments";

/**
 * The body of one student's discipline record: the points against the
 * warning-letter thresholds with the letters already issued, then the
 * violation records as the timeline. Shared by the staff detail page
 * (`StudentDisciplineView`) and the student profile's discipline tab;
 * `showCounseling` lets the profile, which has a tab of its own for
 * counseling, leave the history out.
 */
export function StudentDisciplinePanel({
  studentId,
  showCounseling = true,
}: {
  studentId: string;
  showCounseling?: boolean;
}): ReactElement {
  const t = useTranslations("app.discipline.studentDetail");
  const tMeter = useTranslations("app.discipline.myDiscipline");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  const canIssue = useCan("issue_warning_letters");
  const canSeeCounseling = useCan("manage_counseling");
  const canRecordViolations = useCan("record_violations");
  const [viewingRecord, setViewingRecord] = useState<ViolationRecord | null>(null);

  const { data, isLoading, error, refetch } = useStudentDisciplineQuery(studentId);
  const issue = useIssueWarningLetterMutation();

  if (isLoading) return <SkeletonDetail rows={5} />;
  if (error || !data) {
    return <QueryError retry={() => refetch()} error={error} />;
  }

  const records = data.records.filter((r) => !r.is_voided);
  const nextDue = data.due_levels[0];
  const next = nextLevel(data.total_points, data.policy.levels);

  return (
    <div className="flex flex-col gap-6">
      <Card padding="md">
        <CardHeader
          action={
            canIssue && nextDue ? (
              <Button
                size="sm"
                loading={issue.isPending}
                onClick={() => {
                  issue.mutate(
                    { student_user_id: studentId, level: nextDue.level },
                    {
                      onSuccess: () => {
                        toast.success(t("issued", { level: nextDue.label }));
                      },
                      onError: (err) => {
                        toast.error(
                          err instanceof ApiError
                            ? apiErrorMessage(err.code)
                            : apiErrorMessage("UNKNOWN"),
                        );
                      },
                    },
                  );
                }}
              >
                {t("issue", { level: nextDue.label })}
              </Button>
            ) : undefined
          }
        >
          <CardTitle as="h2">{t("recap")}</CardTitle>
          <CardDescription>
            {next
              ? tMeter("toNext", { points: next.min_points - data.total_points, level: next.label })
              : tMeter("pastAll")}
          </CardDescription>
        </CardHeader>
        <p className="text-title-lg text-fg tabular-nums">
          {tMeter("points", { points: data.total_points })}
        </p>
        <PointsMeter
          total={data.total_points}
          levels={data.policy.levels}
          crossings={data.first_crossed}
        />
        {data.letters.length > 0 && (
          <List>
            {data.letters.map((letter) => (
              <ListRow
                key={letter.id}
                leading={
                  <IconCircle tone="warning" size="sm">
                    <FileWarning />
                  </IconCircle>
                }
                title={letter.level_label}
                titleLines={2}
                meta={`${letter.letter_number} · ${formatDate(letter.issued_at, { locale, timeZone })}`}
              />
            ))}
          </List>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("records")}</CardTitle>
          {records.length > 0 && (
            <CardDescription>{t("recordsCount", { count: records.length })}</CardDescription>
          )}
        </CardHeader>
        {records.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck aria-hidden="true" />}
            tone="success"
            title={t("recordsEmptyTitle")}
            description={t("recordsEmptyBody")}
          />
        ) : (
          <List>
            {records.map((record) => (
              <ListRow
                key={record.id}
                leading={
                  <IconCircle tone="neutral">
                    <ShieldAlert />
                  </IconCircle>
                }
                title={record.type_name}
                titleLines={2}
                meta={[formatDate(record.occurred_on, { locale, timeZone: "UTC" }), record.notes]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={
                  <span className="text-label text-fg tabular-nums">
                    {t("recordPoints", { points: record.points })}
                  </span>
                }
                onClick={() => {
                  setViewingRecord(record);
                }}
              />
            ))}
          </List>
        )}
      </Card>

      {showCounseling && canSeeCounseling && <StudentCounselingHistory studentId={studentId} />}

      <Dialog
        open={viewingRecord != null}
        onOpenChange={(open) => {
          if (!open) setViewingRecord(null);
        }}
      >
        <DialogContent
          title={viewingRecord?.type_name ?? ""}
          description={
            viewingRecord
              ? `${formatDate(viewingRecord.occurred_on, { locale, timeZone: "UTC" })} · ${t("recordPoints", { points: viewingRecord.points })}`
              : undefined
          }
        >
          {viewingRecord && (
            <div className="flex flex-col gap-4">
              {viewingRecord.notes && <p className="text-body text-fg">{viewingRecord.notes}</p>}
              <ViolationAttachments recordId={viewingRecord.id} canUpload={canRecordViolations} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
