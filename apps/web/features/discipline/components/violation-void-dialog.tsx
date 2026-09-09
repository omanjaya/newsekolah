"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Dialog, DialogContent, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type ViolationRecord, useVoidViolationMutation } from "../api";

export function ViolationVoidDialog({
  record,
  studentName,
  onOpenChange,
}: {
  record: ViolationRecord | null;
  studentName: string;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.discipline.violations");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const voidMutation = useVoidViolationMutation();
  const [reason, setReason] = useState("");

  return (
    <Dialog
      open={record !== null}
      onOpenChange={(open) => {
        if (!open) setReason("");
        onOpenChange(open);
      }}
    >
      <DialogContent
        title={t("voidDialog.title")}
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("form.cancel")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={voidMutation.isPending}
              disabled={reason.trim() === ""}
              onClick={() => {
                if (!record) return;
                voidMutation.mutate(
                  { id: record.id, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      toast.success(t("voided"));
                      setReason("");
                      onOpenChange(false);
                    },
                    onError: (error) => {
                      toast.error(
                        error instanceof ApiError
                          ? apiErrorMessage(error.code)
                          : apiErrorMessage("UNKNOWN"),
                      );
                    },
                  },
                );
              }}
            >
              {t("voidDialog.confirm")}
            </Button>
          </>
        }
      >
        {record && (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-fg-muted">
              {t("voidDialog.body", { student: studentName, points: record.points })}
            </p>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("voidDialog.reason")}</span>
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                }}
                maxLength={500}
              />
            </label>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
