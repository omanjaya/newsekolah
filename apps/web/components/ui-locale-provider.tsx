"use client";

import { UiLabelsProvider } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

/** Shared controls inherit the application locale, including legacy call sites. */
export function UiLocaleProvider({ children }: { children: ReactNode }): ReactElement {
  const t = useTranslations("common.actions");
  const table = useTranslations("app.shell.table");
  return (
    <UiLabelsProvider
      labels={{
        dialogClose: t("close"),
        sheetClose: t("close"),
        tableSelectedRows: (count) => table("selectedRows", { count }),
        tableSelectAllRows: table("selectAllRows"),
        tableSelectRow: table("selectRow"),
      }}
    >
      {children}
    </UiLabelsProvider>
  );
}
