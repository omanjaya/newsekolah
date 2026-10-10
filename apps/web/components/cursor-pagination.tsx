"use client";

import { Button } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

interface CursorPaginationProps {
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** Overrides the shared "Previous" label. */
  previousLabel?: string;
  /** Overrides the shared "Next" label. */
  nextLabel?: string;
}

/**
 * Previous/next controls for list APIs that page by offset or cursor and
 * report no total, kept apart from DataTable because there is no page count
 * to show. Pair with `useOffsetPage` and `DataTable mode="cursor"`.
 */
export function CursorPagination({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
}: CursorPaginationProps): ReactElement {
  const t = useTranslations("app.common.pagination");
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" size="sm" disabled={!hasPrevious} onClick={onPrevious}>
        {previousLabel ?? t("previous")}
      </Button>
      <Button variant="secondary" size="sm" disabled={!hasNext} onClick={onNext}>
        {nextLabel ?? t("next")}
      </Button>
    </div>
  );
}
