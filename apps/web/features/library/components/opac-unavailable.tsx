"use client";

import { Button, EmptyState } from "@newsekolah/ui";
import { PowerOff } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * The "catalogue not available" state for a school that has library
 * switched off. Shown by `OpacGate` before anything mounts, and by the OPAC
 * screens themselves when a request is refused with MODULE_DISABLED because
 * the flag was flipped after the page loaded.
 */
export function OpacUnavailable(): ReactElement {
  const t = useTranslations("app.library.opac");
  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState
        icon={<PowerOff aria-hidden="true" />}
        title={t("unavailableTitle")}
        description={t("unavailableBody")}
        action={
          <Button asChild variant="secondary">
            <Link href="/login">{t("signIn")}</Link>
          </Button>
        }
      />
    </div>
  );
}
