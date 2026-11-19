"use client";

import { Button, StatePage } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

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
