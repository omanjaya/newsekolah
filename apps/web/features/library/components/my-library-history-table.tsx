"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { LibraryLoan } from "../api";

/**
 * The reader's own closed loans as the shared `Table`
 * (docs/05-shared-components.md: the library module already prefers this
 * hand-rolled primitive over the TanStack `DataTable` for a static list
 * like this one) -- title, borrowed date, and returned date, newest
 * first, capped to the 10 most recent like the row list it replaces.
 */
export function MyLibraryHistoryTable({
  history,
  locale,
}: {
  history: LibraryLoan[];
  locale: Locale;
}): ReactElement {
  const t = useTranslations("app.library.me");
  const items = history.slice(0, 10);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[15px] font-semibold text-fg">{t("history")}</h2>
      {items.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("noHistory")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("historyTable.columns.title")}</TableHead>
              <TableHead scope="col">{t("historyTable.columns.borrowedOn")}</TableHead>
              <TableHead scope="col">{t("historyTable.columns.returnedOn")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((loan) => (
              <TableRow key={loan.id}>
                <TableCell>{loan.title_name ?? loan.title_id}</TableCell>
                <TableCell className="text-fg-muted">
                  {formatDate(loan.borrowed_at, { locale })}
                </TableCell>
                <TableCell className="text-fg-muted">
                  {loan.returned_at ? formatDate(loan.returned_at, { locale }) : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
