"use client";

import { ApiError } from "@newsekolah/api-client";
import { Skeleton, Switch, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useId } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { FEATURE_MODULES, type FeatureModule } from "../../../lib/modules/feature-modules";
import { useSetTenantFlagMutation, useTenantFlagsQuery } from "../api";

/**
 * The on/off switch of every toggleable module of one tenant. The rows come
 * from FEATURE_MODULES (the web mirror of the API's AllModules), not from
 * the flags response, so a module always has a row even while its flag is
 * missing; feature_flags is opt-out, so a missing flag reads as on.
 */
export function TenantModuleFlags({ tenantId }: { tenantId: string }): ReactElement {
  const td = useTranslations("app.platform.tenants.detail");
  const flags = useTenantFlagsQuery(tenantId);

  if (flags.isError && !flags.data) return <QueryError retry={flags.refetch} />;
  if (flags.isLoading || !flags.data) return <Skeleton className="h-40 w-full" />;

  const enabledByModule = new Map<string, boolean>(
    flags.data.data.map((f) => [f.module, f.enabled]),
  );

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-medium">{td("flagsTitle")}</h3>
      <p className="text-[13px] text-fg-muted">{td("flagsBody")}</p>
      <ul className="flex flex-col divide-y divide-border rounded-sm border border-border">
        {FEATURE_MODULES.map((module) => (
          <ModuleFlagRow
            key={module}
            tenantId={tenantId}
            module={module}
            enabled={enabledByModule.get(module) ?? true}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * One module's switch. Each row owns its mutation, so its toasts always
 * belong to its own request even when the admin toggles several rows at
 * once. While the save (and the session refresh after it) is in flight the
 * switch shows the requested state and ignores further clicks; on failure
 * it falls back to the server's value.
 */
function ModuleFlagRow({
  tenantId,
  module,
  enabled,
}: {
  tenantId: string;
  module: FeatureModule;
  enabled: boolean;
}): ReactElement {
  const td = useTranslations("app.platform.tenants.detail");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const setFlag = useSetTenantFlagMutation();
  const labelId = useId();

  const label = td(`modules.${module}`);
  const pending = setFlag.isPending;
  const checked = pending ? setFlag.variables.enabled : enabled;

  return (
    <li className="flex items-center justify-between gap-4 px-3 py-2">
      <span id={labelId} className="text-[13px]">
        {label}
      </span>
      <Switch
        aria-labelledby={labelId}
        aria-busy={pending || undefined}
        checked={checked}
        disabled={pending}
        onCheckedChange={(next) => {
          setFlag.mutate(
            { tenantId, module, enabled: next },
            {
              onSuccess: () => {
                toast.success(td(next ? "flagEnabled" : "flagDisabled", { module: label }));
              },
              onError: (error) => {
                const reason = apiErrorMessage(error instanceof ApiError ? error.code : "UNKNOWN");
                toast.error(td("flagFailed", { module: label, reason }));
              },
            },
          );
        }}
      />
    </li>
  );
}
