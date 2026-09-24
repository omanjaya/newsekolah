"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import type { BarcodeScanEvent } from "@newsekolah/ui";
import { useScanFeedback } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  useBatchBorrowLoansMutation,
  useFindLibraryCopyByCodeMutation,
  useFindMemberByCodeMutation,
  useLibraryTitleNameMutation,
  useRenewLoanByBarcodeMutation,
  useReturnLoanByBarcodeMutation,
} from "../desk-api";
import {
  type DeskBasketItem,
  type DeskMode,
  addBasketItem,
  borrowRejectReasonCode,
  classifyBorrowCopy,
  confirmableItems,
  matchDeskShortcut,
  removeBasketItem,
  undoLastBasketItem,
  updateBasketItem,
} from "../lib/desk-basket";
import { daysBetween } from "../lib/due-date";
import { useLibraryMemberQuery } from "../members-api";

import type { DeskSelectedMember } from "./desk-member-panel";

const EMPTY_BASKET: Record<DeskMode, DeskBasketItem[]> = { borrow: [], return: [], renew: [] };

/**
 * All the state and API orchestration behind the circulation desk's
 * continuous scan flow, kept out of the view component so
 * loan-desk-view.tsx stays a thin layout (docs/04-clean-code.md).
 *
 * Pinjam builds a pending basket committed by one Confirm (matches
 * `/v1/library/loans/batch-borrow`, which already accepts a whole list).
 * Kembali and Perpanjang commit each scan immediately: both
 * `return-by-barcode` and `renew-by-barcode` already act on exactly one
 * copy per call and return its real due date/fine, so nothing would be
 * gained by queuing them behind a second click -- the basket for those two
 * modes is a running receipt of calls already made, not a queue of calls
 * still to make.
 */
