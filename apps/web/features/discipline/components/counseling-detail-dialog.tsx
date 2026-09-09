"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Button, Dialog, DialogContent, Skeleton } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import { useCounselingQuery } from "../api";

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
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const detail = useCounselingQuery(counselingId ?? "", counselingId !== null);
  const note = detail.data;

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
              <Button variant="secondary" size="sm" onClick={onDelete}>
                {t("detail.delete")}
              </Button>
              <Button size="sm" onClick={onEdit}>
                {t("detail.edit")}
              </Button>
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
              <dt className="text-fg-muted">{t("columns.visibility")}</dt>
              <dd>{t(`form.visibilityOptions.${note.visibility}`)}</dd>
            </dl>
            <p className="whitespace-pre-wrap text-fg">{note.content}</p>
            {note.follow_up_plan && (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <span className="font-medium">{t("detail.followUp")}</span>
                <p className="whitespace-pre-wrap text-fg-muted">{note.follow_up_plan}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
