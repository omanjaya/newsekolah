"use client";

import { formatCurrency } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  TextLink,
  domainIcons,
} from "@newsekolah/ui";
import { BookCheck, Bookmark, Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { businessNow } from "../../../lib/simulation/clock";
import type { LibraryLoan, LibraryReservation } from "../api";
import { formatShortDate, formatShortDateRange } from "../lib/short-date";
import { LOAN_STATUS_TONE, toneOf } from "../lib/status-tones";
import type { LibraryViolation } from "../violations-api";

import { LibraryTitleName } from "./library-title-name";
import { ReservationStatusBadge, usePickupDeadlineText } from "./reservation-status";

/** Closed loans, newest first as the API returns them: title, the loan's span and how it ended. */
export function MemberPastLoans({
  loans,
  locale,
  timeZone,
  today,
}: {
  loans: LibraryLoan[];
  locale: Locale;
  /** The school's zone: a borrow or return time is a day on its calendar. */
  timeZone: string | undefined;
  today: string;
}): ReactElement {
  const tHistory = useTranslations("app.library.memberHistory");
  const t = useTranslations("app.library.memberDetail");
  if (loans.length === 0) {
    return (
      <Card>
        <EmptyState icon={<BookCheck aria-hidden="true" />} title={t("noHistory")} />
      </Card>
    );
  }
  return (
    <List framed>
      {loans.map((loan) => (
        <ListRow
          key={loan.id}
          title={<LibraryTitleName titleId={loan.title_id} />}
          meta={
            loan.returned_at
              ? formatShortDateRange(loan.borrowed_at, loan.returned_at, locale, {
                  timeZone,
                  today,
                })
              : formatShortDate(loan.borrowed_at, locale, { timeZone, today })
          }
          trailing={
            <Badge tone={toneOf(LOAN_STATUS_TONE, loan.status)}>
              {tHistory(`status.${loan.status}`)}
            </Badge>
          }
        />
      ))}
    </List>
  );
}

/** What the member still owes, item by item, with the total and the way to settle it. */
export function MemberFines({
  violations,
  total,
  locale,
  manageHref,
}: {
  violations: LibraryViolation[];
  total: number;
  locale: Locale;
  manageHref?: string;
}): ReactElement {
  const tHistory = useTranslations("app.library.memberHistory");
  const t = useTranslations("app.library.memberDetail");
  if (violations.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Scale aria-hidden="true" />}
          tone="success"
          title={t("noFinesTitle")}
          description={t("noFinesBody")}
        />
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader
        action={
          manageHref ? <TextLink href={manageHref}>{tHistory("fines.manage")}</TextLink> : undefined
        }
      >
        <CardTitle as="h2">
          {t("finesTotal", { amount: formatCurrency(total, "IDR", { locale }) })}
        </CardTitle>
      </CardHeader>
      <List>
        {violations.map((violation) => (
          <ListRow
            key={violation.id}
            title={tHistory(`fines.kind.${violation.kind}`)}
            trailing={
              <span className="text-body font-semibold tabular-nums text-fg">
                {formatCurrency(violation.amount, "IDR", { locale })}
              </span>
            }
          />
        ))}
      </List>
    </Card>
  );
}

/**
 * The member's holds: which title, where they stand in its queue, and for
 * a ready hold until when it is kept. The deadline rides in the meta line,
 * which wraps; the trailing slot keeps only the badge, as it cannot shrink.
 */
export function MemberReservations({
  reservations,
  locale,
  timeZone,
  today,
}: {
  reservations: LibraryReservation[];
  locale: Locale;
  timeZone: string | undefined;
  today?: string;
}): ReactElement {
  const t = useTranslations("app.library.memberDetail");
  const now = businessNow();
  const deadlineText = usePickupDeadlineText({ locale, timeZone, today });
  if (reservations.length === 0) {
    return (
      <Card>
        <EmptyState icon={<Bookmark aria-hidden="true" />} title={t("noReservations")} />
      </Card>
    );
  }
  return (
    <List framed>
      {reservations.map((reservation) => (
        <ListRow
          key={reservation.id}
          leading={<domainIcons.library className="size-5 text-fg-muted" aria-hidden="true" />}
          title={<LibraryTitleName titleId={reservation.title_id} />}
          href={`/library/catalogue/${reservation.title_id}`}
          meta={deadlineText(reservation, now)}
          trailing={<ReservationStatusBadge reservation={reservation} now={now} />}
        />
      ))}
    </List>
  );
}
