"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, StatePage } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../lib/i18n/api-error-message";

import { AppPage } from "./app-page";

export interface RecordNotFoundPageProps {
  /** What is missing, named for the screen ("Siswa tidak ditemukan"); also the tab title. */
  title: string;
  /** Why, when the screen knows more than the shared sentence (a wrong link or a deleted record). */
  description?: string;
  /** Where the record would be listed, so the reader can look for it again. */
  backHref: string;
  backLabel: string;
}

/**
 * A detail screen whose record does not exist: the id in the address is
 * unknown (a 404) or not an id at all (a truncated or hand-edited link,
 * which the API answers with an INVALID_FORMAT 400). Both are told apart
 * from a failed load with `isNotFoundError` (lib/api/not-found.ts) and get
 * this page instead of a "Coba lagi" that can never succeed: the not-found
 * state with one way back to where such records are listed.
 */
export function RecordNotFoundPage({
  title,
  description,
  backHref,
  backLabel,
}: RecordNotFoundPageProps): ReactElement {
  const t = useTranslations("app.page.recordNotFound");
  return (
    <AppPage title={title} nav={false} header={false}>
      <StatePage
        kind="not-found"
        title={title}
        description={description ?? t("body")}
        action={
          <Button asChild>
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        }
      />
    </AppPage>
  );
}

export interface RecordForbiddenPageProps {
  /** The refused read's error: its code picks the sentence that says why. */
  error: unknown;
  /** Where the reader's own records are listed. */
  backHref: string;
  backLabel: string;
}

/**
 * A detail screen whose record exists but is not the reader's to open:
 * the API answered 403 for this one record (a club another teacher
 * coaches, a group another guru wali mentors), told apart with
 * `isForbiddenError` (lib/api/not-found.ts). It is the no-access state
 * with the API's own reason and one way back, never a "Coba lagi" that
 * can only be refused again or a raw error code.
 */
export function RecordForbiddenPage({
  error,
  backHref,
  backLabel,
}: RecordForbiddenPageProps): ReactElement {
  const t = useTranslations("app.page.recordForbidden");
  const apiErrorMessage = useApiErrorMessage();
  const code = error instanceof ApiError ? error.code : undefined;
  const reason = code && code !== "FORBIDDEN" ? apiErrorMessage(code) : t("body");
  return (
    <AppPage title={t("title")} nav={false} header={false}>
      <StatePage
        kind="forbidden"
        title={t("title")}
        description={reason}
        code="403"
        action={
          <Button asChild>
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        }
      />
    </AppPage>
  );
}
