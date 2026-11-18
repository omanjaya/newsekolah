"use client";

import { Button, PageShell, StatePage } from "@newsekolah/ui";
import { House } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useDocumentTitle } from "../lib/page-title";

import { HistoryBackButton } from "./history-back-button";

export interface ModuleUnavailablePageProps {
  /** Fills the viewport, for a route without the app shell (a kiosk). */
  fullScreen?: boolean;
}

/**
 * Rendered in place of a page whose feature module the school has switched
 * off. Distinct from `ForbiddenPage`: the reader's permissions are fine, the
 * feature simply is not part of their school's plan. The code is the one
 * the API answers with, so support can tell the two apart. Drawn and names
 * the browser tab as ForbiddenPage does.
 */
export function ModuleUnavailablePage({
  fullScreen = false,
}: ModuleUnavailablePageProps): ReactElement {
  const t = useTranslations("app.moduleUnavailable");
  useDocumentTitle(t("title"));

  const state = (
    <StatePage
      fullScreen={fullScreen}
      kind="module-unavailable"
      title={t("title")}
      description={t("body")}
      code="MODULE_DISABLED"
      action={
        <Button asChild icon={<House />}>
          <Link href="/dashboard">{t("backHome")}</Link>
        </Button>
      }
      secondaryAction={<HistoryBackButton label={t("back")} />}
    />
  );
  return fullScreen ? state : <PageShell>{state}</PageShell>;
}
