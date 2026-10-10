"use client";

import { useCallback } from "react";

import { useUrlState } from "./use-url-state";

const isPageParam = (value: string): boolean => /^[1-9]\d{0,5}$/.test(value);

export interface OffsetPage {
  /** Current page, 1-based. */
  page: number;
  /** Rows per page; pass as the API `limit`. */
  limit: number;
  /** Rows to skip; pass as the API `offset`. */
  offset: number;
  /** True when the page came back full, i.e. another page may exist. */
  hasNextFor: (itemCount: number) => boolean;
  hasPrevious: boolean;
  goPrevious: () => void;
  goNext: () => void;
  /** Back to page 1 without adding a history entry. */
  resetPage: () => void;
  /**
   * Wraps a filter or search setter so changing it also returns to page 1;
   * a stale page past the end of the new result would otherwise look empty.
   */
  resetting: <A extends unknown[]>(setter: (...args: A) => void) => (...args: A) => void;
}

/**
 * Offset paging for list APIs without a total count, kept in the `page` URL
 * param (1-based) so a reload or shared link lands on the same page. Give
 * each list its own `param` when several lists share one route (tabs), so
 * one tab's page number never leaks into another.
 */
export function useOffsetPage(pageSize: number, param = "page"): OffsetPage {
  const [raw, setRaw, replaceRaw] = useUrlState<string>(param, isPageParam, "1");
  const page = Number(raw);

  const resetPage = useCallback(() => {
    replaceRaw("1");
  }, [replaceRaw]);

  const resetting = useCallback(
    <A extends unknown[]>(setter: (...args: A) => void) =>
      (...args: A) => {
        setter(...args);
        resetPage();
      },
    [resetPage],
  );

  return {
    page,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    hasNextFor: (itemCount) => itemCount >= pageSize,
    hasPrevious: page > 1,
    goPrevious: () => {
      setRaw(String(Math.max(1, page - 1)));
    },
    goNext: () => {
      setRaw(String(page + 1));
    },
    resetPage,
    resetting,
  };
}
