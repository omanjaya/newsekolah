"use client";

import { Alert, Button } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useActionInboxSummary } from "../../inbox/use-action-inbox-count";

/**
 * Points reviewers at the one place to act. Renders nothing for readers
 * with no permit queue or nothing waiting, so submitters never see it.
 */
export function ReviewInboxBanner(): ReactElement | null {
  const t = useTranslations("app.serviceWorkspace");
  const summary = useActionInboxSummary();
  const count = summary.leave + summary.exit + summary.late;
  if (count === 0) return null;

  return (
    <Alert
      variant="info"
      title={t("reviewBanner", { count })}
      action={
        <Button asChild size="sm" variant="secondary">
          <Link href="/inbox">{t("openInbox")}</Link>
        </Button>
      }
    />
  );
}
