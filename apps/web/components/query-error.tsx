"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button } from "@newsekolah/ui";
import { LogIn, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useContext, type ReactElement, type ReactNode } from "react";

import { useApiErrorMessage } from "../lib/i18n/api-error-message";
import { useSignInAgain } from "../lib/session/end-session";

type Cause = "offline" | "forbidden" | "session" | "failed";

function causeOf(error: unknown): Cause {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  if (error instanceof ApiError) {
    if (error.code === "NETWORK") return "offline";
    if (error.status === 401) return "session";
    if (error.status === 403 || error.code === "FORBIDDEN") return "forbidden";
  }
  return "failed";
}

const TITLE_KEY = {
  offline: "offlineTitle",
  forbidden: "forbiddenTitle",
  session: "sessionTitle",
  failed: "title",
} as const satisfies Record<Cause, string>;

/** True inside a surface that offers one retry for every failed read. */
const SharedRetryContext = createContext(false);

/**
 * Marks a surface (the home, the homeroom summary) whose own notice already
 * offers one "Coba lagi" for every read that failed: while `active`, each
 * `QueryError` inside still says what failed but leaves its own retry out,
 * so a page with five failed cards shows one retry, not six (audit
 * shell-home-3). Off, every error box keeps its button.
 */
export function SharedRetry({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}): ReactElement {
  return <SharedRetryContext.Provider value={active}>{children}</SharedRetryContext.Provider>;
}

/**
 * Its own component so the router and session hooks it needs run only for
 * a 401, not for every failed read.
 */
function SignInAgainButton(): ReactElement {
  const t = useTranslations("app.page.queryError");
  const signInAgain = useSignInAgain();
  return (
    <Button variant="secondary" size="sm" icon={<LogIn />} onClick={signInAgain}>
      {t("signInAgain")}
    </Button>
  );
}

/**
 * Keeps a failed read distinct from both an empty result and a pending
 * request (docs/07-ui-ux.md section 5: what happened, what to do, a
 * button, and a small code for support). A danger alert with "Coba lagi"
 * as its action; pass the query's `error` to name the cause (no
 * connection, no access, session over) and show its code.
 *
 * A 401 means the session is over (the API client already tried a
 * refresh), so a retry cannot work: that case offers "Masuk lagi" instead,
 * which ends the session and opens the sign-in page. A 403 is a refusal
 * the same request will meet again, so it offers no retry at all. Inside
 * an active `SharedRetry` the retry button is left out (the surface
 * offers one).
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
  const sharedRetry = useContext(SharedRetryContext);
  const apiErrorMessage = useApiErrorMessage();
  const cause = causeOf(error);
  const code = error instanceof ApiError ? error.code : undefined;
  const body = apiErrorMessage(cause === "offline" ? "NETWORK" : (code ?? "UNKNOWN"));

  return (
    <Alert
      tone="danger"
      title={t(TITLE_KEY[cause])}
      className={className}
      action={
        cause === "session" ? (
          <SignInAgainButton />
        ) : sharedRetry || cause === "forbidden" ? undefined : (
          <Button variant="secondary" size="sm" icon={<RotateCw />} onClick={() => void retry()}>
            {common("actions.retry")}
          </Button>
        )
      }
    >
      <p>{body}</p>
      {code && code !== "UNKNOWN" && (
        <p className="text-caption tabular-nums select-all">{t("code", { code })}</p>
      )}
    </Alert>
  );
}
