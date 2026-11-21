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

/**
 * What the member still owes, item by item, with the total and the way to
 * settle it. An unsettled suspension is listed apart: it is served by its
 * dates, not paid, so it never reads as money owed, yet staff still reach
 * it here to settle it.
 */
export function MemberFines({
  violations,
  suspensions = [],
  total,
  locale,
  manageHref,
}: {
  violations: LibraryViolation[];
  /** Unsettled suspensions: listed without an amount, outside the total. */
  suspensions?: LibraryViolation[];
  total: number;
  locale: Locale;
  manageHref?: string;
}): ReactElement {
  const tHistory = useTranslations("app.library.memberHistory");
  const t = useTranslations("app.library.memberDetail");
  const tViolations = useTranslations("app.library.violations");
  if (violations.length === 0 && suspensions.length === 0) {
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
  const manageLink = manageHref ? (
    <TextLink href={manageHref}>{tHistory("fines.manage")}</TextLink>
  ) : undefined;
  return (
    <div className="flex flex-col gap-3">
      {violations.length > 0 && (
        <Card>
          <CardHeader action={manageLink}>
            <CardTitle as="h2">
              {total > 0
                ? t("finesTotal", { amount: formatCurrency(total, "IDR", { locale }) })
                : t("finesOutstanding")}
            </CardTitle>
          </CardHeader>
          <List>
            {violations.map((violation) => (
              <ListRow
                key={violation.id}
                title={tHistory(`fines.kind.${violation.kind}`)}
                trailing={
                  // A book to replace is owed as a book, not as money.
                  <span className="text-body font-semibold tabular-nums text-fg">
                    {violation.penalty === "replace_book"
                      ? tViolations("penalties.replace_book")
                      : formatCurrency(violation.amount, "IDR", { locale })}
                  </span>
                }
              />
            ))}
          </List>
        </Card>
      )}
      {suspensions.length > 0 && (
        <Card>
          {/* The manage link sits on the first card only. */}
          <CardHeader action={violations.length > 0 ? undefined : manageLink}>
            <CardTitle as="h2">{t("suspensionsOutstanding")}</CardTitle>
          </CardHeader>
          <List>
            {suspensions.map((suspension) => (
              <ListRow
                key={suspension.id}
                title={tHistory(`fines.kind.${suspension.kind}`)}
                meta={
                  suspension.suspend_days > 0
                    ? tViolations("suspendDaysValue", { days: suspension.suspend_days })
                    : undefined
                }
                trailing={
                  <span className="text-body-sm text-fg-muted">
                    {tViolations("penalties.suspend")}
                  </span>
                }
              />
            ))}
          </List>
        </Card>
      )}
    </div>
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
