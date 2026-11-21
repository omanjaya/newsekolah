"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatCurrency } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { FormError, ConfirmDialog } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { memberBorrowBlock } from "../lib/member-borrowing";
import { formatShortDay } from "../lib/short-date";
import { settlesByPayment } from "../lib/violations";
import { useLibraryMemberQuery } from "../members-api";
import { useTenantTimeZone } from "../use-tenant-timezone";
import { type LibraryViolation, useSettleLibraryViolationMutation } from "../violations-api";

/**
 * Confirms one specific outcome (paid or waived) for one violation -- the
 * "..." row menu in ViolationsView picks the action first, so this only
 * has to name the object and its impact in Rupiah (docs/07-ui-ux.md
 * section 5), never a second choice of buttons to weigh. Only a fine is
 * "paid": a suspension, warning or book to replace is marked settled.
 * Settling never lifts a suspension still running (the server keeps it
 * through its last day), so when the member is suspended the dialog says
 * until when, instead of promising a reactivation.
 */
export function ViolationSettleDialog({
  violation,
  status,
  memberName,
  onOpenChange,
  onSettled,
  onAlreadySettled,
}: {
  violation: LibraryViolation | null;
  status: "paid" | "waived" | null;
  memberName: string;
  onOpenChange: (open: boolean) => void;
  onSettled: (status: "paid" | "waived", violation: LibraryViolation) => void;
  /**
   * The server says the violation was settled already: a second click of
   * a double click, or another librarian. Nothing is left to do here, so
   * the dialog closes rather than reporting a failure.
   */
  onAlreadySettled: () => void;
}): ReactElement {
  const t = useTranslations("app.library.violations.settle");
  const tKinds = useTranslations("app.library.violations.kinds");
  const locale = useLocale() as Locale;
  const apiErrorMessage = useApiErrorMessage();
  const settle = useSettleLibraryViolationMutation();
  const [error, setError] = useState("");

  const open = violation !== null && status !== null;
  const suspensionNote = useSuspensionNote(open ? violation : null);
  const amount =
    violation && violation.amount > 0 ? formatCurrency(violation.amount, "IDR", { locale }) : null;
  const kind = violation ? tKinds(violation.kind) : "";
  const byPayment = violation ? settlesByPayment(violation) : true;
  const bodyText =
    status === "waived"
      ? amount
        ? t("confirmWaivedBodyAmount", { member: memberName, amount, kind })
        : t("confirmWaivedBody", { member: memberName, kind })
      : !byPayment
        ? t("confirmDoneBody", { member: memberName, kind })
        : amount
          ? t("confirmPaidBodyAmount", { member: memberName, amount, kind })
          : t("confirmPaidBody", { member: memberName, kind });
  const settleTitle = byPayment ? t("confirmPaidTitle") : t("confirmDoneTitle");
  const settleLabel = byPayment ? t("markPaid") : t("markDone");

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError("");
        onOpenChange(next);
      }}
      title={status === "waived" ? t("confirmWaivedTitle") : settleTitle}
      description={
        <div className="flex flex-col gap-2 text-body-sm text-fg-muted">
          <p>{bodyText}</p>
          {suspensionNote && <p>{suspensionNote}</p>}
          {error && <FormError>{error}</FormError>}
        </div>
      }
      confirmLabel={status === "waived" ? t("waive") : settleLabel}
      destructive={status === "waived"}
      confirming={settle.isPending}
      onConfirm={() => {
        if (!violation || !status) return;
        setError("");
        settle.mutate(
          { violationId: violation.id, status },
          {
            onSuccess: () => {
              onSettled(status, violation);
            },
            onError: (err) => {
              if (err instanceof ApiError && err.code === "LIBRARY_VIOLATION_ALREADY_SETTLED") {
                onAlreadySettled();
                return;
              }
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

/**
 * What settling `violation` leaves of the member's suspension, or null
 * when there is none to mention: a running one keeps its last day, one
 * with no end date stays until staff change the status. Until the member
 * loads (or for someone who may not read member records), settling a
 * suspension still says it is not ended early.
 */
function useSuspensionNote(violation: LibraryViolation | null): string | null {
  const t = useTranslations("app.library.violations.settle");
  const locale = useLocale() as Locale;
  const today = todayInZone(useTenantTimeZone());
  const canReadMember = useCan("manage_library_members");
  const member = useLibraryMemberQuery(canReadMember ? (violation?.member_user_id ?? "") : "");
  if (!violation) return null;
  if (!member.data) return violation.penalty === "suspend" ? t("suspensionNotLifted") : null;
  const block = memberBorrowBlock(member.data, today);
  if (block?.kind !== "suspended") return null;
  return block.until
    ? t("suspensionKeepsRunning", { date: formatShortDay(block.until, locale, { today }) })
    : t("suspensionKeepsRunningOpen");
}
