"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatCurrency, formatDate } from "@newsekolah/i18n";
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
  classifyBorrowCopy,
  confirmableItemsInScanOrder,
  matchDeskShortcut,
  recordBasketResult,
  removeBasketItem,
  undoLastBasketItem,
  updateBasketItem,
} from "../lib/desk-basket";
import { useLibraryMemberBorrowingStatusQuery, useLibraryMemberQuery } from "../members-api";

import type { DeskSelectedMember } from "./desk-member-panel";

const EMPTY_BASKET: Record<DeskMode, DeskBasketItem[]> = { borrow: [], return: [], renew: [] };

/** Why a code scanned for a member card did not select anyone. */
const MEMBER_MISS_KEY = {
  none: "member.notFound",
  ambiguous: "member.ambiguous",
  copy: "member.copyNotCard",
} as const;

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
 * still to make. Neither needs a member card first: the barcode alone
 * names the loan, so a book handed back on its own is returned at once.
 * A member card scanned there anyway still selects the member (the
 * server finds no loan for it, see `recordRefusal`).
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
  const borrowingStatus = useLibraryMemberBorrowingStatusQuery(member?.userId ?? "");
  const findMember = useFindMemberByCodeMutation();
  const findCopy = useFindLibraryCopyByCodeMutation();
  const titleName = useLibraryTitleNameMutation();
  const batchBorrow = useBatchBorrowLoansMutation();
  const returnByBarcode = useReturnLoanByBarcodeMutation();
  const renewByBarcode = useRenewLoanByBarcodeMutation();

  // A new member starts a new session. Of the returns and renewals already
  // on the desk (an idle desk can take a whole drop-box from many readers),
  // only that member's own loans stay, so their receipt never lists books
  // someone else handed back; the rest, failed rows included, are dropped.
  const selectMember = useCallback((next: DeskSelectedMember) => {
    setBasket((prev) => ({
      borrow: [],
      return: prev.return.filter((item) => item.memberUserId === next.userId),
      renew: prev.renew.filter((item) => item.memberUserId === next.userId),
    }));
    setMember(next);
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
        const match = await findMember.mutateAsync(code);
        if (match.status !== "found") {
          feedback.playError();
          setScanError(t(MEMBER_MISS_KEY[match.status], { code }));
          return;
        }
        const found = match.member;
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

  /** The book's title for a scanned barcode, or the barcode itself when it names no copy. */
  const titleForBarcode = useCallback(
    async (code: string): Promise<string> => {
      try {
        const copy = await findCopy.mutateAsync(code);
        return await titleName.mutateAsync(copy.title_id);
      } catch {
        return code;
      }
    },
    [findCopy, titleName],
  );

  /**
   * A return or renewal the server refused. Two cases are not a failed
   * book and add no row:
   * - a member card scanned where a book was expected (the server finds
   *   no loan for it): it selects that member, as a card scanned first
   *   always did, or says it is a card when that member is already served;
   * - a copy this session already returned or renewed, scanned again (a
   *   scanner double read, a second scan by hand): the saved result stays
   *   on the list and the receipt, which are the member's proof, and the
   *   rescan is reported on its own.
   * Anything else is a failed row named by the book's title.
   */
  const recordRefusal = useCallback(
    async (forMode: "return" | "renew", code: string, error: unknown) => {
      const errorCode = error instanceof ApiError ? error.code : "UNKNOWN";
      const message = apiErrorMessage(errorCode);

      if (errorCode === "LIBRARY_LOAN_NOT_FOUND") {
        const match = await findMember.mutateAsync(code).catch(() => null);
        if (match?.status === "found") {
          const found = match.member;
          if (found.user_id === member?.userId) {
            feedback.playError();
            setScanError(t("member.cardNotBook", { code }));
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
          return;
        }
      }

      feedback.playError();
      const known = basket[forMode].find((item) => item.barcode === code);
      if (known?.state === "done") {
        setScanError(
          forMode === "return"
            ? t("basket.alreadyReturned", { title: known.title })
            : t("basket.alreadyRenewed", { title: known.title, reason: message }),
        );
        return;
      }
      const title =
        known && known.title !== known.barcode ? known.title : await titleForBarcode(code);
      setBasket((prev) => ({
        ...prev,
        [forMode]: recordBasketResult(prev[forMode], {
          barcode: code,
          title,
          state: "failed",
          detail: message,
        }),
      }));
    },
    [apiErrorMessage, findMember, member, feedback, t, selectMember, basket, titleForBarcode],
  );

  const addReturnScan = useCallback(
    async (code: string) => {
      try {
        const loan = await returnByBarcode.mutateAsync({ barcode: code });
        const title = await titleName.mutateAsync(loan.title_id).catch(() => code);
        // The working days late the server charged for (late_days): closed
        // weekend days and holidays do not count, so recounting calendar
        // days here would disagree with the fine and the per-working-day
        // rate the settings show.
        const lateDays = loan.late_days ?? 0;
        // The fine is the one the server charged (fine_amount); with
        // currency fines off a late return suspends or warns instead, and
        // claims no "Rp0" fine.
        const detail =
          lateDays <= 0
            ? t("basket.returnedOnTime")
            : loan.fine_amount > 0
              ? t("basket.returnedLateFine", {
                  days: lateDays,
                  amount: formatCurrency(loan.fine_amount, "IDR", { locale }),
                })
              : t("basket.returnedLate", { days: lateDays });
        feedback.playSuccess();
        setBasket((prev) => ({
          ...prev,
          return: recordBasketResult(prev.return, {
            barcode: code,
            title,
            state: "done",
            detail,
            memberUserId: loan.member_user_id,
          }),
        }));
      } catch (error) {
        await recordRefusal("return", code, error);
      }
    },
    [returnByBarcode, titleName, feedback, recordRefusal, t, locale],
  );

  const addRenewScan = useCallback(
    async (code: string) => {
      try {
        const loan = await renewByBarcode.mutateAsync({ barcode: code });
        const title = await titleName.mutateAsync(loan.title_id).catch(() => code);
        feedback.playSuccess();
        setBasket((prev) => ({
          ...prev,
          renew: recordBasketResult(prev.renew, {
            barcode: code,
            title,
            state: "done",
            detail: t("basket.renewedUntil", { date: formatDate(loan.due_on, { locale }) }),
            memberUserId: loan.member_user_id,
          }),
        }));
      } catch (error) {
        await recordRefusal("renew", code, error);
      }
    },
    [renewByBarcode, titleName, feedback, recordRefusal, t, locale],
  );

  const handleScan = useCallback(
    (event: BarcodeScanEvent) => {
      const code = event.code.trim();
      if (!code || scanning) return;
      setScanError("");
      setScanning(true);
      // Only lending needs to know who is borrowing first; a return or a
      // renewal is identified by the book's barcode alone.
      const run =
        mode === "return"
          ? addReturnScan(code)
          : mode === "renew"
            ? addRenewScan(code)
            : member
              ? addBorrowScan(code)
              : addMemberByScan(code);
      void run.finally(() => {
        setScanning(false);
      });
    },
    [scanning, member, mode, addMemberByScan, addBorrowScan, addReturnScan, addRenewScan],
  );

  const confirmBorrow = useCallback(async () => {
    if (!member) return;
    // Oldest scan first: the server spends the member's remaining quota in
    // request order, so the books scanned first must get it.
    const pending = confirmableItemsInScanOrder(basket.borrow);
    if (pending.length === 0) return;
    try {
      const result = await batchBorrow.mutateAsync({
        member_user_id: member.userId,
        barcodes: pending.map((item) => item.barcode),
      });
      setBasket((prev) => {
        let next = prev.borrow;
        for (const rejected of result.rejected) {
          const detail = apiErrorMessage(rejected.code, rejected.reason);
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
    borrowingStatus: member ? (borrowingStatus.data ?? null) : null,
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
