"use client";

import { Button, CardFooter, ConfirmDialog, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { type Substitution, useCancelSubstitutionMutation } from "../api";

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
 * or accepted request for today or later. Cancelling one releases the
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
 * told and the cancellation audited. On failure the dialog stays open, so
 * confirming again retries.
 */
export function ReleaseRequest({
  release,
  onError,
}: {
  release: ReleaseAction;
  onError: (error: unknown) => void;
}): ReactElement {
  const t = useTranslations("app.substitutions");
  const toast = useToast();
  const cancel = useCancelSubstitutionMutation();
  const [open, setOpen] = useState(false);
  const names = { requester: release.requester, substitute: release.substitute };
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
        description={t("releaseConfirm.body", { lesson: release.lesson })}
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
