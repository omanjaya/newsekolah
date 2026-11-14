"use client";

import type { Locale } from "@newsekolah/i18n";
import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  TextLink,
  domainIcons,
} from "@newsekolah/ui";
import { BookCheck, Flame } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { todayInZone } from "../../../lib/tenant-date";
import { useDirectoryNames } from "../../reference/directory-names";
import type { LibraryLoan, LibraryMostBorrowedTitle } from "../api";
import { formatShortDate } from "../lib/short-date";
import { useTenantTimeZone } from "../use-tenant-timezone";

import { DueBadge } from "./due-badge";
import { LibraryTitleName } from "./library-title-name";

/**
 * The dashboard's three lists, as cards in the dashboard grid: the most
 * borrowed titles (beside the trend), then the latest loans and the
 * longest overdue, each loan naming its borrower and opening their page.
 */
export function DashboardActivityLists({
  latestLoans,
  longestOverdue,
  popularTitles,
}: {
  latestLoans: LibraryLoan[];
  longestOverdue: LibraryLoan[];
  popularTitles: LibraryMostBorrowedTitle[];
}): ReactElement {
  const t = useTranslations("app.library.dashboard");
  const locale = useLocale() as Locale;
  const today = todayInZone(useTenantTimeZone());
  const names = useDirectoryNames([
    ...latestLoans.map((loan) => loan.member_user_id),
    ...longestOverdue.map((loan) => loan.member_user_id),
  ]);
  const borrower = (loan: LibraryLoan) =>
    names.get(loan.member_user_id)?.name ?? t("unknownMember");

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("popularTitles")}</CardTitle>
        </CardHeader>
        {popularTitles.length === 0 ? (
          <EmptyState icon={<Flame aria-hidden="true" />} title={t("noPopularTitles")} />
        ) : (
          <List>
            {popularTitles.map((entry) => (
              <ListRow
                key={entry.title.id}
                title={entry.title.title}
                href={`/library/catalogue/${entry.title.id}`}
                trailing={
                  <span className="text-body-sm tabular-nums text-fg-muted">
                    {t("loanCount", { count: entry.loan_count })}
                  </span>
                }
              />
            ))}
          </List>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("latestLoans")}</CardTitle>
        </CardHeader>
        {latestLoans.length === 0 ? (
          <EmptyState
            icon={<domainIcons.library aria-hidden="true" />}
            title={t("noLatestLoans")}
            action={<TextLink href="/library/desk">{t("openDesk")}</TextLink>}
          />
        ) : (
          <List>
            {latestLoans.map((loan) => (
              <ListRow
                key={loan.id}
                title={<LibraryTitleName titleId={loan.title_id} />}
                meta={`${borrower(loan)} · ${formatShortDate(loan.borrowed_at, locale, { today })}`}
                href={`/library/members/${loan.member_user_id}`}
              />
            ))}
          </List>
        )}
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          action={<TextLink href="/library/desk#desk-overdue">{t("followUpAll")}</TextLink>}
        >
          <CardTitle as="h2">{t("longestOverdue")}</CardTitle>
        </CardHeader>
        {longestOverdue.length === 0 ? (
          <EmptyState
            icon={<BookCheck aria-hidden="true" />}
            tone="success"
            title={t("noOverdue")}
          />
        ) : (
          <List>
            {longestOverdue.map((loan) => (
              <ListRow
                key={loan.id}
                title={<LibraryTitleName titleId={loan.title_id} />}
                meta={borrower(loan)}
                href={`/library/members/${loan.member_user_id}`}
                trailing={<DueBadge dueOn={loan.due_on} today={today} locale={locale} />}
              />
            ))}
          </List>
        )}
      </Card>
    </>
  );
}
