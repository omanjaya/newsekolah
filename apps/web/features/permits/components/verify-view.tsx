"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate, formatDateTime } from "@newsekolah/i18n";
import { Alert, Skeleton } from "@newsekolah/ui";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiClient } from "../../../lib/api/client";

type Verification = components["schemas"]["DocumentVerification"];

/** Public check for the code printed on every issued letter. */
export function VerifyView({ code }: { code: string }): ReactElement {
  const t = useTranslations("app.verify");
  const locale = useLocale() as Locale;
  const client = useApiClient();
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.workflowDefinitions(), "verify", code],
    queryFn: () => client.GET("/v1/documents/verify/{code}", { params: { path: { code } } }),
    retry: false,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 p-6">
      <h1 className="text-[22px] font-semibold text-fg">{t("title")}</h1>
      {isLoading ? (
        <Skeleton className="h-48 w-full" aria-busy="true" />
      ) : error || !data ? (
        <Alert variant="warning" title={t("notFoundTitle")}>
          {t("notFoundBody")}
        </Alert>
      ) : (
        <VerificationCard doc={data} locale={locale} />
      )}
    </main>
  );
}

function VerificationCard({ doc, locale }: { doc: Verification; locale: Locale }): ReactElement {
  const t = useTranslations("app.verify");
  return (
    <div className="flex flex-col gap-4">
      <Alert
        variant={doc.revoked ? "warning" : "info"}
        title={doc.revoked ? t("revokedTitle") : t("validTitle")}
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-sm border border-border bg-surface p-4 text-[14px]">
        <dt className="text-fg-muted">{t("number")}</dt>
        <dd className="font-medium">{doc.number}</dd>
        <dt className="text-fg-muted">{t("kind")}</dt>
        <dd>{t.has(`kinds.${doc.kind}`) ? t(`kinds.${doc.kind}`) : doc.kind}</dd>
        <dt className="text-fg-muted">{t("issuedAt")}</dt>
        <dd>{formatDateTime(doc.issued_at, { locale })}</dd>
        {doc.student_name && (
          <>
            <dt className="text-fg-muted">{t("student")}</dt>
            <dd>
              {doc.student_name}
              {doc.class_name ? ` (${doc.class_name})` : ""}
            </dd>
          </>
        )}
        {doc.valid_from && doc.valid_until && (
          <>
            <dt className="text-fg-muted">{t("validity")}</dt>
            <dd>
              {formatDate(doc.valid_from, { locale })} - {formatDate(doc.valid_until, { locale })}
            </dd>
          </>
        )}
      </dl>
      <p className="text-[13px] text-fg-muted">{t("footer")}</p>
    </div>
  );
}
