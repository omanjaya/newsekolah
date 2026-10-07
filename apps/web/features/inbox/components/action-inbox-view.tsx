"use client";

import { EmptyState, PageHeader, Skeleton, domainIcons } from "@newsekolah/ui";
import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { PermitUnifiedQueue } from "../../permits/components/permit-unified-queue";
import { useInboxAccess } from "../lib/access";
import { useActionInboxSummary } from "../use-action-inbox-count";

import { WarningLetterCandidatesSection } from "./warning-letter-candidates-section";

function InboxSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}): ReactElement {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-fg">
        {title}
        <span className="ml-2 text-sm font-normal text-fg-muted">{count}</span>
      </h2>
      {children}
    </section>
  );
}

/**
 * Everything waiting on the reader in one place. Each section mounts only
 * when the reader holds its permission and renders the existing queue, so
 * its inline actions and detail links are unchanged.
 */
export function ActionInboxView(): ReactElement {
  const t = useTranslations("app.inbox");
  const access = useInboxAccess();
  const summary = useActionInboxSummary();
  const showPermits = access.leave || access.exit || access.late;
  const nothingToShow = !showPermits && !access.warningLetters;
  // A failed queue must stay visible with its retry, so only an error-free zero is "all clear".
  const allClear = !summary.isLoading && !summary.isError && summary.total === 0;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      {summary.isLoading && !nothingToShow && <Skeleton className="h-24 w-full" aria-busy="true" />}
      {(nothingToShow || allClear) && (
        <EmptyState
          icon={
            nothingToShow ? (
              <domainIcons.late aria-hidden="true" />
            ) : (
              <CheckCheck aria-hidden="true" />
            )
          }
          title={t(nothingToShow ? "noAccessTitle" : "emptyTitle")}
          description={t(nothingToShow ? "noAccessBody" : "emptyBody")}
        />
      )}
      {!nothingToShow && !allClear && !summary.isLoading && (
        <>
          {showPermits && (
            <InboxSection title={t("permits")} count={summary.leave + summary.exit + summary.late}>
              <PermitUnifiedQueue />
            </InboxSection>
          )}
          {access.warningLetters && (
            <InboxSection title={t("warningLetters.title")} count={summary.warningLetters}>
              <WarningLetterCandidatesSection />
            </InboxSection>
          )}
        </>
      )}
    </div>
  );
}
