"use client";

import { ApiError } from "@newsekolah/api-client";
import { Badge, Button, Input, Skeleton, Switch, useToast } from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type PlatformModule,
  useExportQuery,
  useRequestExportMutation,
  useSetTenantFlagMutation,
  useTenantDetailQuery,
  useTenantFlagsQuery,
  useUpdateTenantDomainMutation,
} from "../api";

const MODULES: PlatformModule[] = [
  "library",
  "discipline",
  "grading",
  "permits",
  "announcements",
  "reports",
];

export function TenantDetailPanel({ tenantId }: { tenantId: string }): ReactElement {
  const t = useTranslations("app.platform.tenants");
  const td = useTranslations("app.platform.tenants.detail");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const { data, isLoading } = useTenantDetailQuery(tenantId);
  const detail = data;
  const flags = useTenantFlagsQuery(tenantId);
  const updateDomain = useUpdateTenantDomainMutation();
  const setFlag = useSetTenantFlagMutation();
  const requestExport = useRequestExportMutation();

  const [domain, setDomain] = useState(detail?.primary_domain ?? "");
  const [exportId, setExportId] = useState("");

  const exportQuery = useExportQuery(tenantId, exportId);

  const onError = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  if (isLoading || !detail) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const flagByModule = new Map((flags.data?.data ?? []).map((f) => [f.module, f.enabled]));
  const exportView = exportQuery.data;

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

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-medium">{td("domainTitle")}</h3>
        <div className="flex gap-2">
          <Input
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
            }}
            placeholder={td("domainPlaceholder")}
          />
          <Button
            variant="secondary"
            loading={updateDomain.isPending}
            onClick={() => {
              updateDomain.mutate(
                { tenantId, domain },
                {
                  onSuccess: () => {
                    toast.success(td("domainSaved"));
                  },
                  onError,
                },
              );
            }}
          >
            {td("domainSave")}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-medium">{td("flagsTitle")}</h3>
        {flags.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-sm border border-border">
            {MODULES.map((module) => (
              <li key={module} className="flex items-center justify-between gap-4 px-3 py-2">
                <span className="text-[13px]">{td(`modules.${module}`)}</span>
                <Switch
                  checked={flagByModule.get(module) ?? false}
                  onCheckedChange={(enabled) => {
                    setFlag.mutate(
                      { tenantId, module, enabled },
                      {
                        onSuccess: () => {
                          toast.success(td("flagUpdated"));
                        },
                        onError,
                      },
                    );
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

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
                onError,
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
    </div>
  );
}
