"use client";

import { ApiError } from "@newsekolah/api-client";
import { Badge, Button, Skeleton, useToast } from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useExportQuery, useRequestExportMutation, useTenantDetailQuery } from "../api";

import { TenantDomainForm } from "./tenant-domain-form";
import { TenantModuleFlags } from "./tenant-module-flags";

/**
 * One tenant's summary, custom domain, module switches and data export.
 * With `multiTenant` false (a single-tenant deployment) only the summary
 * and the module switches show: the API refuses custom domains and exports
 * there.
 */
export function TenantDetailPanel({
  tenantId,
  multiTenant = true,
}: {
  tenantId: string;
  multiTenant?: boolean;
}): ReactElement {
  const t = useTranslations("app.platform.tenants");
  const td = useTranslations("app.platform.tenants.detail");

  const { data: detail, isLoading, isError, refetch } = useTenantDetailQuery(tenantId);

  if (isError && !detail) return <QueryError retry={refetch} />;

  if (isLoading || !detail) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={detail.status === "active" ? "accent" : "neutral"}>
          {t(`status.${detail.status}`)}
        </Badge>
        <span className="text-[13px] text-fg-muted">{t(`level.${detail.education_level}`)}</span>
        <span className="text-[13px] text-fg-muted">
          {td("storageBucket")}: {detail.storage_bucket || "-"}
        </span>
      </div>

      {multiTenant && (
        <TenantDomainForm
          key={tenantId}
          tenantId={tenantId}
          initialDomain={detail.primary_domain ?? ""}
        />
      )}

      <TenantModuleFlags tenantId={tenantId} />

      {multiTenant && <TenantExportSection tenantId={tenantId} />}
    </div>
  );
}

function TenantExportSection({ tenantId }: { tenantId: string }): ReactElement {
  const td = useTranslations("app.platform.tenants.detail");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const requestExport = useRequestExportMutation();
  const [exportId, setExportId] = useState("");
  const exportView = useExportQuery(tenantId, exportId).data;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-medium">{td("exportTitle")}</h3>
      <p className="text-[13px] text-fg-muted">{td("exportBody")}</p>
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          loading={requestExport.isPending}
          onClick={() => {
            requestExport.mutate(tenantId, {
              onSuccess: (result) => {
                const id = result.id;
                if (id) setExportId(id);
              },
              onError: (error) => {
                toast.error(apiErrorMessage(error instanceof ApiError ? error.code : "UNKNOWN"));
              },
            });
          }}
        >
          {td("exportButton")}
        </Button>
        {exportView && (
          <span className="text-[13px] text-fg-muted">
            {td(`exportStatus.${exportView.status}`)}
          </span>
        )}
        {exportView?.download_url && (
          <a
            href={exportView.download_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
          >
            <Download className="size-4" aria-hidden="true" />
            {td("exportDownload")}
          </a>
        )}
      </div>
    </section>
  );
}
