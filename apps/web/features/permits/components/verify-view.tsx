"use client";

import { ApiError, queryKeys, type components } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate, formatDateTime } from "@newsekolah/i18n";
import {
  Button,
  Card,
  CardTitle,
  cn,
  DataList,
  DataListItem,
  IconCircle,
  Skeleton,
  type Tone,
} from "@newsekolah/ui";
import { useQuery } from "@tanstack/react-query";
import { FileQuestion, RotateCw, ShieldCheck, ShieldX, WifiOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { PUBLIC_CONTAINER } from "../../../components/public-container";
import { useApiClient } from "../../../lib/api/client";
import { useTenant } from "../../../lib/tenant/tenant-provider";

type Verification = components["schemas"]["DocumentVerification"];

/**
 * Public check for the code printed on every issued letter, opened by
 * whoever scans it (a parent, a guard, another school). The verdict is the
 * page: a large icon in its tone (green genuine, red revoked, amber
 * unknown), one title, one sentence, then the document's facts. The school
 * that issued it is named in the frame's header and in the sentence.
 */
export function VerifyView({ code }: { code: string }): ReactElement {
  const t = useTranslations("app.verify");
  const locale = useLocale() as Locale;
  const client = useApiClient();
  const { displayName } = useTenant();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: [...queryKeys.workflowDefinitions(), "verify", code],
    queryFn: () => client.GET("/v1/documents/verify/{code}", { params: { path: { code } } }),
    retry: false,
  });
  // The API answering that the code matches nothing (404) or is not a code
  // at all (400) is a verdict on the code. Anything else (no network, a
  // server error, the rate limit) is not, so it gets a retry instead.
  const failed = error !== null && !isVerdictOnCode(error);

  return (
    <div className={cn(PUBLIC_CONTAINER, "flex flex-col items-center gap-5 py-8 md:py-14")}>
      <Card className="w-full max-w-xl" aria-busy={isLoading || undefined}>
        {isLoading ? (
          <VerdictSkeleton />
        ) : failed ? (
          <Verdict
            tone="neutral"
            icon={<WifiOff />}
            title={t("errorTitle")}
            body={t("errorBody")}
            footer={
              <Button
                variant="secondary"
                icon={<RotateCw />}
                loading={isFetching}
                onClick={() => void refetch()}
              >
                {t("retry")}
              </Button>
            }
          />
        ) : !data ? (
          <Verdict
            tone="warning"
            icon={<FileQuestion />}
            title={t("notFoundTitle")}
            body={t("notFoundBody")}
          >
            <DataList>
              <DataListItem label={t("code")}>
                <span className="font-mono [overflow-wrap:anywhere]">{code}</span>
              </DataListItem>
            </DataList>
          </Verdict>
        ) : (
          <Verdict
            tone={data.revoked ? "danger" : "success"}
            icon={data.revoked ? <ShieldX /> : <ShieldCheck />}
            title={data.revoked ? t("revokedTitle") : t("validTitle")}
            body={
              data.revoked
                ? t("revokedBody", { school: displayName })
                : t("validBody", { school: displayName })
            }
          >
            <DocumentFacts doc={data} code={code} locale={locale} />
          </Verdict>
        )}
      </Card>
      <p className="max-w-xl text-center text-caption text-fg-muted">{t("footer")}</p>
    </div>
  );
}

function isVerdictOnCode(error: Error): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 400);
}

function Verdict({
  tone,
  icon,
  title,
  body,
  children,
  footer,
}: {
  tone: Tone;
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
  footer?: ReactNode;
}): ReactElement {
  const t = useTranslations("app.verify");
  return (
    <div className="flex animate-enter flex-col">
      <div
        role={tone === "danger" ? "alert" : "status"}
        className="flex flex-col items-center gap-4 px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10"
      >
        <IconCircle tone={tone} size="xl">
          {icon}
        </IconCircle>
        <div className="flex flex-col gap-2">
          <p className="text-body-sm text-fg-muted">{t("title")}</p>
          <CardTitle as="h1" className="text-display">
            {title}
          </CardTitle>
          <p className="text-body text-balance text-fg-muted">{body}</p>
        </div>
        {footer}
      </div>
      {children && <div className="border-t border-line px-5 sm:px-6">{children}</div>}
    </div>
  );
}

function DocumentFacts({
  doc,
  code,
  locale,
}: {
  doc: Verification;
  code: string;
  locale: Locale;
}): ReactElement {
  const t = useTranslations("app.verify");
  return (
    <DataList>
      <DataListItem label={t("number")}>
        <span className="font-semibold tabular-nums">{doc.number}</span>
      </DataListItem>
      <DataListItem label={t("kind")}>
        {t.has(`kinds.${doc.kind}`) ? t(`kinds.${doc.kind}`) : doc.kind}
      </DataListItem>
      {doc.student_name && (
        <DataListItem label={t("student")}>
          {doc.student_name}
          {doc.class_name ? ` (${doc.class_name})` : ""}
        </DataListItem>
      )}
      <DataListItem label={t("issuedAt")}>{formatDateTime(doc.issued_at, { locale })}</DataListItem>
      {doc.valid_from && doc.valid_until && (
        <DataListItem label={t("validity")}>
          {formatDate(doc.valid_from, { locale })} – {formatDate(doc.valid_until, { locale })}
        </DataListItem>
      )}
      <DataListItem label={t("code")}>
        <span className="font-mono [overflow-wrap:anywhere]">{code}</span>
      </DataListItem>
    </DataList>
  );
}

function VerdictSkeleton(): ReactElement {
  return (
    <div className="flex flex-col items-center gap-4 px-6 pb-8 pt-8 sm:px-10 sm:pt-10">
      <Skeleton className="size-14 rounded-full" />
      <Skeleton className="h-3.5 w-28 rounded-full" />
      <Skeleton className="h-8 w-56 max-w-full rounded-full" />
      <Skeleton className="h-4 w-72 max-w-full rounded-full" />
    </div>
  );
}
