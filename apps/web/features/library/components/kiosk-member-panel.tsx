import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Skeleton } from "@newsekolah/ui";
import type { ReactElement } from "react";

import type { KioskMemberSession } from "../kiosk-session";

export interface KioskMemberPanelProps {
  session: KioskMemberSession;
  locale: Locale;
  dueOnLabel: string;
  limitLabel: (count: number, max: number) => string;
  emptyLabel: string;
}

/**
 * The reader's own loans, shown large enough to read from the reading-room
 * floor: title and due date, plus how many of their loan slots are used.
 */
export function KioskMemberPanel({
  session,
  locale,
  dueOnLabel,
  limitLabel,
  emptyLabel,
}: KioskMemberPanelProps): ReactElement {
  if (session.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[20px] font-medium text-fg">
        {session.maxActiveLoans !== undefined
          ? limitLabel(session.activeLoanCount, session.maxActiveLoans)
          : null}
      </p>
      {session.activeLoans.length === 0 ? (
        <p className="text-[20px] text-fg-muted">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {session.activeLoans.map(({ loan, titleName }) => (
            <li
              key={loan.id}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-sm border border-border bg-surface p-4"
            >
              <span className="text-[20px] font-medium text-fg">{titleName}</span>
              <span className="text-[16px] text-fg-muted">
                {dueOnLabel} {formatDate(loan.due_on, { locale })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
