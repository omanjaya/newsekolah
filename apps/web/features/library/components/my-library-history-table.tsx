"use client";

import type { Locale } from "@newsekolah/i18n";
import { Card, List, ListRow, SectionHeader } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { LibraryLoan } from "../api";
import { formatShortDateRange } from "../lib/short-date";

/**
 * The reader's own closed loans as a short list, newest first and capped
 * to the 10 most recent: the title, then the loan's span on one line
 * ("25 Sep - 2 Okt"). A book still out belongs to "Sedang dipinjam" above,
 * so it is left out here.
 */
export function MyLibraryHistoryTable({
  history,
  locale,
  today,
}: {
  history: LibraryLoan[];
  locale: Locale;
  today?: string;
}): ReactElement {
  const t = useTranslations("app.library.me");
  const items = history.filter((loan) => loan.returned_at).slice(0, 10);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={t("history")} />
      {items.length === 0 ? (
        <p className="text-body-sm text-fg-muted">{t("noHistory")}</p>
      ) : (
        <Card>
          <List aria-label={t("history")}>
            {items.map((loan) => (
              <ListRow
                key={loan.id}
                title={loan.title_name ?? t("titleUnavailable")}
                meta={formatShortDateRange(loan.borrowed_at, loan.returned_at ?? "", locale, {
                  today,
                })}
              />
            ))}
          </List>
        </Card>
      )}
    </section>
  );
}
