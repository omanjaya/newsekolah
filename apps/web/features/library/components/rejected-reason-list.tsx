"use client";

import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";

/** One row a batch call (class loan, class return, bulk registration) left out. */
export interface RejectedReasonItem {
  key: string;
  /** Who or what was left out: a student's name or a barcode. */
  label: string;
  /** The stable API error code, translated through the `errors.*` catalog. */
  code: string;
  /** The server's own text, shown only when the catalog does not know `code`. */
  reason: string;
}

/**
 * The "label: reason" list inside a batch result's Alert. The reason is the
 * translated error code, so a librarian never reads the server's English
 * text in the Indonesian UI.
 */
export function RejectedReasonList({
  items,
  className = "flex flex-col gap-1",
}: {
  items: readonly RejectedReasonItem[];
  className?: string;
}): ReactElement {
  const apiErrorMessage = useApiErrorMessage();
  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={item.key}>
          {item.label}: {apiErrorMessage(item.code, item.reason)}
        </li>
      ))}
    </ul>
  );
}
