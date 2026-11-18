"use client";

import { Button, EmptyState, SectionHeader, SkeletonList, domainIcons } from "@newsekolah/ui";
import { CheckCheck, House } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { AppPage } from "../../../components/app-page";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";
import { PermitUnifiedQueue } from "../../permits/components/permit-unified-queue";
import { useCanSubmitPermit } from "../../permits/lib/use-can-submit-permit";
import { useInboxAccess } from "../lib/access";
import { useActionInboxSummary } from "../use-action-inbox-count";

import { WarningLetterCandidatesSection } from "./warning-letter-candidates-section";

/**
 * Where an all-clear reader can still look: the history of the queues they
 * work, where one exists. Leave requests keep a history only for the
 * student who filed them (/leave-requests sends a reviewer straight back
 * here), and late arrivals have none for staff (/late-arrivals does the
 * same), so neither is offered as a way on that would loop.
 */
const HISTORY_LINKS = [
  { href: "/leave-requests", label: "historyLeave", submitterOnly: true },
  { href: "/discipline/warning-letters", label: "historyWarningLetters", submitterOnly: false },
] as const;

function InboxSection({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: number;
  children: ReactNode;
}): ReactElement {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <SectionHeader titleId={id} title={title} count={count} />
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
  const { me } = useSession();
  const access = useInboxAccess();
  const summary = useActionInboxSummary();
  const showPermits = access.leave || access.exit || access.late;
  const nothingToShow = !showPermits && !access.warningLetters;
  // A failed queue must stay visible with its retry, so only an error-free zero is "all clear".
  const allClear = !summary.isLoading && !summary.isError && summary.total === 0;
  const canSubmitPermit = useCanSubmitPermit();
  const navAccess = navAccessFromMe(me);
  const history = HISTORY_LINKS.find(
    (link) => (canSubmitPermit || !link.submitterOnly) && canOpenPath(link.href, navAccess),
  );

  return (
    <AppPage nav={false}>
      {summary.isLoading && !nothingToShow && <SkeletonList rows={3} />}
      {nothingToShow && (
        <EmptyState
          icon={<domainIcons.late aria-hidden="true" />}
          title={t("noAccessTitle")}
          description={t("noAccessBody")}
          action={
            <Button asChild variant="secondary" icon={<House />}>
              <Link href="/dashboard">{t("backHome")}</Link>
            </Button>
          }
        />
      )}
      {!nothingToShow && allClear && (
        <EmptyState
          tone="success"
          icon={<CheckCheck aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            history ? (
              <Button asChild variant="secondary">
                <Link href={history.href}>{t(history.label)}</Link>
              </Button>
            ) : undefined
          }
        />
      )}
      {!nothingToShow && !allClear && !summary.isLoading && (
        <>
          {showPermits && (
            <InboxSection
              id="inbox-permits"
              title={t("permits")}
              count={summary.leave + summary.exit + summary.late}
            >
              <PermitUnifiedQueue />
            </InboxSection>
          )}
          {access.warningLetters && (
            <InboxSection
              id="inbox-warning-letters"
              title={t("warningLetters.title")}
              count={summary.warningLetters}
            >
              <WarningLetterCandidatesSection />
            </InboxSection>
          )}
        </>
      )}
    </AppPage>
  );
}