export function useDeskSession() {
  const t = useTranslations("app.library.desk");
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale() as Locale;
  const feedback = useScanFeedback();

  const [mode, setMode] = useState<DeskMode>("borrow");
  const [member, setMember] = useState<DeskSelectedMember | null>(null);
  const [basket, setBasket] = useState<Record<DeskMode, DeskBasketItem[]>>(EMPTY_BASKET);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);

  const memberDetail = useLibraryMemberQuery(member?.userId ?? "");
  const findMember = useFindMemberByCodeMutation();
  const findCopy = useFindLibraryCopyByCodeMutation();
  const titleName = useLibraryTitleNameMutation();
  const batchBorrow = useBatchBorrowLoansMutation();
  const returnByBarcode = useReturnLoanByBarcodeMutation();
  const renewByBarcode = useRenewLoanByBarcodeMutation();

  const selectMember = useCallback((next: DeskSelectedMember) => {
    setMember(next);
    setBasket(EMPTY_BASKET);
    setScanError("");
  }, []);

  const endSession = useCallback(() => {
    setMember(null);
    setBasket(EMPTY_BASKET);
    setScanError("");
    setReceiptOpen(false);
  }, []);

  const removeItem = useCallback((forMode: DeskMode, barcode: string) => {
    setBasket((prev) => ({ ...prev, [forMode]: removeBasketItem(prev[forMode], barcode) }));
  }, []);

  const undo = useCallback((forMode: DeskMode) => {
    setBasket((prev) => ({ ...prev, [forMode]: undoLastBasketItem(prev[forMode]) }));
  }, []);

  const addMemberByScan = useCallback(
    async (code: string) => {
      try {
        const found = await findMember.mutateAsync(code);
        if (!found) {
          feedback.playError();
          setScanError(t("member.notFound", { code }));
          return;
        }
        feedback.playSuccess();
        selectMember({
          userId: found.user_id,
          name: found.user_name,
          memberNo: found.member_no,
          nis: found.nis,
          username: found.username,
        });
      } catch {
        feedback.playError();
        setScanError(t("member.lookupFailed"));
      }
    },
    [findMember, feedback, selectMember, t],
  );

  const addBorrowScan = useCallback(
    async (code: string) => {
      try {
        const copy = await findCopy.mutateAsync(code);
        const title = await titleName.mutateAsync(copy.title_id).catch(() => code);
        const classification = classifyBorrowCopy(copy);
        if (classification.blocked) {
          feedback.playError();
          setBasket((prev) => ({
            ...prev,
            borrow: addBasketItem(prev.borrow, {
              barcode: copy.barcode,
              title,
              state: "blocked",
              detail: t(`basket.reason.${classification.reasonKey}`),
            }),
          }));
          return;
        }
        feedback.playSuccess();
        setBasket((prev) => ({
          ...prev,
          borrow: addBasketItem(prev.borrow, { barcode: copy.barcode, title, state: "pending" }),
        }));
      } catch {
        feedback.playError();
        setScanError(t("borrow.codeNotFound", { code }));
      }
    },
    [findCopy, titleName, feedback, t],
  );

  const addReturnScan = useCallback(
    async (code: string) => {
      try {
        const loan = await returnByBarcode.mutateAsync({ barcode: code });
        const title = await titleName.mutateAsync(loan.title_id).catch(() => code);
        const lateDays = loan.returned_at
          ? daysBetween(loan.due_on, loan.returned_at.slice(0, 10))
          : 0;
        const detail =
          lateDays > 0
            ? t("basket.returnedLate", { days: lateDays, amount: loan.fine_amount })
            : t("basket.returnedOnTime");
        feedback.playSuccess();
        setBasket((prev) => ({
          ...prev,
          return: addBasketItem(prev.return, { barcode: code, title, state: "done", detail }),
        }));
      } catch (error) {
        feedback.playError();
        const message =
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");
        setBasket((prev) => ({
          ...prev,
          return: addBasketItem(prev.return, {
            barcode: code,
            title: code,
            state: "failed",
            detail: message,
          }),
        }));
      }
    },
    [returnByBarcode, titleName, feedback, apiErrorMessage, t],
  );

  const addRenewScan = useCallback(
    async (code: string) => {
      try {
        const loan = await renewByBarcode.mutateAsync({ barcode: code });
        const title = await titleName.mutateAsync(loan.title_id).catch(() => code);
        feedback.playSuccess();
        setBasket((prev) => ({
          ...prev,
          renew: addBasketItem(prev.renew, {
            barcode: code,
            title,
            state: "done",
            detail: t("basket.renewedUntil", { date: formatDate(loan.due_on, { locale }) }),
          }),
        }));
      } catch (error) {
        feedback.playError();
        const message =
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");
        setBasket((prev) => ({
          ...prev,
          renew: addBasketItem(prev.renew, {
            barcode: code,
            title: code,
            state: "failed",
            detail: message,
          }),
        }));
      }
    },
    [renewByBarcode, titleName, feedback, apiErrorMessage, t, locale],
  );

  const handleScan = useCallback(
    (event: BarcodeScanEvent) => {
      const code = event.code.trim();
      if (!code || scanning) return;
      setScanError("");
      setScanning(true);
      const run = !member
        ? addMemberByScan(code)
        : mode === "borrow"
          ? addBorrowScan(code)
          : mode === "return"
            ? addReturnScan(code)
            : addRenewScan(code);
      void run.finally(() => {
        setScanning(false);
      });
    },
    [scanning, member, mode, addMemberByScan, addBorrowScan, addReturnScan, addRenewScan],
  );

  const confirmBorrow = useCallback(async () => {
    if (!member) return;
    const pending = confirmableItems(basket.borrow);
    if (pending.length === 0) return;
    try {
      const result = await batchBorrow.mutateAsync({
        member_user_id: member.userId,
        barcodes: pending.map((item) => item.barcode),
      });
      setBasket((prev) => {
        let next = prev.borrow;
        for (const rejected of result.rejected) {
          const reason = borrowRejectReasonCode(rejected.reason);
          const detail = "code" in reason ? apiErrorMessage(reason.code) : reason.raw;
          next = updateBasketItem(next, rejected.barcode, { state: "failed", detail });
        }
        // `result.loans` preserves the relative order `borrowOne` processed
        // `in.Barcodes` in (apps/api/.../loans.go's BatchBorrow loop), so
        // the accepted barcodes -- pending with the rejected ones removed,
        // same order -- line up with it index for index; each copy can
        // carry a different due date (its title's own max_loan_days), so
        // this must not assume one date for the whole batch.
        const rejectedBarcodes = new Set(result.rejected.map((r) => r.barcode));
        const acceptedInOrder = pending.filter((item) => !rejectedBarcodes.has(item.barcode));
        acceptedInOrder.forEach((item, index) => {
          const loan = result.loans[index];
          next = updateBasketItem(next, item.barcode, {
            state: "done",
            detail: t("basket.borrowedDue", {
              date: loan ? formatDate(loan.due_on, { locale }) : "",
            }),
          });
        });
        return { ...prev, borrow: next };
      });
      if (result.rejected.length > 0) feedback.playError();
      else feedback.playSuccess();
    } catch (error) {
      feedback.playError();
      const message =
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");
      setBasket((prev) => {
        let next = prev.borrow;
        for (const item of pending) {
          next = updateBasketItem(next, item.barcode, { state: "failed", detail: message });
        }
        return { ...prev, borrow: next };
      });
    }
  }, [member, basket.borrow, batchBorrow, apiErrorMessage, t, locale, feedback]);

  // Alt+1/2/3 switches mode, Alt+Z undoes the last scan -- never emitted by
  // the hardware scanner itself (lib/desk-basket.ts's matchDeskShortcut).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const match = matchDeskShortcut(event);
      if (!match) return;
      event.preventDefault();
      if (match === "undo") undo(mode);
      else setMode(match);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mode, undo]);

  return {
    mode,
    setMode,
    member,
    memberStatus: memberDetail.data?.status ?? null,
    selectMember,
    endSession,
    basket,
    scanning,
    scanError,
    handleScan,
    removeItem,
    undo,
    confirmBorrow,
    confirmingBorrow: batchBorrow.isPending,
    receiptOpen,
    setReceiptOpen,
  };
}
