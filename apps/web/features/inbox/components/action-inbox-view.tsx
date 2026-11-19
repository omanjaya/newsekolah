"use client";

import { Button, EmptyState, SectionHeader, SkeletonList, domainIcons } from "@newsekolah/ui";
import { CheckCheck, House } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";
import { PermitUnifiedQueue } from "../../permits/components/permit-unified-queue";
import { useCanSubmitPermit } from "../../permits/lib/use-can-submit-permit";
import { type InboxAccess, useInboxAccess } from "../lib/access";
import { useActionInboxSummary } from "../use-action-inbox-count";

import { WarningLetterCandidatesSection } from "./warning-letter-candidates-section";

const PERMITS_HEADING_ID = "inbox-permits";
const ALL_CLEAR_ID = "inbox-all-clear";

/**
 * Where focus goes when a permit sheet closes after its row, and the button
 * that opened it, left the queue with no row left in its place: the permits
 * heading, or the all-clear that replaced the queue once nothing waits.
 */
function focusAfterPermitSheet(): HTMLElement | null {
  return document.getElementById(PERMITS_HEADING_ID) ?? document.getElementById(ALL_CLEAR_ID);
}

/** What decides whether an all-clear reader is offered one of the ways on. */
interface HistoryContext {
  canSubmitPermit: boolean;
  access: InboxAccess;
  duties: readonly string[];
}

/**
 * Where an all-clear reader can still look: the history of the queues they
 * work, where one exists, or the desk they staff. Each link is offered only
 * to the reader whose work it is (and who can open its route): leave
 * requests keep a history only for the student who filed them
 * (/leave-requests sends a reviewer straight back here), warning letters
 * only to an issuer, and the duty desk to a teacher on picket duty. Late
 * arrivals have no history for staff (/late-arrivals redirects here), so
 * none is offered as a way on that would loop.
 */
const HISTORY_LINKS = [
  {
    href: "/leave-requests",
    label: "historyLeave",
    offered: ({ canSubmitPermit }: HistoryContext) => canSubmitPermit,
  },
  {
    href: "/discipline/warning-letters",
    label: "historyWarningLetters",
    offered: ({ access }: HistoryContext) => access.warningLetters,
  },
  {
    href: "/duty",
    label: "openDuty",
    offered: ({ duties }: HistoryContext) => duties.includes("picket"),
  },
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
  // A permit sheet stays up until its reader closes it: approving the last
  // waiting item (or the live push that follows) drops the count to zero,
  // and swapping the queue for the all-clear then would unmount the sheet
  // before its success line could be read.
  const [permitSheetOpen, setPermitSheetOpen] = useState(false);
  // A failed queue must stay visible with its retry, so only an error-free zero is "all clear".
  const allClear =
    !summary.isLoading && !summary.isError && summary.total === 0 && !permitSheetOpen;
  const canSubmitPermit = useCanSubmitPermit();
  const navAccess = navAccessFromMe(me);
  const historyContext: HistoryContext = {
    canSubmitPermit,
    access,
    duties: navAccess.duties ?? [],
  };
  const history = HISTORY_LINKS.find(
    (link) => link.offered(historyContext) && canOpenPath(link.href, navAccess),
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
          id={ALL_CLEAR_ID}
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
              id={PERMITS_HEADING_ID}
              title={t("permits")}
              count={summary.leave + summary.exit + summary.late}
            >
              <PermitUnifiedQueue
                onSheetOpenChange={setPermitSheetOpen}
                returnFocusFallback={focusAfterPermitSheet}
              />
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
