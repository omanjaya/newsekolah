"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatCurrency } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { ConfirmDialog } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type LibraryViolation, useSettleLibraryViolationMutation } from "../violations-api";

/**
 * Confirms one specific outcome (paid or waived) for one violation -- the
 * "..." row menu in ViolationsView picks the action first, so this only
 * has to name the object and its impact in Rupiah (docs/07-ui-ux.md
 * section 5), never a second choice of buttons to weigh.
 */
export function ViolationSettleDialog({
  violation,
  status,
  memberName,
  onOpenChange,
  onSettled,
}: {
  violation: LibraryViolation | null;
  status: "paid" | "waived" | null;
  memberName: string;
  onOpenChange: (open: boolean) => void;
  onSettled: (status: "paid" | "waived") => void;
}): ReactElement {
  const t = useTranslations("app.library.violations.settle");
  const tKinds = useTranslations("app.library.violations.kinds");
  const locale = useLocale() as Locale;
  const apiErrorMessage = useApiErrorMessage();
  const settle = useSettleLibraryViolationMutation();
  const [error, setError] = useState("");

  const open = violation !== null && status !== null;
  const amount =
    violation && violation.amount > 0 ? formatCurrency(violation.amount, "IDR", { locale }) : null;
  const kind = violation ? tKinds(violation.kind) : "";
  const bodyText =
    status === "waived"
      ? amount
        ? t("confirmWaivedBodyAmount", { member: memberName, amount, kind })
        : t("confirmWaivedBody", { member: memberName, kind })
      : amount
        ? t("confirmPaidBodyAmount", { member: memberName, amount, kind })
        : t("confirmPaidBody", { member: memberName, kind });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError("");
        onOpenChange(next);
      }}
      title={status === "waived" ? t("confirmWaivedTitle") : t("confirmPaidTitle")}
      description={
        <div className="flex flex-col gap-2 text-[13px] text-fg-muted">
          <p>{bodyText}</p>
          {error && <p className="text-status-absent">{error}</p>}
        </div>
      }
      confirmLabel={status === "waived" ? t("waive") : t("markPaid")}
      destructive={status === "waived"}
      confirming={settle.isPending}
      onConfirm={() => {
        if (!violation || !status) return;
        setError("");
        settle.mutate(
          { violationId: violation.id, status },
          {
            onSuccess: () => {
              onSettled(status);
            },
            onError: (err) => {
              setError(
                err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
              );
            },
          },
        );
      }}
    />
  );
}
