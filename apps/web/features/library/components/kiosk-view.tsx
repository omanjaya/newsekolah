"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { BarcodeScannerField, Button, PageHeader, domainIcons } from "@newsekolah/ui";
import type { BarcodeScanEvent } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useBorrowLoanMutation, useReturnLoanMutation } from "../api";
import { looksLikeMemberCard, useKioskMemberSession } from "../kiosk-session";

import { KioskFeedbackBanner, type KioskFeedback } from "./kiosk-feedback-banner";
import { KioskMemberPanel } from "./kiosk-member-panel";

/**
 * A school leaves this screen running unattended in the reading room, so
 * it must clear itself: one reader's loans must never linger for the next
 * person to see. Long enough to read a handful of due dates, short enough
 * that an idle station does not sit on one reader's session all morning.
 */
const IDLE_RESET_MS = 20_000;

export function KioskView(): ReactElement {
  const t = useTranslations("app.library.kiosk");
  const locale = useLocale() as Locale;
  const apiErrorMessage = useApiErrorMessage();

  const [memberUserId, setMemberUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<KioskFeedback | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const session = useKioskMemberSession(memberUserId);
  const borrow = useBorrowLoanMutation();
  const returnLoan = useReturnLoanMutation();

  const scheduleReset = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setMemberUserId(null);
      setFeedback(null);
    }, IDLE_RESET_MS);
  }, []);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const endSession = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setMemberUserId(null);
    setFeedback(null);
  }, []);

  const showError = (error: unknown) => {
    setFeedback({
      kind: "refusal",
      message: error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    });
  };

  const handleCardScan = (event: BarcodeScanEvent) => {
    if (!looksLikeMemberCard(event.code)) {
      setFeedback({ kind: "refusal", message: t("feedback.unknownCard") });
      scheduleReset();
      return;
    }
    setMemberUserId(event.code);
    setFeedback(null);
    scheduleReset();
  };

  const handleBookScan = (event: BarcodeScanEvent) => {
    if (!memberUserId) return;
    const existingLoan = session.findLoanForBarcode(event.code);
    if (existingLoan) {
      returnLoan.mutate(
        { loanId: existingLoan.id },
        {
          onSuccess: () => {
            setFeedback({ kind: "success", message: t("feedback.returned") });
          },
          onError: showError,
        },
      );
    } else {
      borrow.mutate(
        { barcode: event.code, member_user_id: memberUserId },
        {
          onSuccess: () => {
            setFeedback({ kind: "success", message: t("feedback.borrowed") });
          },
          onError: showError,
        },
      );
    }
    scheduleReset();
  };

  if (!memberUserId) {
    return (
      <div className="flex flex-col items-center gap-8 p-8 text-center">
        <PageHeader eyebrow={t("eyebrow")} title={t("idle.title")} />
        <domainIcons.library className="size-16 text-fg-muted" aria-hidden="true" />
        <p className="max-w-md text-[24px] text-fg-muted">{t("idle.instructions")}</p>
        <BarcodeScannerField
          size="large"
          label={t("idle.scanLabel")}
          onScan={handleCardScan}
          submitLabel={t("idle.submit")}
          autoFocus
        />
        {feedback && <KioskFeedbackBanner feedback={feedback} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-8">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("active.title")}
        actions={
          <Button size="md" variant="secondary" onClick={endSession}>
            {t("active.done")}
          </Button>
        }
      />

      <KioskMemberPanel
        session={session}
        locale={locale}
        dueOnLabel={t("active.dueOn")}
        limitLabel={(count, max) => t("active.limit", { count, max })}
        emptyLabel={t("active.empty")}
      />

      <BarcodeScannerField
        size="large"
        label={t("active.scanLabel")}
        onScan={handleBookScan}
        submitLabel={t("active.submit")}
        autoFocus
      />

      {feedback && <KioskFeedbackBanner feedback={feedback} />}
    </div>
  );
}
