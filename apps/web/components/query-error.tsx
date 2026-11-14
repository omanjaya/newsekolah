"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button } from "@newsekolah/ui";
import { RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../lib/i18n/api-error-message";

type Cause = "offline" | "forbidden" | "failed";

function causeOf(error: unknown): Cause {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  if (error instanceof ApiError) {
    if (error.code === "NETWORK") return "offline";
    if (error.status === 403 || error.code === "FORBIDDEN") return "forbidden";
  }
  return "failed";
}

/**
 * Keeps a failed read distinct from both an empty result and a pending
 * request (docs/07-ui-ux.md section 5: what happened, what to do, a
 * button, and a small code for support). A danger alert with "Coba lagi"
 * as its action; pass the query's `error` to name the cause (no
 * connection, no access) and show its code.
 */
export function QueryError({
  retry,
  error,
  className,
}: {
  retry: () => unknown;
  /** The query's error, when the caller has it: picks the message and adds the code. */
  error?: unknown;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.page.queryError");
  const common = useTranslations("common");
  const apiErrorMessage = useApiErrorMessage();
  const cause = causeOf(error);
  const code = error instanceof ApiError ? error.code : undefined;
  const title =
    cause === "offline"
      ? t("offlineTitle")
      : cause === "forbidden"
        ? t("forbiddenTitle")
        : t("title");
  const body = apiErrorMessage(cause === "offline" ? "NETWORK" : (code ?? "UNKNOWN"));

  return (
    <Alert
      tone="danger"
      title={title}
      className={className}
      action={
        <Button variant="secondary" size="sm" icon={<RotateCw />} onClick={() => void retry()}>
          {common("actions.retry")}
        </Button>
      }
    >
      <p>{body}</p>
      {code && code !== "UNKNOWN" && (
        <p className="text-caption tabular-nums select-all">{t("code", { code })}</p>
      )}
    </Alert>
  );
}
