"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDateTime, type Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  DataList,
  DataListItem,
  Field,
  Input,
  List,
  ListRow,
  Sheet,
  SheetContent,
  SkeletonDetail,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextLink,
  useToast,
} from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  type PlatformModule,
  type PlatformTenantDetail,
  useExportQuery,
  useRequestExportMutation,
  useSetTenantFlagMutation,
  useTenantDetailQuery,
  useTenantFlagsQuery,
  useUpdateTenantDomainMutation,
} from "../api";

import { TENANT_STATUS_TONE } from "./tenant-status";

const MODULES: PlatformModule[] = [
  "library",
  "discipline",
  "grading",
  "permits",
  "announcements",
  "reports",
  "billing",
];

/**
 * One school in a side drawer (a bottom sheet on a phone): its name and
 * status in the header, then tabs for the summary, the feature modules,
 * the custom domain and the data export.
 */
export function TenantDetailSheet({
  tenantId,
  onOpenChange,
}: {
  tenantId: string | null;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.platform.tenants");
  const detail = useTenantDetailQuery(tenantId ?? "");
  const name = tenantId ? detail.data?.name : undefined;

  return (
    <Sheet open={tenantId !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        size="lg"
        title={name ?? t("detail.title")}
        description={
          detail.data
            ? `${t(`level.${detail.data.education_level}`)} · ${detail.data.slug}`
            : undefined
        }
      >
        {tenantId &&
          (detail.isError && !detail.data ? (
            <QueryError retry={() => detail.refetch()} error={detail.error} />
          ) : detail.isLoading || !detail.data ? (
            <SkeletonDetail rows={5} />
          ) : (
            // Keyed on the school, so the domain field starts from its saved value.
            <TenantDetail key={detail.data.id} tenant={detail.data} />
          ))}
      </SheetContent>
    </Sheet>
  );
}

function TenantDetail({ tenant }: { tenant: PlatformTenantDetail }): ReactElement {
  const t = useTranslations("app.platform.tenants");
  const td = useTranslations("app.platform.tenants.detail");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;

  const flags = useTenantFlagsQuery(tenant.id);
  const updateDomain = useUpdateTenantDomainMutation();
  const setFlag = useSetTenantFlagMutation();
  const requestExport = useRequestExportMutation();
  const [domain, setDomain] = useState(tenant.primary_domain ?? "");
  const [exportId, setExportId] = useState("");
  const exportQuery = useExportQuery(tenant.id, exportId);
  const exportView = exportQuery.data;

  const onError = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  const flagByModule = new Map((flags.data?.data ?? []).map((f) => [f.module, f.enabled]));
  const domainDirty = domain.trim() !== (tenant.primary_domain ?? "");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TENANT_STATUS_TONE[tenant.status]}>{t(`status.${tenant.status}`)}</Badge>
        <Badge tone="neutral">{td("userCount", { count: tenant.user_count })}</Badge>
      </div>

      <Tabs defaultValue="summary" className="flex flex-col gap-4">
        <TabsList aria-label={td("sectionsLabel")}>
          <TabsTrigger value="summary">{td("tabs.summary")}</TabsTrigger>
          <TabsTrigger value="modules">{td("tabs.modules")}</TabsTrigger>
          <TabsTrigger value="domain">{td("tabs.domain")}</TabsTrigger>
          <TabsTrigger value="export">{td("tabs.export")}</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <DataList>
            <DataListItem label={td("slug")}>
              <span className="font-mono">{tenant.slug}</span>
            </DataListItem>
            <DataListItem label={td("domainTitle")}>{tenant.primary_domain}</DataListItem>
            <DataListItem label={td("timezone")}>{tenant.timezone}</DataListItem>
            <DataListItem label={t("columns.activeYear")}>
              {tenant.active_academic_year}
            </DataListItem>
            <DataListItem label={t("columns.lastActivity")}>
              {tenant.last_activity_at
                ? formatDateTime(tenant.last_activity_at, { locale, timeZone })
                : t("never")}
            </DataListItem>
            <DataListItem label={td("createdAt")}>
              {formatDateTime(tenant.created_at, { locale, timeZone })}
            </DataListItem>
            <DataListItem label={td("storageBucket")}>
              <span className="font-mono break-all">{tenant.storage_bucket}</span>
            </DataListItem>
          </DataList>
        </TabsContent>

        <TabsContent value="modules" className="flex flex-col gap-3">
          <p className="text-body-sm text-fg-muted">{td("flagsHint")}</p>
          {flags.isError && !flags.data ? (
            <QueryError retry={() => flags.refetch()} error={flags.error} />
          ) : flags.isLoading ? (
            <SkeletonDetail rows={MODULES.length} />
          ) : (
            <List framed>
              {MODULES.map((module) => (
                <ListRow
                  key={module}
                  title={td(`modules.${module}`)}
                  action={
                    <Switch
                      checked={flagByModule.get(module) ?? false}
                      aria-label={td(`modules.${module}`)}
                      onCheckedChange={(enabled) => {
                        setFlag.mutate(
                          { tenantId: tenant.id, module, enabled },
                          {
                            onSuccess: () => {
                              toast.success(
                                enabled
                                  ? td("flagOn", { module: td(`modules.${module}`) })
                                  : td("flagOff", { module: td(`modules.${module}`) }),
                              );
                            },
                            onError,
                          },
                        );
                      }}
                    />
                  }
                />
              ))}
            </List>
          )}
        </TabsContent>

        <TabsContent value="domain">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              updateDomain.mutate(
                { tenantId: tenant.id, domain: domain.trim() },
                {
                  onSuccess: () => {
                    toast.success(td("domainSaved"));
                  },
                  onError,
                },
              );
            }}
          >
            <Field label={td("domainTitle")} hint={td("domainHint")}>
              <Input
                value={domain}
                onChange={(e) => {
                  setDomain(e.target.value);
                }}
                placeholder={td("domainPlaceholder")}
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
            <Button
              type="submit"
              className="self-end"
              disabled={!domainDirty}
              loading={updateDomain.isPending}
            >
              {td("domainSave")}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="export" className="flex flex-col gap-4">
          <p className="text-body-sm text-fg-muted">{td("exportBody")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              loading={requestExport.isPending}
              onClick={() => {
                requestExport.mutate(tenant.id, {
                  onSuccess: (result) => {
                    setExportId(result.id);
                  },
                  onError,
                });
              }}
            >
              {td("exportButton")}
            </Button>
            {exportView && (
              <Badge
                tone={
                  exportView.status === "done"
                    ? "success"
                    : exportView.status === "failed"
                      ? "danger"
                      : "info"
                }
                dot={exportView.status === "pending" || exportView.status === "running"}
              >
                {td(`exportStatus.${exportView.status}`)}
              </Badge>
            )}
            {exportView?.download_url && (
              <TextLink href={exportView.download_url} external>
                <Download className="size-4" aria-hidden="true" />
                {td("exportDownload")}
              </TextLink>
            )}
          </div>
          {exportView?.error_message && (
            <p className="text-body-sm text-danger">{exportView.error_message}</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
