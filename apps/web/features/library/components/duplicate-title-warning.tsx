"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { useLibraryTitleByIsbnQuery } from "../api";

/**
 * Warns when the ISBN being typed into the add-title form already matches a
 * title in the catalogue, so a librarian catches a duplicate before saving
 * it. Separate from the external ISBN lookup, which fills in bibliographic
 * fields rather than checking for an existing local record.
 */
export function DuplicateTitleWarning({ isbn }: { isbn: string }): ReactElement | null {
  const t = useTranslations("app.library.catalogue.duplicateCheck");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(isbn.trim());
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [isbn]);

  const { data, error } = useLibraryTitleByIsbnQuery(debounced);

  if (error && !(error instanceof ApiError && error.status === 404)) return null;
  if (!data) return null;

  return (
    <Alert variant="warning" title={t("title")}>
      {t("body", { title: data.title })}{" "}
      <Link href={`/library/catalogue/${data.id}`} className="underline underline-offset-2">
        {t("view")}
      </Link>
    </Alert>
  );
}
