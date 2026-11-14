"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  SectionHeader,
  SkeletonList,
  TextLink,
} from "@newsekolah/ui";
import { AlarmClock, CheckCheck, DoorOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { QueryError } from "../../../../components/query-error";
import { isModuleEnabled } from "../../../../lib/modules/feature-modules";
import {
  type ExitPermitSummary,
  type LateArrivalSummary,
  useExitPermitReviewQueueQuery,
  useLateArrivalQueueQuery,
} from "../../../permits/api";
import {
  type ClassRef,
  type DirectoryUser,
  useClassesQuery,
  useLookup,
} from "../../../reference/api";
import { useDirectoryNames } from "../../../reference/directory-names";
import { EMPTY_BLOCK, HERO_PRIORITY } from "../types";
import type { Me, PersonaBlock } from "../types";

const DUTY_HREF = "/duty";
const SCAN_HREF = "/scan";
const LATE_ARRIVALS_HREF = "/late-arrivals";
const EXIT_PERMITS_HREF = "/exit-permits";
const QUEUE_PREVIEW_SIZE = 5;
/** A list inside a section of the card lines its rows up with the card header's 20px inset. */
const SECTION_LIST_INSET = "[--list-inset:var(--space-5)]";

interface QueueState {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * The duty teacher's home block: today's late-arrival queue and the
 * exit-permit review queue, with the duty desk QR as the way forward when
 * nothing waits ("Piket hari ini", docs/07 section 4).
 */
export function usePicketBlock(me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardDuty");
  // Both queues are permits data: with the module off there is no picket work.
  const permitsOn = isModuleEnabled(me, "permits");
  const live = active && permitsOn;
  const late = useLateArrivalQueueQuery(live);
  const exit = useExitPermitReviewQueueQuery(live);
  const lateRows = late.data?.data ?? [];
  const students = useDirectoryNames(
    lateRows.slice(0, QUEUE_PREVIEW_SIZE).map((row) => row.student_user_id),
    live,
  );
  const classes = useClassesQuery(live);
  const classMap = useLookup(classes.data?.data);

  if (!live) return EMPTY_BLOCK;

  const block: PersonaBlock = {
    tiles: [],
    main: [],
    side: [],
    pending: late.isLoading || exit.isLoading,
  };

  const lateItems = !late.isLoading && !late.isError ? lateRows : undefined;
  const exitItems = !exit.isLoading && !exit.isError ? (exit.data?.data ?? []) : undefined;

  if (lateItems) {
    block.tiles.push({
      key: "picket.late",
      priority: 88,
      label: t("picket.tileLateLabel"),
      value: String(lateItems.length),
      icon: AlarmClock,
      tone: "amber",
      href: LATE_ARRIVALS_HREF,
    });
  }
  if (exitItems) {
    block.tiles.push({
      key: "picket.exit",
      priority: 86,
      label: t("picket.tileExitLabel"),
      value: String(exitItems.length),
      icon: DoorOpen,
      tone: "blue",
      href: EXIT_PERMITS_HREF,
    });
  }

  if (lateItems && lateItems.length > 0) {
    block.hero = {
      key: "picket.late",
      priority: HERO_PRIORITY.picketQueue,
      eyebrow: t("picket.heroEyebrow"),
      title: t("picket.heroTitle", { count: lateItems.length }),
      meta: t("picket.heroMeta"),
      action: { label: t("picket.heroAction"), href: LATE_ARRIVALS_HREF },
      secondaryAction: { label: t("picket.qrAction"), href: DUTY_HREF },
    };
  } else if (lateItems && exitItems) {
    const exitWaiting = exitItems.length;
    block.hero = {
      key: "picket.idle",
      priority: HERO_PRIORITY.picketIdle,
      tone: exitWaiting > 0 ? "accent-soft" : "neutral",
      eyebrow: t("picket.heroEyebrow"),
      title:
        exitWaiting > 0 ? t("picket.exitTitle", { count: exitWaiting }) : t("picket.idleTitle"),
      meta: exitWaiting > 0 ? t("picket.exitMeta") : t("picket.idleMeta"),
      action:
        exitWaiting > 0
          ? { label: t("picket.exitAction"), href: EXIT_PERMITS_HREF }
          : { label: t("picket.qrAction"), href: DUTY_HREF },
      secondaryAction:
        exitWaiting > 0
          ? { label: t("picket.qrAction"), href: DUTY_HREF }
          : { label: t("picket.scanAction"), href: SCAN_HREF },
    };
  }

  block.main.push({
    key: "picket.queue",
    node: (
      <PicketQueueCard
        key="picket.queue"
        late={late}
        exit={exit}
        lateItems={lateItems}
        exitItems={exitItems}
        students={students}
        classMap={classMap}
      />
    ),
  });

  return block;
}

/** One titled part of the duty queue card, with its own "see all" link. */
function QueueSection({
  title,
  href,
  query,
  empty,
  children,
}: {
  title: string;
  href: string;
  query: QueueState;
  empty: string | null;
  children: ReactNode;
}): ReactElement {
  const t = useTranslations("app.dashboardDuty");
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        as="h3"
        title={title}
        className="px-5"
        action={<TextLink href={href}>{t("picket.seeAll")}</TextLink>}
      />
      {query.isLoading ? (
        <div className="px-5 pt-2">
          <SkeletonList rows={2} framed={false} />
        </div>
      ) : query.isError ? (
        <div className="px-5 pt-2">
          <QueryError retry={query.refetch} error={query.error} />
        </div>
      ) : empty !== null ? (
        <div className="px-5">
          <EmptyState variant="compact" icon={<CheckCheck />} title={empty} />
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function PicketQueueCard({
  late,
  exit,
  lateItems,
  exitItems,
  students,
  classMap,
}: {
  late: QueueState;
  exit: QueueState;
  lateItems: LateArrivalSummary[] | undefined;
  exitItems: ExitPermitSummary[] | undefined;
  students: Map<string, DirectoryUser>;
  classMap: Map<string, ClassRef>;
}): ReactElement {
  const t = useTranslations("app.dashboardDuty");
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("picket.cardTitle")}</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-4 pb-3">
        <QueueSection
          title={t("picket.lateSectionTitle")}
          href={LATE_ARRIVALS_HREF}
          query={late}
          empty={lateItems?.length === 0 ? t("picket.lateEmpty") : null}
        >
          <List className={SECTION_LIST_INSET}>
            {(lateItems ?? []).slice(0, QUEUE_PREVIEW_SIZE).map((item) => {
              const className = item.class_id ? classMap.get(item.class_id)?.name : undefined;
              return (
                <ListRow
                  key={item.instance_id}
                  href={LATE_ARRIVALS_HREF}
                  title={students.get(item.student_user_id)?.name ?? t("picket.unknownStudent")}
                  meta={[className, item.reason].filter(Boolean).join(" · ")}
                  trailing={t("picket.occurrence", { count: item.occurrence_number })}
                />
              );
            })}
          </List>
        </QueueSection>
        <QueueSection
          title={t("picket.exitSectionTitle")}
          href={EXIT_PERMITS_HREF}
          query={exit}
          empty={exitItems?.length === 0 ? t("picket.exitEmpty") : null}
        >
          <List className={SECTION_LIST_INSET}>
            {(exitItems ?? []).slice(0, QUEUE_PREVIEW_SIZE).map((item) => (
              <ListRow
                key={item.instance_id}
                href={EXIT_PERMITS_HREF}
                title={item.student_name ?? t("picket.unknownStudent")}
                meta={[item.class_name, item.destination].filter(Boolean).join(" · ")}
              />
            ))}
          </List>
        </QueueSection>
      </div>
    </Card>
  );
}
