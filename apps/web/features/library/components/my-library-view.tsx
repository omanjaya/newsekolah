"use client";

import { formatCurrency } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Alert,
  Button,
  DataList,
  DataListItem,
  EmptyState,
  HeroCard,
  SectionHeader,
  SkeletonDetail,
  TextLink,
  domainIcons,
} from "@newsekolah/ui";
import { IdCard, Search } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useCan } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { todayInZone } from "../../../lib/tenant-date";
import type { LibraryLoan } from "../api";
import { classifyDueDate, overdueDays } from "../lib/due-date";
import { shownReservationStatus } from "../lib/reservation-pickup";
import { formatShortDay } from "../lib/short-date";
import { isUnpaidFine, unpaidFineTotal } from "../lib/violations";
import { type LibraryMyProfile, useMyLibraryProfileQuery } from "../me-api";
import { useTenantTimeZone } from "../use-tenant-timezone";

import { MyLibraryHistoryTable } from "./my-library-history-table";
import { MyLibraryLoanRow } from "./my-library-loan-row";
import { MyLibraryReservations } from "./my-library-reservations";
import { countMyLibraryTiles } from "./my-library-tiles";

/** The public catalogue, where a reader without the staff catalogue looks books up. */
const CATALOGUE_HREF = "/opac";

/**
 * A student's own library page, made for a phone (docs/07-ui-ux.md
 * section 0): a hero card that answers "what do I owe the library" first
 * (a late book, else the next due date, else a way to the catalogue),
 * unpaid fines, the books out now with their renew button and the reason
 * when renewing is refused, the closed loans as a short list, and the
 * self-service holds. Someone who registers members (a librarian, an
 * admin) and has no membership of their own is sent to the members page
 * instead of being told to ask the librarian.
 */
export function MyLibraryView(): ReactElement {
  const t = useTranslations("app.library.me");
  const locale = useLocale() as Locale;
  const timeZone = useTenantTimeZone();
  const today = todayInZone(timeZone);
  const { data, isLoading, isError, error, refetch } = useMyLibraryProfileQuery();
  const canRegister = useCan("manage_library_members");

  if (isError && !data) {
    return (
      <AppPage variant="narrow">
        <QueryError retry={() => refetch()} error={error} />
      </AppPage>
    );
  }

  if (isLoading || !data) {
    return (
      <AppPage variant="narrow">
        <SkeletonDetail aria-busy="true" />
      </AppPage>
    );
  }

  if (!data.member) {
    return (
      <AppPage variant="narrow">
        <EmptyState
          variant="framed"
          icon={<domainIcons.library aria-hidden="true" />}
          title={t("notMemberTitle")}
          description={canRegister ? t("notMemberBodyStaff") : t("notMemberBody")}
          action={
            canRegister ? (
              <Button asChild variant="secondary" icon={<IdCard />}>
                <Link href="/library/members">{t("openMembers")}</Link>
              </Button>
            ) : (
              <Button asChild variant="secondary" icon={<Search />}>
                <Link href={CATALOGUE_HREF}>{t("browseCatalogue")}</Link>
              </Button>
            )
          }
          secondaryAction={
            canRegister ? (
              <TextLink href={CATALOGUE_HREF}>{t("browseCatalogue")}</TextLink>
            ) : undefined
          }
        />
      </AppPage>
    );
  }

  // Only an unpaid fine with an amount is money owed: a warning or a
  // suspension carries none and is not listed as a fine.
  const unpaidViolations = data.violations.filter(isUnpaidFine);
  const unpaidTotal = unpaidFineTotal(unpaidViolations);
  const counts = countMyLibraryTiles(data.active_loans, data.reservations, today);
  const activeLoans = [...data.active_loans].sort((a, b) => a.due_on.localeCompare(b.due_on));

  return (
    <AppPage variant="narrow">
      <MyLibraryHero
        loans={activeLoans}
        counts={counts}
        today={today}
        locale={locale}
        reservations={data.reservations}
      />

      {unpaidViolations.length > 0 && (
        <Alert
          tone="warning"
          title={t("unpaidFinesTotal", {
            amount: formatCurrency(unpaidTotal, "IDR", { locale }),
          })}
        >
          <p className="sr-only">{t("unpaidFines")}</p>
          <DataList>
            {unpaidViolations.map((violation) => (
              <DataListItem key={violation.id} label={t(`violationKind.${violation.kind}`)}>
                <span className="tabular-nums">
                  {formatCurrency(violation.amount, "IDR", { locale })}
                </span>
              </DataListItem>
            ))}
          </DataList>
        </Alert>
      )}

      {/* With nothing out, the hero already says so ("Belum ada buku yang
          dipinjam") and points at the catalogue; a second empty card for
          the same fact would only push the history down. */}
      {activeLoans.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title={t("activeLoans")} count={activeLoans.length} />
          <ul className="flex flex-col gap-3" data-testid="my-library-loan-cards">
            {activeLoans.map((loan) => (
              <MyLibraryLoanRow
                key={loan.id}
                loan={loan}
                today={today}
                locale={locale}
                maxRenewals={data.max_renewals}
              />
            ))}
          </ul>
        </section>
      )}

      <MyLibraryHistoryTable
        history={data.history}
        locale={locale}
        timeZone={timeZone}
        today={today}
      />

      <MyLibraryReservations
        reservations={data.reservations}
        bookingEnabled={data.booking_enabled ?? false}
        locale={locale}
        timeZone={timeZone}
        today={today}
      />
    </AppPage>
  );
}

