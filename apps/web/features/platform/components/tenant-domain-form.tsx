"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useId, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useUpdateTenantDomainMutation } from "../api";

/**
 * A tenant's custom domain. Mount it only once the tenant detail has
 * loaded (keyed by tenant id) so the field starts from the stored domain
 * instead of the empty value of a first render. Save stays off while the
 * field is empty or unchanged, so an empty domain is never sent.
 */
export function TenantDomainForm({
  tenantId,
  initialDomain,
}: {
  tenantId: string;
  initialDomain: string;
}): ReactElement {
  const td = useTranslations("app.platform.tenants.detail");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const updateDomain = useUpdateTenantDomainMutation();
  const titleId = useId();
  const [domain, setDomain] = useState(initialDomain);

  const trimmed = domain.trim();
  const canSave = trimmed !== "" && trimmed !== initialDomain;

  return (
    <section className="flex flex-col gap-2">
      <h3 id={titleId} className="text-[13px] font-medium">
        {td("domainTitle")}
      </h3>
      <div className="flex gap-2">
        <Input
          aria-labelledby={titleId}
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
          }}
          placeholder={td("domainPlaceholder")}
        />
        <Button
          variant="secondary"
          loading={updateDomain.isPending}
          disabled={!canSave || updateDomain.isPending}
          onClick={() => {
            updateDomain.mutate(
              { tenantId, domain: trimmed },
              {
                onSuccess: () => {
                  toast.success(td("domainSaved"));
                },
                onError: (error) => {
                  toast.error(apiErrorMessage(error instanceof ApiError ? error.code : "UNKNOWN"));
                },
              },
            );
          }}
        >
          {td("domainSave")}
        </Button>
      </div>
    </section>
  );
}
