"use client";

import { Button, StatePage } from "@newsekolah/ui";
import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect } from "react";

export interface RenderErrorStateProps {
  error: Error & { digest?: string };
  /** The error boundary's retry: re-renders the segment that threw. */
  reset: () => void;
}

/**
 * What an error boundary shows when a page throws while rendering: retry
 * first, home second, and the error's digest as the code to quote to
 * support (it matches the server log line). An error thrown in the
 * browser has no digest, so its copy does not promise a code below.
 */
export function RenderErrorState({ error, reset }: RenderErrorStateProps): ReactElement {
  const t = useTranslations("app.error");
  const tActions = useTranslations("common.actions");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatePage
      kind="error"
      title={t("title")}
      description={t(error.digest ? "body" : "bodyNoCode")}
      code={error.digest}
      action={
        <Button icon={<RotateCw />} onClick={reset}>
          {tActions("retry")}
        </Button>
      }
      secondaryAction={
        <Button asChild variant="secondary">
          <Link href="/dashboard">{t("backHome")}</Link>
        </Button>
      }
    />
  );
}
