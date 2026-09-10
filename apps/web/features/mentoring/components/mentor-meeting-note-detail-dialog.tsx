"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Button, Dialog, DialogContent, Skeleton } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { useMentorMeetingNoteQuery } from "../api";

/**
 * Shows one sealed meeting note. Deliberately a dialog, not a route: the
 * note's own id is the only thing this ever puts in application state, and
 * its topic/content never reach a page title, a toast, or the URL.
 */
export function MentorMeetingNoteDetailDialog({
  noteId,
  studentNames,
  canEdit,
  onClose,
  onEdit,
  onDelete,
}: {
  noteId: string | null;
  studentNames: Map<string, string>;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): ReactElement {
  const t = useTranslations("app.mentoring.notes");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const detail = useMentorMeetingNoteQuery(noteId ?? "", noteId !== null);
  const note = detail.data;
  const isOwnNote = note?.mentor_user_id !== undefined && note.mentor_user_id === me?.id;

  return (
    <Dialog
      open={noteId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={t("detail.title")}
        hideHeader={!note}
        footer={
          note &&
          canEdit &&
          isOwnNote && (
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
              <dt className="text-fg-muted">{t("columns.metAt")}</dt>
              <dd>{formatDateTime(note.met_at, { locale, timeZone: me?.tenant.timezone })}</dd>
              <dt className="text-fg-muted">{t("columns.kind")}</dt>
              <dd>{t(`form.kindOptions.${note.kind}`)}</dd>
              <dt className="text-fg-muted">{t("columns.attendees")}</dt>
              <dd>
                {note.attendee_user_ids
                  .map((id) => studentNames.get(id) ?? t("unknownStudent"))
                  .join(", ")}
              </dd>
            </dl>
            <div className="flex flex-col gap-1 border-t border-border pt-3">
              <span className="font-medium">{t("columns.topic")}</span>
              <p className="text-fg">{note.topic}</p>
            </div>
            <div className="flex flex-col gap-1 border-t border-border pt-3">
              <span className="font-medium">{t("detail.content")}</span>
              <p className="whitespace-pre-wrap text-fg">{note.content}</p>
            </div>
            {note.agreed_actions && (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <span className="font-medium">{t("detail.agreedActions")}</span>
                <p className="whitespace-pre-wrap text-fg-muted">{note.agreed_actions}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
