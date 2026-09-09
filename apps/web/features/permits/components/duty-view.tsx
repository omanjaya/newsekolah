"use client";

import { ApiError } from "@newsekolah/api-client";
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type ScanPurpose, encodeScanPayload, useIssueScanTokenMutation } from "../api";

import { QrPanel } from "./qr-panel";

/**
 * The duty teacher's desk (docs/07-ui-ux.md section 4, "Guru piket"): one
 * screen with the QR per purpose, no menu diving. Each QR is a single-use
 * token that renews itself when it expires.
 */
export function DutyView(): ReactElement {
  const t = useTranslations("app.duty");
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="max-w-2xl text-[13px] text-fg-muted">{t("intro")}</p>
      <Tabs defaultValue="classroom_entry">
        <TabsList>
          <TabsTrigger value="classroom_entry">{t("purposes.classroom_entry")}</TabsTrigger>
          <TabsTrigger value="late_arrival">{t("purposes.late_arrival")}</TabsTrigger>
        </TabsList>
        <TabsContent value="classroom_entry" className="pt-4">
          <PurposePanel purpose="classroom_entry" />
        </TabsContent>
        <TabsContent value="late_arrival" className="pt-4">
          <PurposePanel purpose="late_arrival" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PurposePanel({ purpose }: { purpose: ScanPurpose }): ReactElement {
  const t = useTranslations("app.duty");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const issue = useIssueScanTokenMutation();

  useEffect(() => {
    issue.mutate({ purpose });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mint once per purpose on mount
  }, [purpose]);

  function renew() {
    issue.mutate(
      { purpose },
      {
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
      {issue.data ? (
        <QrPanel
          payload={encodeScanPayload(purpose, "", issue.data.token)}
          code={issue.data.token}
          expiresAt={issue.data.expires_at}
          onRenew={renew}
          renewing={issue.isPending}
        />
      ) : (
        <div
          className="h-80 animate-pulse rounded-sm border border-border bg-surface"
          aria-busy="true"
        />
      )}
      <div className="flex flex-col gap-2 text-[13px] text-fg-muted">
        <h2 className="text-[15px] font-medium text-fg">{t(`purposes.${purpose}`)}</h2>
        <p>{t(`help.${purpose}`)}</p>
      </div>
    </div>
  );
}
