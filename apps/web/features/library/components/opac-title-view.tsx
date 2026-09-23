"use client";

import { Alert, Badge, Skeleton } from "@newsekolah/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useOpacTitleQuery } from "../api";

/**
 * Public title detail with its visible copies, no session required.
 *
 * Copy status labels are kept local (`detail.copyStatus.*`) rather than
 * sharing `app.library.copies.status`: this view renders outside
 * `(app)/library`, under the root provider's narrow `app.library.opac`
 * namespace slice (see `lib/i18n/namespace-sets.ts`), so it cannot reach
 * the rest of the `library` catalog.
 */
export function OpacTitleView({ titleId }: { titleId: string }): ReactElement {
  const t = useTranslations("app.library.opac");
  const locale = useLocale();
  const { data, isLoading, error } = useOpacTitleQuery(titleId);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4 md:p-6">
      <Link
        href="/opac"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-[13px] font-medium text-accent hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("backToSearch")}
      </Link>

      {isLoading ? (
        <Skeleton className="h-64 w-full" aria-busy="true" />
      ) : error || !data ? (
        <Alert variant="warning" title={t("detail.notFoundTitle")}>
          {t("detail.notFoundBody")}
        </Alert>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[22px] font-semibold text-fg">{data.title.title}</h1>
            {data.title.subtitle && (
              <p className="text-[15px] text-fg-muted">{data.title.subtitle}</p>
            )}
            <p className="text-[14px] text-fg-muted">{data.title.author}</p>
          </div>

          <dl className="grid grid-cols-1 gap-2 rounded-sm border border-border bg-surface p-4 text-[13px] sm:grid-cols-2">
            {data.title.publisher && (
              <div>
                <dt className="text-fg-muted">{t("detail.publisher")}</dt>
                <dd className="font-medium text-fg">
                  {data.title.publisher}
                  {data.title.publish_year ? ` (${data.title.publish_year})` : ""}
                </dd>
              </div>
            )}
            {data.title.isbn && (
              <div>
                <dt className="text-fg-muted">{t("detail.isbn")}</dt>
                <dd className="font-medium text-fg">{data.title.isbn}</dd>
              </div>
            )}
            {data.title.classification && (
              <div>
                <dt className="text-fg-muted">{t("detail.classification")}</dt>
                <dd className="font-medium text-fg">{data.title.classification}</dd>
              </div>
            )}
            {data.title.language && (
              <div>
                <dt className="text-fg-muted">{t("detail.language")}</dt>
                <dd className="font-medium text-fg">{languageName(data.title.language, locale)}</dd>
              </div>
            )}
            {data.title.subjects && (
              <div className="sm:col-span-2">
                <dt className="text-fg-muted">{t("detail.subjects")}</dt>
                <dd className="font-medium text-fg">{data.title.subjects}</dd>
              </div>
            )}
          </dl>

          {data.title.abstract && (
            <p className="text-[14px] leading-relaxed text-fg">{data.title.abstract}</p>
          )}

          <div className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold text-fg">
              {t("detail.copiesHeading", { count: data.copies.length })}
            </h2>
            {data.copies.length === 0 ? (
              <p className="text-[13px] text-fg-muted">{t("detail.noCopies")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.copies.map((copy) => (
                  <li
                    key={copy.barcode}
                    className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface p-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="text-[13px] font-medium text-fg">{copy.call_number}</span>
                      <span className="text-[12px] text-fg-muted">{copy.barcode}</span>
                    </div>
                    <Badge variant={copy.status === "available" ? "accent" : "neutral"}>
                      {t(`detail.copyStatus.${copy.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/** "ind" -> "Indonesia": catalogue records store ISO 639 codes. */
function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
