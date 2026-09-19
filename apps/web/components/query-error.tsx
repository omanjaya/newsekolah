"use client";

import { Alert, Button } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/** Keep a failed read distinct from both an empty result and a pending request. */
export function QueryError({
  retry,
  className,
}: {
  retry: () => unknown;
  className?: string;
}): ReactElement {
  const t = useTranslations("common");
  const errors = useTranslations("errors");
  return (
    <Alert variant="warning" title={t("states.error")} className={className}>
      <p>{errors("UNKNOWN")}</p>
      <Button variant="secondary" size="sm" onClick={() => void retry()}>
        {t("actions.retry")}
      </Button>
    </Alert>
  );
}
