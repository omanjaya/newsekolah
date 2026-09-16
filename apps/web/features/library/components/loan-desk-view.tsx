"use client";

import { PageHeader } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { DeskBorrowPanel } from "./desk-borrow-panel";
import { DeskOverdueTable } from "./desk-overdue-table";
import { DeskReturnPanel } from "./desk-return-panel";

/**
 * The librarian's circulation desk: search a member by name to lend books,
 * scan a barcode to return one, and follow up on what is overdue. Every
 * action here resolves people and copies by search or scan, never by
 * pasting an id.
 */
export function LoanDeskView(): ReactElement {
  const t = useTranslations("app.library.desk");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DeskBorrowPanel />
        <DeskReturnPanel />
      </div>

      <DeskOverdueTable />
    </div>
  );
}
