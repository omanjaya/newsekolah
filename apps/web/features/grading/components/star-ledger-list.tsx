"use client";

import { formatShortDateTime, type Locale } from "@newsekolah/i18n";
import { Button, IconCircle, List, ListRow, SectionHeader, Skeleton } from "@newsekolah/ui";
import { Minus, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { useDirectoryNames } from "../../reference/directory-names";
import { useStarLedgerQuery } from "../api";

/** The newest events shown in the dialog: enough to spot a duplicate award or read the last notes. */
export const STAR_LEDGER_LIMIT = 20;

export interface StarLedgerListProps {
  studentId: string;
}

/**
 * One student's star history, newest first: who gave or took stars, how
 * many, when, and the note they wrote. Lives in the star dialog so a
 * teacher sees the record a new entry joins (and a duplicate award at
 * once, since `useGiveStarMutation` invalidates this ledger on save).
 */
export function StarLedgerList({ studentId }: StarLedgerListProps): ReactElement {
  const t = useTranslations("app.grading.starLedger");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const ledger = useStarLedgerQuery(studentId, STAR_LEDGER_LIMIT);
  const events = ledger.data?.data ?? [];
  const teachers = useDirectoryNames(events.map((event) => event.teacher_user_id));

  let body: ReactElement;
  if (ledger.isLoading) {
    body = (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  } else if (ledger.isError) {
    body = (
      <div className="flex items-center justify-between gap-2 text-body-sm text-fg-muted">
        <span>{t("error")}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            void ledger.refetch();
          }}
        >
          {t("retry")}
        </Button>
      </div>
    );
  } else if (events.length === 0) {
    body = <p className="text-body-sm text-fg-muted">{t("empty")}</p>;
  } else {
    body = (
      <List variant="plain" dense>
        {events.map((event) => {
          const given = event.delta > 0;
          const teacher = teachers.get(event.teacher_user_id)?.name ?? t("unknownTeacher");
          const when = formatShortDateTime(event.created_at, {
            locale,
            timeZone: me?.tenant.timezone,
          });
          return (
            <ListRow
              key={event.id}
              leading={
                <IconCircle tone={given ? "success" : "danger"} size="sm">
                  {given ? <Plus aria-hidden="true" /> : <Minus aria-hidden="true" />}
                </IconCircle>
              }
              title={
                given
                  ? t("given", { count: event.delta, teacher })
                  : t("taken", { count: -event.delta, teacher })
              }
              meta={event.note.trim() ? [when, event.note.trim()] : [when]}
            />
          );
        })}
      </List>
    );
  }

  return (
    <section aria-labelledby={`star-ledger-${studentId}`} className="flex flex-col gap-2">
      <SectionHeader as="h3" size="sm" title={t("title")} titleId={`star-ledger-${studentId}`} />
      {body}
    </section>
  );
}
