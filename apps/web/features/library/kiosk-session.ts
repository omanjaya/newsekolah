"use client";

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { useApiClient } from "../../lib/api/client";

import { type LibraryLoan, useLibraryPolicyQuery, useMemberLoanHistoryQuery } from "./api";

/** A crude but sufficient check: the member card's barcode is the member's own user ID. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeMemberCard(code: string): boolean {
  return UUID_PATTERN.test(code.trim());
}

export interface KioskLoan {
  loan: LibraryLoan;
  titleName: string;
}

export interface KioskMemberSession {
  isLoading: boolean;
  activeLoans: KioskLoan[];
  activeLoanCount: number;
  maxActiveLoans: number | undefined;
  /** Resolves a scanned copy barcode to one of this member's active loans, if it is one. */
  findLoanForBarcode: (barcode: string) => LibraryLoan | undefined;
}

/**
 * Everything the kiosk needs to know about the reader currently at the
 * station: their active loans with readable title names (the loan record
 * itself only carries `title_id`), and a barcode-to-loan lookup so a
 * scanned copy can be matched to one of this member's own loans for a
 * return. There is no dedicated "copy by barcode" endpoint, so the lookup
 * is built client-side from the same title/copy endpoints the catalogue
 * screens already use, scoped to the handful of titles this member has out.
 */
export function useKioskMemberSession(memberUserId: string | null): KioskMemberSession {
  const client = useApiClient();
  const policy = useLibraryPolicyQuery();
  const loanHistory = useMemberLoanHistoryQuery(memberUserId ?? "");

  const activeLoanRecords = useMemo(
    () => (loanHistory.data?.data ?? []).filter((loan) => loan.status === "active"),
    [loanHistory.data],
  );
  const titleIds = useMemo(
    () => Array.from(new Set(activeLoanRecords.map((loan) => loan.title_id))),
    [activeLoanRecords],
  );

  const titleQueries = useQueries({
    queries: titleIds.map((titleId) => ({
      queryKey: ["library", "titles", "detail", titleId],
      queryFn: () => client.GET("/v1/library/titles/{titleId}", { params: { path: { titleId } } }),
      enabled: Boolean(memberUserId),
    })),
  });
  const copyQueries = useQueries({
    queries: titleIds.map((titleId) => ({
      queryKey: ["library", "titles", titleId, "copies"],
      queryFn: () =>
        client.GET("/v1/library/titles/{titleId}/copies", { params: { path: { titleId } } }),
      enabled: Boolean(memberUserId),
    })),
  });

  const titleNameById = useMemo(() => {
    const map = new Map<string, string>();
    titleIds.forEach((titleId, index) => {
      const title = titleQueries[index]?.data?.title;
      if (title) map.set(titleId, title);
    });
    return map;
  }, [titleIds, titleQueries]);

  const barcodeByCopyId = useMemo(() => {
    const map = new Map<string, string>();
    titleIds.forEach((_titleId, index) => {
      for (const copy of copyQueries[index]?.data?.data ?? []) {
        map.set(copy.id, copy.barcode);
      }
    });
    return map;
  }, [titleIds, copyQueries]);

  const activeLoans = useMemo(
    () =>
      activeLoanRecords.map((loan) => ({
        loan,
        titleName: titleNameById.get(loan.title_id) ?? loan.title_id,
      })),
    [activeLoanRecords, titleNameById],
  );

  const isLoading =
    loanHistory.isLoading ||
    titleQueries.some((query) => query.isLoading) ||
    copyQueries.some((query) => query.isLoading);

  return {
    isLoading,
    activeLoans,
    activeLoanCount: activeLoanRecords.length,
    maxActiveLoans: policy.data?.max_active_loans,
    findLoanForBarcode: (barcode) =>
      activeLoanRecords.find((loan) => barcodeByCopyId.get(loan.copy_id) === barcode),
  };
}
