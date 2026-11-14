"use client";

import { Button, StatePage } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useDocumentTitle } from "../lib/page-title";

import { HistoryBackButton } from "./history-back-button";

/**
 * RouteGuard renders this in place (no navigation) when `me` lacks the
 * page's required permission. It names the browser tab after the state,
 * since the page it stands in for never mounts to name it.
 */
export function ForbiddenPage(): ReactElement {
  const t = useTranslations("app.forbidden");
  useDocumentTitle(t("title"));

  return (
    <StatePage
      kind="forbidden"
      title={t("title")}
      description={t("body")}
      code="403"
      action={
        <Button asChild>
          <Link href="/dashboard">{t("backHome")}</Link>
        </Button>
      }
      secondaryAction={<HistoryBackButton label={t("back")} />}
    />
  );
}