/**
 * The first thing a student sees: a late book (warning, with how late and
 * which), else when the next book is due and how many are out, else a
 * calm card that points at the catalogue.
 */
function MyLibraryHero({
  loans,
  counts,
  today,
  locale,
  reservations,
}: {
  loans: LibraryLoan[];
  counts: ReturnType<typeof countMyLibraryTiles>;
  today: string;
  locale: Locale;
  reservations: LibraryMyProfile["reservations"];
}): ReactElement {
  const t = useTranslations("app.library.me.hero");
  const tMe = useTranslations("app.library.me");
  const browse = <TextLink href={CATALOGUE_HREF}>{tMe("browseCatalogue")}</TextLink>;
  const now = businessNow();
  const ready = reservations.filter(
    (reservation) => shownReservationStatus(reservation, now) === "ready",
  ).length;

  const overdue = loans.filter((loan) => classifyDueDate(loan.due_on, today) === "overdue");
  const latest = overdue[0];
  if (latest) {
    return (
      // No way to the catalogue here: the one thing to do is return the
      // book. The tone is "danger", as the due badges show lateness.
      <HeroCard
        tone="danger"
        eyebrow={t("overdueEyebrow")}
        title={t("overdueTitle", {
          count: overdue.length,
          days: overdueDays(latest.due_on, today),
        })}
        meta={t("overdueMeta", { title: latest.title_name ?? tMe("titleUnavailable") })}
        chip={t("overdueChip")}
        data-testid="my-library-hero"
      />
    );
  }

  if (counts.nextDueOn) {
    return (
      <HeroCard
        eyebrow={t("nextDueEyebrow")}
        title={t("nextDueTitle", { date: formatShortDay(counts.nextDueOn, locale, { today }) })}
        meta={t("nextDueMeta", { count: counts.activeLoans })}
        chip={ready > 0 ? t("readyChip", { count: ready }) : undefined}
        secondaryAction={browse}
        data-testid="my-library-hero"
      />
    );
  }

  return (
    <HeroCard
      tone="neutral"
      eyebrow={t("idleEyebrow")}
      title={t("idleTitle")}
      meta={t("idleMeta")}
      chip={ready > 0 ? t("readyChip", { count: ready }) : undefined}
      action={
        <Button asChild icon={<Search />}>
          <Link href={CATALOGUE_HREF}>{tMe("browseCatalogue")}</Link>
        </Button>
      }
      data-testid="my-library-hero"
    />
  );
}
