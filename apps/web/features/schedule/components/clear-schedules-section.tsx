"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Dialog, DialogClose, DialogContent, Input, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClearSchedulesMutation } from "../api";

/**
 * A typed confirmation (the exact academic year name) instead of a plain
 * yes/no dialog, per docs/07-ui-ux.md: an irreversible bulk delete needs
 * more friction than a normal confirm.
 */
export function ClearSchedulesSection({
  academicYearId,
  yearLabel,
}: {
  academicYearId: string;
  yearLabel: string;
}): ReactElement {
  const t = useTranslations("app.schedule.bulk.clearSection");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const clearSchedules = useClearSchedulesMutation();

  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = confirmText.trim() === yearLabel && yearLabel !== "";

  function handleConfirm() {
    clearSchedules.mutate(academicYearId, {
      onSuccess: () => {
        toast.success(t("cleared", { year: yearLabel }));
        setOpen(false);
        setConfirmText("");
      },
      onError: (error) => {
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        );
      },
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-status-absent/40 bg-surface p-4">
      <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
      <p className="text-[13px] text-fg-muted">{t("body", { year: yearLabel })}</p>
      <div>
        <Button
          variant="danger"
          size="sm"
          disabled={yearLabel === ""}
          onClick={() => {
            setOpen(true);
          }}
        >
          {t("button")}
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setConfirmText("");
        }}
      >
        <DialogContent
          title={t("confirmTitle", { year: yearLabel })}
          description={t("confirmBody", { year: yearLabel })}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary" size="sm">
                  {t("cancel")}
                </Button>
              </DialogClose>
              <Button
                variant="danger"
                size="sm"
                disabled={!canConfirm}
                loading={clearSchedules.isPending}
                onClick={handleConfirm}
              >
                {t("confirmButton")}
              </Button>
            </>
          }
        >
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">
              {t("confirmInputLabel", { year: yearLabel })}
            </span>
            <Input
              value={confirmText}
              onChange={(e) => {
                setConfirmText(e.target.value);
              }}
              autoComplete="off"
            />
          </label>
        </DialogContent>
      </Dialog>
    </section>
  );
}
