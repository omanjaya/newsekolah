"use client";

import { queryKeys } from "@newsekolah/api-client";
import { Button, EmptyState } from "@newsekolah/ui";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { PowerOff, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * Rendered in place of a page whose feature module the school has switched
 * off. Distinct from `ForbiddenPage`: the reader's permissions are fine, the
 * feature simply is not part of their school's plan.
 *
 * "Check again" re-reads `/v1/me`: a module switched back on produces no
 * error, so without it the reader would wait for a focus change, the
 * session's polling backstop or a reload. Once the fresh session no longer
 * lists the module, the guard renders the real page on its own.
 */
export function ModuleUnavailablePage(): ReactElement {
  const t = useTranslations("app.moduleUnavailable");
  const queryClient = useQueryClient();
  const checking = useIsFetching({ queryKey: queryKeys.me() }) > 0;

  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <EmptyState
        icon={<PowerOff aria-hidden="true" />}
        title={t("title")}
        description={t("body")}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="secondary"
              icon={<RefreshCw />}
              loading={checking}
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
              }}
            >
              {t("checkAgain")}
            </Button>
            <Button asChild variant="ghost">
              <Link href="/dashboard">{t("backHome")}</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
