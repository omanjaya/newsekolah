"use client";

import { Button, EmptyState } from "@newsekolah/ui";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactElement {
  const t = useTranslations("app.error");
  const tActions = useTranslations("common.actions");

  useEffect(() => {
    console.error(error);
  }, [error]);

  const description = error.digest
    ? `${t("body")} ${t("digestLabel", { digest: error.digest })}`
    : t("body");

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon={<AlertTriangle aria-hidden="true" />}
        title={t("title")}
        description={description}
        action={<Button onClick={reset}>{tActions("retry")}</Button>}
      />
    </div>
  );
}
