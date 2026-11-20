"use client";

import type { Locale } from "@newsekolah/i18n";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  EmptyState,
  HeroCard,
  IconCircle,
  List,
  ListRow,
  SectionHeader,
  Skeleton,
  SkeletonList,
  Stat,
  StatGrid,
  domainIcons,
} from "@newsekolah/ui";
import { FileText, HeartPulse, Landmark, Plus, Stamp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import {
  type LeaveCategory,
  type LeaveRequestSummary,
  useLeaveRequestQuery,
  useMyLeaveRequestsQuery,
} from "../api";
import { buildLeaveMineTiles, countLeaveMineStatuses } from "../lib/leave-mine-tiles";
import { formatDayRange } from "../lib/permit-dates";

import { LeaveRequestDetail } from "./leave-request-detail";
import { SubmitForm } from "./leave-request-submit-form";
import { WorkflowMineStageTrack, WorkflowStatusBadge, WorkflowSteps } from "./workflow-stepper";

const CATEGORY_ICON: Record<LeaveCategory, ReactNode> = {
  sick: <HeartPulse />,
  religious_ceremony: <Landmark />,
  dispensation: <Stamp />,
  other: <FileText />,
};

/** A request still on its way: waiting on the homeroom teacher, or on the letter. */
function isActive(item: LeaveRequestSummary): boolean {
  return item.status === "in_progress" || item.status === "approved";
}

/**
 * A student's own leave requests, phone first (docs/07-ui-ux.md section 3,
 * Workflow): the request on its way as the status card, with who it waits
 * on and when each stage was done; one strip of counts; then the history.
 * The "Ajukan izin" action lives in the page header (`LeaveRequestsView`);
 * this component owns the list and the two dialogs it opens.
 */
export function MyLeaveRequests({
  creating,
  onCreatingChange,
  onCreate,
}: {
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
  onCreate: () => void;
}): ReactElement {
  const t = useTranslations("app.permits.leave");
  const locale = useLocale() as Locale;
  const { data, isLoading, isError, refetch } = useMyLeaveRequestsQuery();
  const [openId, setOpenId] = useState<string | null>(null);
  const items = data?.data ?? [];
  const active = items.find(isActive);
  const tiles = buildLeaveMineTiles(countLeaveMineStatuses(items.map((item) => item.status)));
  const history = items.filter((item) => item !== active);

  let body: ReactNode;
  if (isLoading) {
    body = (
      <>
        <Skeleton className="h-44 w-full rounded-xl" />
        <SkeletonList rows={3} leading framed />
      </>
    );
  } else if (isError && !data) {
    body = <QueryError retry={() => refetch()} />;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={<domainIcons.leave aria-hidden="true" />}
        title={t("emptyTitle")}
        description={t("emptyBody")}
        // The header carries the primary; the empty list repeats it quietly.
        action={
          <Button variant="secondary" icon={<Plus />} onClick={onCreate}>
            {t("submit")}
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        {active && (
          <ActiveLeaveCard
            item={active}
            locale={locale}
            onOpen={() => {
              setOpenId(active.instance_id);
            }}
          />
        )}
        <StatGrid variant="strip" data-testid="leave-mine-tiles">
          {tiles.map((tile) => (
            <Stat
              key={tile.key}
              data-testid={`leave-mine-tile-${tile.key}`}
              icon={<tile.icon />}
              category={tile.tone}
              value={tile.value}
              label={t(`mine.${tile.labelKey}`)}
            />
          ))}
        </StatGrid>
        {history.length > 0 && (
          <section className="flex flex-col gap-3" aria-labelledby="leave-history-title">
            <SectionHeader
              titleId="leave-history-title"
              title={t("historyTitle")}
              count={history.length}
            />
            <List framed>
              {history.map((item) => (
                <LeaveRequestRow
                  key={item.instance_id}
                  item={item}
                  locale={locale}
                  onOpen={() => {
                    setOpenId(item.instance_id);
                  }}
                />
              ))}
            </List>
          </section>
        )}
      </>
    );
  }

  return (
    <>
      {body}
      <LeaveRequestFormDialog
        open={creating}
        onOpenChange={onCreatingChange}
        onCreated={(id) => {
          setOpenId(id);
        }}
      />
      <LeaveRequestDetailDialog
        id={openId}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      />
    </>
  );
}

/** The request on its way, as the page's status card: what, when, and each stage. */
function ActiveLeaveCard({
  item,
  locale,
  onOpen,
}: {
  item: LeaveRequestSummary;
  locale: Locale;
  onOpen: () => void;
}): ReactElement {
  const t = useTranslations("app.permits.leave");
  const tWorkflow = useTranslations("app.permits.workflow");
  const detail = useLeaveRequestQuery(item.instance_id);
  const instance = detail.data?.instance;
  const waitingOn = instance?.current_stage?.label;

  return (
    <HeroCard
      data-testid={`leave-mine-card-${item.instance_id}`}
      eyebrow={t("hero.eyebrow")}
      chip={
        item.status === "approved"
          ? t("hero.letterPending")
          : waitingOn
            ? tWorkflow("waitingFor", { stage: waitingOn })
            : tWorkflow(`status.${item.status}`)
      }
      live
      title={t(`categories.${item.category}`)}
      meta={[
        formatDayRange(item.starts_on, item.ends_on, locale),
        t("days", { count: item.school_days }),
      ].join(" · ")}
      action={
        <Button variant="secondary" onClick={onOpen} className="w-full sm:w-auto">
          {t("hero.detail")}
        </Button>
      }
    >
      <Card padding="sm" className="mt-3 text-fg">
        {instance ? (
          <WorkflowSteps instance={instance} />
        ) : (
          <WorkflowMineStageTrack
            status={item.status}
            currentStageIndex={item.current_stage_index}
          />
        )}
      </Card>
    </HeroCard>
  );
}

function LeaveRequestRow({
  item,
  locale,
  onOpen,
}: {
  item: LeaveRequestSummary;
  locale: Locale;
  onOpen: () => void;
}): ReactElement {
  const t = useTranslations("app.permits.leave");
  const meta = [
    formatDayRange(item.starts_on, item.ends_on, locale),
    t("days", { count: item.school_days }),
    ...(item.letter_number ? [t("letterNumberShort", { number: item.letter_number })] : []),
  ].join(" · ");
  return (
    <ListRow
      data-testid={`leave-mine-card-${item.instance_id}`}
      leading={<IconCircle tone="neutral">{CATEGORY_ICON[item.category]}</IconCircle>}
      title={t(`categories.${item.category}`)}
      meta={meta}
      trailing={<WorkflowStatusBadge status={item.status} />}
      onClick={onOpen}
    />
  );
}

function LeaveRequestFormDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}): ReactElement {
  const t = useTranslations("app.permits.leave");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("submit")} description={t("form.description")}>
        {open && (
          <SubmitForm
            onCancel={() => {
              onOpenChange(false);
            }}
            onDone={(id) => {
              onOpenChange(false);
              onCreated(id);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function LeaveRequestDetailDialog({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.permits.leave");
  return (
    <Dialog open={id !== null} onOpenChange={onOpenChange}>
      <DialogContent title={t("detailTitle")} size="lg">
        {id && <LeaveRequestDetail id={id} />}
      </DialogContent>
    </Dialog>
  );
}
