"use client";

import { Button, CardFooter, ConfirmDialog, useToast } from "@newsekolah/ui";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { formatCalendarDate } from "../../../lib/format-calendar-date";
import { type Substitution, useCancelSubstitutionMutation } from "../api";

const LONG_DATE = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
} as const;

/** A request a schedule manager is about to cancel for its two teachers. */
export interface ReleaseAction {
  item: Substitution;
  requester: string;
  substitute: string;
  /** The lesson and its day, as the card names them. */
  lesson: string;
}

/**
 * Whether a schedule manager may cancel `item` for its teachers: a pending
 * or accepted request for today or later. Cancelling one can release the
 * lesson's timetable from the date it held (the schedule editor links to
 * the school-wide list for this); one already past only records what
 * happened.
 */
export function releasable(item: Substitution, today: string): boolean {
  return (item.status === "pending" || item.status === "accepted") && item.date >= today;
}

/**
 * A schedule manager's cancel on another teacher's request: the card's
 * button, then a confirmation naming both teachers and saying they will be
 * told and the cancellation audited. Only when the server says the request
 * is what holds the lesson's timetable back (`release_frees_from`) does it
 * add the earlier date a change could then take effect from: another hold,
 * the lesson's own first date or its end can keep that date where it is.
 * On failure the dialog stays open, so confirming again retries.
 */
export function ReleaseRequest({
  release,
  onError,
}: {
  release: ReleaseAction;
  onError: (error: unknown) => void;
}): ReactElement {
  const t = useTranslations("app.substitutions");
  const format = useFormatter();
  const toast = useToast();
  const cancel = useCancelSubstitutionMutation();
  const [open, setOpen] = useState(false);
  const names = { requester: release.requester, substitute: release.substitute };
  const freesFrom = release.item.release_frees_from;
  const description = freesFrom
    ? t("releaseConfirm.bodyFreeing", {
        lesson: release.lesson,
        date: formatCalendarDate(format, freesFrom, LONG_DATE),
      })
    : t("releaseConfirm.body", { lesson: release.lesson });
  return (
    <>
      <CardFooter className="justify-end">
        <Button
          variant="secondary"
          aria-label={t("release", names)}
          onClick={() => {
            setOpen(true);
          }}
        >
          {t("cancel")}
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("releaseConfirm.title", names)}
        description={description}
        confirmLabel={t("releaseConfirm.confirm")}
        cancelLabel={t("releaseConfirm.keep")}
        tone="danger"
        confirming={cancel.isPending}
        onConfirm={() => {
          cancel.mutate(release.item.id, {
            onError,
            onSuccess: () => {
              setOpen(false);
              toast.success(t("cancelled"));
            },
          });
        }}
      />
    </>
  );
}
