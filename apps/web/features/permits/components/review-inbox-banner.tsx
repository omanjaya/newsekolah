"use client";

import { Inbox } from "lucide-react";
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
    <Link
      href="/inbox"
      className="flex min-h-11 flex-wrap items-center gap-x-2 rounded-lg border border-accent/40 bg-accent/5 px-4 py-2 text-[13px] text-fg transition-colors hover:bg-accent/10"
    >
      <Inbox className="size-4 shrink-0" aria-hidden="true" />
      <span className="font-medium">{t("reviewBanner", { count })}</span>
      <span className="underline underline-offset-2">{t("openInbox")}</span>
    </Link>
  );
}
