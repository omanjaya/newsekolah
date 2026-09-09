"use client";

import { Button, EmptyState } from "@newsekolah/ui";
import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/** Served by the service worker (app/sw.ts) as the navigation fallback when there is no network. */
export default function OfflinePage(): ReactElement {
  const t = useTranslations("app.offlinePage");

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon={<WifiOff aria-hidden="true" />}
        title={t("title")}
        description={t("body")}
        action={
          <Button
            onClick={() => {
              window.location.reload();
            }}
          >
            {t("retry")}
          </Button>
        }
      />
    </div>
  );
}
