"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Dialog, DialogClose, DialogContent, Input, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useMarkLoanLostMutation } from "../api";

/** Closes a loan as lost and charges a replacement cost, shared by the loan desk and member history views. */
export function MarkLostDialog({
  loanId,
  onOpenChange,
  onDone,
}: {
  loanId: string | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.library.markLost");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const markLost = useMarkLoanLostMutation();
  const [replacementCost, setReplacementCost] = useState("");

  const cost = Number(replacementCost);
  const canConfirm = replacementCost.trim() !== "" && Number.isFinite(cost) && cost >= 0;

  function handleConfirm() {
    if (!loanId) return;
    markLost.mutate(
      { loanId, replacementCost: cost },
      {
        onSuccess: () => {
          toast.success(t("success"));
          setReplacementCost("");
          onDone();
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    <Dialog
      open={loanId !== null}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) setReplacementCost("");
      }}
    >
      <DialogContent
        title={t("title")}
        description={t("body")}
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
              loading={markLost.isPending}
              onClick={handleConfirm}
            >
              {t("confirm")}
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("replacementCostLabel")}</span>
          <Input
            type="number"
            min={0}
            step="1000"
            value={replacementCost}
            onChange={(e) => {
              setReplacementCost(e.target.value);
            }}
          />
        </label>
      </DialogContent>
    </Dialog>
  );
}
