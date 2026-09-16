"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Button, Dialog, DialogContent, Skeleton, useToast } from "@newsekolah/ui";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import { useCounselingQuery, useCounselingReportMutation } from "../api";

import { CounselingAttachments } from "./counseling-attachments";

export function CounselingDetailDialog({
  counselingId,
  onClose,
  onEdit,
  onDelete,
}: {
  counselingId: string | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): ReactElement {
  const t = useTranslations("app.discipline.counseling");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const detail = useCounselingQuery(counselingId ?? "", counselingId !== null);
  const report = useCounselingReportMutation();
  const note = detail.data;
  const isOwner = note !== undefined && note.counselor_user_id === me?.id;

  function printReport() {
    if (!counselingId) return;
    report.mutate(counselingId, {
      onSuccess: (result) => {
        window.open(result.url, "_blank", "noopener,noreferrer");
      },
      onError: (error) => {
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        );
      },
    });
  }

  return (
    <Dialog
      open={counselingId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={note?.title ?? ""}
        hideHeader={!note}
        footer={
          note && (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={<Printer />}
                loading={report.isPending}
                onClick={printReport}
              >
                {t("detail.print")}
              </Button>
              {isOwner && (
                <>
                  <Button variant="secondary" size="sm" onClick={onDelete}>
                    {t("detail.delete")}
                  </Button>
                  <Button size="sm" onClick={onEdit}>
                    {t("detail.edit")}
                  </Button>
                </>
              )}
            </>
          )
        }
      >
        {detail.isLoading || !note ? (
          <Skeleton className="h-40 w-full" aria-busy="true" />
        ) : (
          <div className="flex flex-col gap-3 text-[13px]">
            <dl className="grid grid-cols-2 gap-2">
              <dt className="text-fg-muted">{t("columns.student")}</dt>
              <dd>{studentMap.get(note.student_user_id)?.name ?? t("unknownStudent")}</dd>
              <dt className="text-fg-muted">{t("columns.date")}</dt>
              <dd>{formatDateTime(note.session_at, { locale, timeZone: me?.tenant.timezone })}</dd>
              <dt className="text-fg-muted">{t("columns.kind")}</dt>
              <dd>{t(`form.kindOptions.${note.kind}`)}</dd>
              <dt className="text-fg-muted">{t("columns.topic")}</dt>
              <dd>{t(`form.topicOptions.${note.topic}`)}</dd>
              <dt className="text-fg-muted">{t("columns.visibility")}</dt>
              <dd>{t(`form.visibilityOptions.${note.visibility}`)}</dd>
            </dl>
            <p className="whitespace-pre-wrap text-fg">{note.content}</p>
            {note.career_goals && (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <span className="font-medium">{t("form.careerGoals")}</span>
                <p className="whitespace-pre-wrap text-fg-muted">{note.career_goals}</p>
              </div>
            )}
            {note.problem_description && (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <span className="font-medium">{t("form.problemDescription")}</span>
                <p className="whitespace-pre-wrap text-fg-muted">{note.problem_description}</p>
              </div>
            )}
            {note.follow_up_plan && (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <span className="font-medium">{t("detail.followUp")}</span>
                <p className="whitespace-pre-wrap text-fg-muted">{note.follow_up_plan}</p>
              </div>
            )}
            <CounselingAttachments counselingId={note.id} canUpload={isOwner} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
