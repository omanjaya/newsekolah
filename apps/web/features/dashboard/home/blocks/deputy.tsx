"use client";

import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  TextLink,
} from "@newsekolah/ui";
import { CheckCheck, Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useInboxAccess } from "../../../inbox/lib/access";
import {
  useActionInboxSummary,
  type ActionInboxSummary,
} from "../../../inbox/use-action-inbox-count";
import { EMPTY_BLOCK, HERO_PRIORITY, type Me, type PersonaBlock } from "../types";

const INBOX_HREF = "/inbox";
const REPORTS_HREF = "/reports";

/** The inbox queues in the order the inbox lists them, with the screen each opens. */
const QUEUES = [
  { key: "leave", href: "/leave-requests" },
  { key: "exit", href: "/exit-permits" },
  { key: "late", href: "/late-arrivals" },
  { key: "warningLetters", href: "/discipline/warning-letters" },
] as const;

type Queue = (typeof QUEUES)[number];

/**
 * A vice principal (the leadership duty on a teacher account): the school
 * snapshot is for the leadership roles only, so this home leads with the
 * decisions waiting in the action inbox, and the reports when none wait.
 */
export function useDeputyBlock(_me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardDuty.deputy");
  const summary = useActionInboxSummary();
  const access = useInboxAccess();
  if (!active) return EMPTY_BLOCK;

  const block: PersonaBlock = { tiles: [], main: [], side: [], pending: summary.isLoading };
  const queues = QUEUES.filter(({ key }) => access[key]);
  const reports = { label: t("reportsAction"), href: REPORTS_HREF };

  if (queues.length === 0) {
    block.hero = {
      key: "deputy.idle",
      priority: HERO_PRIORITY.inboxIdle,
      tone: "neutral",
      eyebrow: t("eyebrow"),
      title: t("reportsTitle"),
      meta: t("reportsMeta"),
      action: reports,
    };
    return block;
  }

  if (!summary.isLoading && !summary.isError) {
    block.tiles.push({
      key: "deputy.inbox",
      priority: 85,
      label: t("tile"),
      value: String(summary.total),
      icon: Inbox,
      tone: "amber",
      href: INBOX_HREF,
    });
    block.hero =
      summary.total > 0
        ? {
            key: "deputy.inbox",
            priority: HERO_PRIORITY.inboxQueue,
            eyebrow: t("eyebrow"),
            title: t("title", { count: summary.total }),
            meta: t("meta"),
            action: { label: t("action"), href: INBOX_HREF },
            secondaryAction: reports,
          }
        : {
            key: "deputy.idle",
            priority: HERO_PRIORITY.inboxIdle,
            tone: "neutral",
            eyebrow: t("eyebrow"),
            title: t("idleTitle"),
            meta: t("idleMeta"),
            action: reports,
          };
  }

  block.main.push({
    key: "deputy.queues",
    node: <DeputyQueueCard summary={summary} queues={queues} />,
  });
  return block;
}

function DeputyQueueCard({
  summary,
  queues,
}: {
  summary: ActionInboxSummary;
  queues: readonly Queue[];
}): ReactElement {
  const t = useTranslations("app.dashboardDuty.deputy");
  const allClear = !summary.isLoading && !summary.isError && summary.total === 0;
  return (
    <Card>
      <CardHeader action={<TextLink href={INBOX_HREF}>{t("cardAction")}</TextLink>}>
        <CardTitle as="h2">{t("cardTitle")}</CardTitle>
      </CardHeader>
      {allClear ? (
        <div className="px-5 pb-5">
          <EmptyState variant="compact" icon={<CheckCheck />} title={t("empty")} />
        </div>
      ) : (
        <List>
          {queues.map(({ key, href }) => (
            <ListRow
              key={key}
              href={href}
              title={t(`queues.${key}`)}
              trailing={
                <Badge tone={summary[key] > 0 ? "warning" : "neutral"} size="sm">
                  {summary.isLoading ? "–" : summary[key]}
                </Badge>
              }
            />
          ))}
        </List>
      )}
    </Card>
  );
}
