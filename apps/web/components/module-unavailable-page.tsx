"use client";

import { Button, StatePage } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useDocumentTitle } from "../lib/page-title";

import { HistoryBackButton } from "./history-back-button";

/**
 * Rendered in place of a page whose feature module the school has switched
 * off. Distinct from `ForbiddenPage`: the reader's permissions are fine, the
 * feature simply is not part of their school's plan. The code is the one
 * the API answers with, so support can tell the two apart. Names the
 * browser tab after the state, as ForbiddenPage does.
 */
export function ModuleUnavailablePage(): ReactElement {
  const t = useTranslations("app.moduleUnavailable");
  useDocumentTitle(t("title"));

  return (
    <StatePage
      kind="module-unavailable"
      title={t("title")}
      description={t("body")}
      code="MODULE_DISABLED"
      action={
        <Button asChild>
          <Link href="/dashboard">{t("backHome")}</Link>
        </Button>
      }
      secondaryAction={<HistoryBackButton label={t("back")} />}
    />
  );
}
