"use client";

import { Button, StatePage } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { HistoryBackButton } from "./history-back-button";

/** RouteGuard renders this in place (no navigation) when `me` lacks the page's required permission. */
export function ForbiddenPage(): ReactElement {
  const t = useTranslations("app.forbidden");

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
