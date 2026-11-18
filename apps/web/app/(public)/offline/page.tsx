"use client";

import { Button, StatePage } from "@newsekolah/ui";
import { RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/** Served by the service worker (app/sw.ts) as the navigation fallback when there is no network. */
export default function OfflinePage(): ReactElement {
  const t = useTranslations("app.offlinePage");

  return (
    <StatePage
      kind="offline"
      title={t("title")}
      description={t("body")}
      action={
        <Button
          icon={<RotateCw />}
          onClick={() => {
            window.location.reload();
          }}
        >
          {t("retry")}
        </Button>
      }
    />
  );
}
