"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  Input,
  useToast,
} from "@newsekolah/ui";
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
    // The danger zone: set apart at the end of the page, edged in danger.
    <Card className="border-danger/40">
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("body", { year: yearLabel })}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button
          variant="danger"
          disabled={yearLabel === ""}
          onClick={() => {
            setOpen(true);
          }}
        >
          {t("button")}
        </Button>
      </CardFooter>

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
                <Button variant="secondary">{t("cancel")}</Button>
              </DialogClose>
              <Button
                variant="danger"
                disabled={!canConfirm}
                loading={clearSchedules.isPending}
                onClick={handleConfirm}
              >
                {t("confirmButton")}
              </Button>
            </>
          }
        >
          <Field label={t("confirmInputLabel", { year: yearLabel })}>
            <Input
              value={confirmText}
              onChange={(e) => {
                setConfirmText(e.target.value);
              }}
              autoComplete="off"
            />
          </Field>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
