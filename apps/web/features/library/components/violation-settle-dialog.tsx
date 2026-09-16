"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Dialog, DialogContent, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type LibraryViolation, useSettleLibraryViolationMutation } from "../violations-api";

/** Settles one violation as paid or waived; either can reactivate a suspended member. */
export function ViolationSettleDialog({
  violation,
  onOpenChange,
}: {
  violation: LibraryViolation | null;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.library.violations.settle");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const settle = useSettleLibraryViolationMutation();
  const [error, setError] = useState("");

  function settleAs(status: "paid" | "waived") {
    if (!violation) return;
    setError("");
    settle.mutate(
      { violationId: violation.id, status },
      {
        onSuccess: () => {
          toast.success(status === "paid" ? t("settledPaid") : t("settledWaived"));
          onOpenChange(false);
        },
        onError: (err) => {
          setError(
            err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    <Dialog
      open={violation !== null}
      onOpenChange={(open) => {
        if (!open) setError("");
        onOpenChange(open);
      }}
    >
      <DialogContent title={t("title")} description={t("description")}>
        {error && <p className="mb-4 text-[13px] text-status-absent">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="secondary"
            loading={settle.isPending && settle.variables.status === "waived"}
            disabled={settle.isPending}
            onClick={() => {
              settleAs("waived");
            }}
          >
            {t("waive")}
          </Button>
          <Button
            loading={settle.isPending && settle.variables.status === "paid"}
            disabled={settle.isPending}
            onClick={() => {
              settleAs("paid");
            }}
          >
            {t("markPaid")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
