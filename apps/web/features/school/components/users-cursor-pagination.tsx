import { Button } from "@newsekolah/ui";
import type { ReactElement } from "react";

interface UsersCursorPaginationProps {
  hasPrevious: boolean;
  hasNext: boolean;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
}

/** Cursor controls are separate from DataTable because the API has no page count. */
export function UsersCursorPagination({
  hasPrevious,
  hasNext,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
}: UsersCursorPaginationProps): ReactElement {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" size="sm" disabled={!hasPrevious} onClick={onPrevious}>
        {previousLabel}
      </Button>
      <Button variant="secondary" size="sm" disabled={!hasNext} onClick={onNext}>
        {nextLabel}
      </Button>
    </div>
  );
}
